use std::io::Write;

use crate::models::{AgentPromptEntry, QueueAgentPromptInput};
use crate::repositories::{agent_memory_repository, terminal_repository};
use crate::services::{
    agent_context_service, agent_profile_service, checkpoint_service, hook_service,
    terminal_service,
};
use crate::state::AppState;

use super::output::unique_suffix;
use super::prompts::terminal_prompt_payload_for_session;
use super::runtime::{active_for_workspace, ensure_agent_session_for_prompt};

pub(super) fn queue_workspace_agent_prompt(
    state: &AppState,
    input: QueueAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    let user_prompt = input.prompt.trim().to_string();
    if user_prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }

    let resolved_profile = agent_profile_service::resolve_agent_profile(
        state,
        Some(&input.workspace_id),
        input.profile_id.as_deref(),
        input.profile.as_deref(),
    )?;

    let is_first_prompt = {
        let active_session = terminal_repository::get_active_session_id_for_workspace(
            &state.db,
            &input.workspace_id,
        )
        .unwrap_or(None);
        match active_session {
            None => true,
            Some(session_id) => {
                terminal_repository::count_sent_prompts_for_session(&state.db, &session_id)
                    .unwrap_or(1)
                    == 0
            }
        }
    };

    // -- Collect memory recall (needed for all prompt types) --
    let relevant_memories = if !user_prompt.contains("Mnemonic memory recall:") {
        agent_memory_repository::list_relevant_for_prompt(
            &state.db,
            &input.workspace_id,
            &user_prompt,
            5,
        )
        .unwrap_or_default()
    } else {
        Vec::new()
    };
    let memory_block = if !relevant_memories.is_empty() {
        let lines = relevant_memories
            .iter()
            .map(|memory| format!("- {}: {}", memory.key, memory.value))
            .collect::<Vec<_>>()
            .join("\n");
        let now = terminal_service::timestamp();
        for memory in relevant_memories {
            let _ = agent_memory_repository::upsert(
                &state.db,
                agent_memory_repository::AgentMemoryUpsert {
                    workspace_id: memory.workspace_id.as_deref(),
                    scope: Some(memory.scope.as_str()),
                    key: &memory.key,
                    value: &memory.value,
                    origin: Some(memory.origin.as_str()),
                    status: Some(memory.status.as_str()),
                    confidence: Some(memory.confidence),
                    source_task_run_id: memory.source_task_run_id.as_deref(),
                    source_label: memory.source_label.as_deref(),
                    source_detail: memory.source_detail.as_deref(),
                    last_used_at: Some(&now),
                },
            );
        }
        Some(format!("Mnemonic memory recall:\n{lines}"))
    } else {
        None
    };

    let is_cli_agent = matches!(
        resolved_profile.agent.as_str(),
        "claude_code" | "codex"
    );

    let is_plan_mode = input
        .task_mode
        .as_deref()
        .is_some_and(|mode| mode.eq_ignore_ascii_case("plan"));

    // -- Build the final prompt with context prepended --
    let prompt = {
        let mut prefix_parts: Vec<String> = Vec::new();

        if is_first_prompt {
            if !is_cli_agent {
                let metadata = agent_profile_service::prompt_metadata_preamble_for_workspace(
                    state,
                    Some(&input.workspace_id),
                    &resolved_profile,
                    input.task_mode.as_deref(),
                    input.reasoning.as_deref(),
                );
                prefix_parts.push(metadata);
            }

            if let Ok(context) =
                agent_context_service::get_workspace_agent_context(state, &input.workspace_id)
            {
                if !context.prompt_preamble.trim().is_empty() {
                    prefix_parts.push(context.prompt_preamble.trim().to_string());
                }
            }

            let context_enabled =
                crate::repositories::settings_repository::get_value(&state.db, "context_enabled")
                    .unwrap_or_default()
                    .map(|value| value != "false")
                    .unwrap_or(true);
            if context_enabled {
                if let Some(context_block) =
                    agent_context_service::build_session_open_context(state, &input.workspace_id)
                {
                    prefix_parts.push(context_block);
                }
            }
        }

        if let Some(block) = memory_block {
            prefix_parts.push(block);
        }
        if is_plan_mode {
            prefix_parts.push(PLAN_MODE_RESPONSE_INSTRUCTIONS.to_string());
        }

        if prefix_parts.is_empty() {
            user_prompt
        } else {
            let prefix = prefix_parts.join("\n\n");
            format!("{prefix}\n\n{user_prompt}")
        }
    };

    let profile = resolved_profile.id.clone();
    let mut entry = AgentPromptEntry {
        id: format!("prompt-{}", unique_suffix()),
        workspace_id: input.workspace_id.clone(),
        session_id: None,
        profile,
        prompt,
        status: "queued".to_string(),
        created_at: terminal_service::timestamp(),
        sent_at: None,
        model: input.model.clone(),
    };
    terminal_repository::insert_prompt_entry(&state.db, &entry)?;

    let mode = input.mode.unwrap_or_else(|| "send_now".to_string());
    if mode == "send_now" {
        let hook_context = serde_json::json!({
            "workspaceId": input.workspace_id,
            "actionKind": "queue_agent_prompt",
            "profileId": entry.profile,
            "taskMode": input.task_mode,
        });
        hook_service::run_workspace_hooks(
            state,
            &entry.workspace_id,
            "tool",
            hook_service::HookPhase::Pre,
            &hook_context,
        )?;
        dispatch_prompt_entry(state, &mut entry)?;
        let _ = hook_service::run_workspace_hooks(
            state,
            &entry.workspace_id,
            "tool",
            hook_service::HookPhase::Post,
            &hook_context,
        );
    }
    Ok(entry)
}

