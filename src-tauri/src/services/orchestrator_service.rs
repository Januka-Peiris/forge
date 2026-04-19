use std::sync::atomic::Ordering;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::Emitter;

use crate::models::{OrchestratorAction, QueueAgentPromptInput};
use crate::repositories::{
    activity_repository, orchestrator_repository, terminal_repository, workspace_repository,
};
use crate::services::{conflict_detection_service, terminal_service};
use crate::state::AppState;

/// How often the orchestrator evaluates workspace states.
const ORCHESTRATOR_INTERVAL_SECS: u64 = 5 * 60;
/// Only flag an agent stuck if it has been silent for at least this long.
const STUCK_THRESHOLD_SECS: u64 = 300;

pub fn start_orchestrator_loop(state: AppState) {
    std::thread::spawn(move || {
        // Initial delay so app startup is unaffected.
        std::thread::sleep(Duration::from_secs(ORCHESTRATOR_INTERVAL_SECS));
        loop {
            if state.orchestrator_enabled.load(Ordering::Relaxed) {
                if let Err(err) = run_orchestrator_pass(&state) {
                    log::warn!(target: "forge_lib", "orchestrator pass failed: {err}");
                }
            }
            std::thread::sleep(Duration::from_secs(ORCHESTRATOR_INTERVAL_SECS));
        }
    });
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn run_orchestrator_pass(state: &AppState) -> Result<(), String> {
    let model = state
        .orchestrator_model
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "claude-opus-4-6".to_string());

    let workspaces = workspace_repository::list(&state.db)?;
    let active: Vec<_> = workspaces
        .into_iter()
        .filter(|w| w.status != "Merged")
        .collect();

    if active.is_empty() {
        return Ok(());
    }

    let conflicts = conflict_detection_service::detect_workspace_conflicts(&state.db)
        .unwrap_or_else(|_| crate::models::workspace_conflict::WorkspaceConflicts {
            conflicts: vec![],
            conflicting_workspace_ids: vec![],
        });

    let now = now_secs();
    let run_at = now.to_string();

    // Build context lines per workspace.
    let terminals_registry = state.terminals.lock().map_err(|e| e.to_string())?;
    let mut context_lines: Vec<String> = Vec::new();
    let workspace_ids: Vec<String> = active.iter().map(|w| w.id.clone()).collect();

    for ws in &active {
        let sessions =
            terminal_repository::list_for_workspace(&state.db, &ws.id).unwrap_or_default();

        // Find the agent session (if running).
        let agent_session = sessions
            .iter()
            .find(|s| s.session_role == "agent" && s.status == "running" && s.closed_at.is_none());

        let stuck_label = if let Some(session) = agent_session {
            let last_secs = terminals_registry
                .get(&session.id)
                .map(|a| a.last_output_at_secs.load(Ordering::Relaxed))
                .unwrap_or(0);
            if last_secs > 0 && now.saturating_sub(last_secs) >= STUCK_THRESHOLD_SECS {
                let mins = now.saturating_sub(last_secs) / 60;
                format!("STUCK ({mins}m silent)")
            } else {
                "running".to_string()
            }
        } else if sessions
            .iter()
            .any(|s| s.status == "running" && s.closed_at.is_none())
        {
            "running (non-agent session)".to_string()
        } else {
            "idle".to_string()
        };

        let files_summary = if ws.changed_files.is_empty() {
            "no changed files".to_string()
        } else {
            ws.changed_files
                .iter()
                .take(5)
                .map(|f| format!("{} (+{}/−{})", f.path, f.additions, f.deletions))
                .collect::<Vec<_>>()
                .join(", ")
        };

        let conflict_note = conflicts
            .conflicts
            .iter()
            .filter(|c| c.workspace_id_a == ws.id || c.workspace_id_b == ws.id)
            .map(|c| {
                let other = if c.workspace_id_a == ws.id {
                    &c.workspace_id_b
                } else {
                    &c.workspace_id_a
                };
                format!(
                    "⚠️ FILE CONFLICT with {}: {}",
                    other,
                    c.shared_files.join(", ")
                )
            })
            .collect::<Vec<_>>()
            .join(" | ");

        let mut block = format!(
            "[WORKSPACE {}]\nName: {}\nRepo: {} | Branch: {}\nTask: {}\nSession: {}\nFiles: {}",
            ws.id,
            ws.name,
            ws.repo,
            ws.branch,
            if ws.current_task.is_empty() {
                "(no task set)"
            } else {
                &ws.current_task
            },
            stuck_label,
            files_summary,
        );
        if !conflict_note.is_empty() {
            block.push('\n');
            block.push_str(&conflict_note);
        }
        context_lines.push(block);
    }

    drop(terminals_registry);

    let workspace_context = context_lines.join("\n\n");
    let prompt = format!(
        r#"You are the Forge Orchestrator — the strategic brain coordinating multiple AI coding agents (Claude Sonnet, Codex) running in parallel git worktrees.

Your role:
- Detect stuck agents and send a short actionable nudge
- Alert agents to cross-workspace file conflicts they should coordinate on
- Provide brief strategic direction when an agent seems lost

Current workspace states (unix timestamp: {now}):

{workspace_context}

Available actions — respond with a JSON array ONLY (no explanation, no markdown):
[
  {{"action": "send_prompt", "workspace_id": "...", "prompt": "short actionable message to the agent"}},
  {{"action": "notify", "workspace_id": "...", "message": "message shown to the user as a notification"}}
]

Rules:
- Be conservative — only act when clearly needed
- send_prompt goes directly into the coding agent's terminal input
- Keep prompts short (1-3 sentences), actionable, and specific
- If no intervention is needed, respond with exactly: []
- Do NOT include "idle" actions — just omit workspaces that need nothing"#
    );

    let response = if is_openai_model(&model) {
        call_openai_api(&model, &prompt)?
    } else {
        let output = std::process::Command::new("claude")
            .args(["--model", &model, "-p", &prompt])
            .output()
            .map_err(|e| format!("Failed to run claude CLI: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("claude CLI failed: {stderr}"));
        }
        String::from_utf8_lossy(&output.stdout).into_owned()
    };
    let actions = parse_actions(&response);

    log::info!(
        target: "forge_lib",
        "orchestrator ran with model {model}: {} action(s)",
        actions.len()
    );

    // Execute actions.
    for action in &actions {
        match action.action.as_str() {
            "send_prompt" => {
                if let (Some(ws_id), Some(prompt_text)) =
                    (action.workspace_id.as_deref(), action.prompt.as_deref())
                {
                    let input = QueueAgentPromptInput {
                        workspace_id: ws_id.to_string(),
                        prompt: prompt_text.to_string(),
                        profile: None,
                        profile_id: None,
                        task_mode: None,
                        reasoning: Some("orchestrator".to_string()),
                        mode: Some("send_now".to_string()),
                    };
                    if let Err(err) = terminal_service::queue_workspace_agent_prompt(state, input) {
                        log::warn!(
                            target: "forge_lib",
                            "orchestrator: failed to send prompt to {ws_id}: {err}"
                        );
                    }
                    let ws = workspace_ids.iter().find(|id| id.as_str() == ws_id);
                    if let Some(ws_id) = ws {
                        let _ = activity_repository::record(
                            &state.db,
                            ws_id,
                            "",
                            None,
                            "Orchestrator intervention",
                            "info",
                            Some(prompt_text),
                        );
                    }
                }
            }
            "notify" => {
                let ws_id = action.workspace_id.as_deref().unwrap_or("");
                let message = action.message.as_deref().unwrap_or("");
                let _ = state.app_handle.emit(
                    "forge://orchestrator-notify",
                    serde_json::json!({
                        "workspaceId": ws_id,
                        "message": message,
                    }),
                );
            }
            _ => {}
        }
    }

    // Persist log + update state.
    let _ =
        orchestrator_repository::insert_log(&state.db, &run_at, &model, &workspace_ids, &actions);

    if let Ok(mut last_run) = state.orchestrator_last_run.lock() {
        *last_run = Some(run_at);
    }
    if let Ok(mut last_actions) = state.orchestrator_last_actions.lock() {
        *last_actions = actions;
    }

    Ok(())
}

fn is_openai_model(model: &str) -> bool {
    model.starts_with("gpt-")
        || model.starts_with("o1")
        || model.starts_with("o3")
        || model.starts_with("o4")
}

fn call_openai_api(model: &str, prompt: &str) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY environment variable not set".to_string())?;

    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}]
    });

    let client = reqwest::blocking::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("OpenAI API error {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .map_err(|e| format!("OpenAI response parse error: {e}"))?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| "OpenAI response missing content".to_string())?
        .to_string();

    Ok(content)
}

/// Extract a JSON array of actions from the model response.
/// The model is instructed to return only JSON, but may wrap it in markdown fences.
fn parse_actions(response: &str) -> Vec<OrchestratorAction> {
    let text = response.trim();
    // Strip ```json ... ``` or ``` ... ``` fences if present.
    let json_text = if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            &text[start..=end]
        } else {
            text
        }
    } else {
        text
    };
    serde_json::from_str::<Vec<OrchestratorAction>>(json_text).unwrap_or_default()
}