const PLAN_MODE_RESPONSE_INSTRUCTIONS: &str = "Mnemonic Plan mode instructions:\n- Stay in planning mode: do not make file edits or run mutating commands.\n- Explore only as needed to make the plan decision-complete.\n- When you are ready to present the final implementation plan, wrap only the plan Markdown in <proposed_plan> and </proposed_plan> tags so Mnemonic can render it as an actionable plan card.";

pub(super) fn batch_dispatch_workspace_agent_prompt(
    state: &AppState,
    input: crate::models::BatchDispatchPromptInput,
) -> Result<Vec<AgentPromptEntry>, String> {
    if input.prompt.trim().is_empty() {
        return Err("Prompt is required".to_string());
    }
    let mut entries = Vec::with_capacity(input.workspace_ids.len());
    for workspace_id in &input.workspace_ids {
        let result = queue_workspace_agent_prompt(
            state,
            QueueAgentPromptInput {
                workspace_id: workspace_id.clone(),
                prompt: input.prompt.clone(),
                profile: None,
                profile_id: input.profile_id.clone(),
                task_mode: input.task_mode.clone(),
                reasoning: input.reasoning.clone(),
                mode: Some("send_now".to_string()),
                model: None,
            },
        );
        match result {
            Ok(entry) => entries.push(entry),
            Err(err) => log::warn!(
                target: "mnemonic_lib",
                "batch_dispatch: failed for workspace {workspace_id}: {err}"
            ),
        }
    }
    Ok(entries)
}

pub(super) fn run_next_workspace_agent_prompt(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<AgentPromptEntry>, String> {
    let mut entry =
        match terminal_repository::latest_queued_prompt_for_workspace(&state.db, workspace_id)? {
            Some(entry) => entry,
            None => return Ok(None),
        };
    dispatch_prompt_entry(state, &mut entry)?;
    Ok(Some(entry))
}

pub(super) fn list_workspace_agent_prompts(
    state: &AppState,
    workspace_id: &str,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    terminal_repository::list_prompts_for_workspace(&state.db, workspace_id, limit)
}

fn dispatch_prompt_entry(
    state: &AppState,
    entry: &mut AgentPromptEntry,
) -> Result<(), String> {
    checkpoint_service::create_checkpoint_if_dirty_in_background(
        state.clone(),
        entry.workspace_id.clone(),
        "before agent prompt".to_string(),
    );

    let (session, _is_new_session) =
        ensure_agent_session_for_prompt(state, &entry.workspace_id, &entry.profile, None, entry.model.as_deref())?;

    let active = active_for_workspace(state, &entry.workspace_id, "agent")?
        .ok_or_else(|| "No active agent session found to send prompt".to_string())?;
    let mut writer = active
        .writer
        .lock()
        .map_err(|_| "Terminal writer lock poisoned".to_string())?;

    writer
        .write_all(terminal_prompt_payload_for_session(&session, &entry.prompt).as_bytes())
        .map_err(|err| format!("Failed to write prompt to terminal: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush prompt to terminal: {err}"))?;

    let sent_at = terminal_service::timestamp();
    terminal_repository::mark_prompt_sent(&state.db, &entry.id, &session.id, &sent_at)?;
    entry.session_id = Some(session.id.clone());
    entry.status = "sent".to_string();
    entry.sent_at = Some(sent_at);
    Ok(())
}
