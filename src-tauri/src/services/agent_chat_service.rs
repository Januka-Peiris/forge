use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::Emitter;

use crate::models::{
    AgentChatEvent, AgentChatEventEnvelope, AgentChatSession, CreateAgentChatSessionInput,
    SendAgentChatMessageInput,
};
use crate::repositories::{agent_chat_repository, workspace_repository};
use crate::services::{
    agent_profile_service, checkpoint_service, environment_service, task_lifecycle_service,
    terminal_service,
};
use crate::state::AppState;

mod parser;
use parser::parse_adapter_line;

pub fn create_agent_chat_session(
    state: &AppState,
    input: CreateAgentChatSessionInput,
) -> Result<AgentChatSession, String> {
    let workspace = workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    let cwd = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let provider = normalize_provider(&input.provider);
    let title = input
        .title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| default_title(&provider).to_string());
    let now = timestamp();
    let session = AgentChatSession {
        id: format!("agent-chat-{}", unique_suffix()),
        workspace_id: input.workspace_id,
        provider: provider.clone(),
        status: "idle".to_string(),
        title,
        provider_session_id: if matches!(provider.as_str(), "claude_code" | "kimi_code") {
            Some(pseudo_uuid())
        } else {
            None
        },
        cwd,
        raw_output: String::new(),
        created_at: now.clone(),
        updated_at: now,
        ended_at: None,
        closed_at: None,
    };
    agent_chat_repository::insert_session(&state.db, &session)?;
    if let Ok(task_run_id) = task_lifecycle_service::start_task_run(
        state,
        &session.workspace_id,
        "agent_chat",
        Some(&session.id),
    ) {
        task_lifecycle_service::append_task_event(
            state,
            &task_run_id,
            &session.workspace_id,
            "agent_chat_session_created",
            serde_json::json!({ "sessionId": session.id, "provider": session.provider }),
        );
    }
    Ok(session)
}

pub fn list_agent_chat_sessions(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<AgentChatSession>, String> {
    agent_chat_repository::list_sessions_for_workspace(&state.db, workspace_id)
}

pub fn list_agent_chat_events(
    state: &AppState,
    session_id: &str,
) -> Result<Vec<AgentChatEvent>, String> {
    agent_chat_repository::list_events_for_session(&state.db, session_id)
}

pub fn send_agent_chat_message(
    state: &AppState,
    input: SendAgentChatMessageInput,
) -> Result<AgentChatEvent, String> {
    let session = agent_chat_repository::get_session(&state.db, &input.session_id)?
        .ok_or_else(|| format!("Agent chat session {} was not found", input.session_id))?;
    if session.status == "running" {
        return Err(
            "Agent chat session is already running. Interrupt it or wait for completion."
                .to_string(),
        );
    }
    let mut prompt = input.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }

    if let Some(metadata) = workspace_mcp_metadata(state, &session.workspace_id) {
        if !prompt.contains("Forge workspace MCP config:") {
            prompt = format!("{metadata}\n\nUser request:\n{prompt}");
        }
    }

    let user_metadata = serde_json::json!({
        "taskMode": input.task_mode.clone(),
        "claudeAgent": input.claude_agent.clone(),
        "model": input.model.clone(),
        "reasoning": input.reasoning.clone(),
    });
    let should_resume_provider_session =
        agent_chat_repository::list_events_for_session(&state.db, &session.id)?
            .iter()
            .any(|event| event.event_type == "user_message");
    let user_event = append_event(
        state,
        &session,
        EventInput {
            event_type: "user_message",
            role: Some("user"),
            title: None,
            body: &prompt,
            status: None,
            metadata: Some(user_metadata),
        },
    )?;
    if let Err(err) = checkpoint_service::create_checkpoint_if_dirty(
        state,
        &session.workspace_id,
        "before agent chat run",
    ) {
        log::warn!(
            target: "forge_lib",
            "failed to create pre-chat checkpoint for workspace {}: {err}",
            session.workspace_id
        );
    }
    agent_chat_repository::update_session_status(&state.db, &session.id, "running", None)?;
    let running_session =
        agent_chat_repository::get_session(&state.db, &session.id)?.unwrap_or(session);
    let _ = append_event(
        state,
        &running_session,
        EventInput {
            event_type: "status",
            role: None,
            title: Some("Running"),
            body: "Agent started.",
            status: Some("running"),
            metadata: None,
        },
    );
    start_adapter_process(
        state.clone(),
        running_session,
        prompt,
        input,
        should_resume_provider_session,
    )?;
    Ok(user_event)
}

fn workspace_mcp_metadata(state: &AppState, workspace_id: &str) -> Option<String> {
    let profile = agent_profile_service::list_workspace_agent_profiles(state, Some(workspace_id))
        .ok()?
        .into_iter()
        .find(|profile| profile.agent == "claude_code")?;
    let metadata = agent_profile_service::prompt_metadata_preamble_for_workspace(
        state,
        Some(workspace_id),
        &profile,
        None,
        None,
    );
    metadata
        .contains("Forge workspace MCP config:")
        .then_some(metadata)
}

pub fn interrupt_agent_chat_session(
    state: &AppState,
    session_id: &str,
) -> Result<AgentChatSession, String> {
    if let Ok(mut processes) = state.processes.lock() {
        if let Some(process) = processes.remove(session_id) {
            if let Ok(mut child_slot) = process.lock() {
                if let Some(child) = child_slot.as_mut() {
                    let _ = child.kill();
                }
                *child_slot = None;
            }
        }
    }
    let ended = timestamp();
    agent_chat_repository::update_session_status(
        &state.db,
        session_id,
        "interrupted",
        Some(&ended),
    )?;
    let session = agent_chat_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Agent chat session {session_id} was not found"))?;
    let _ = append_event(
        state,
        &session,
        EventInput {
            event_type: "status",
            role: None,
            title: Some("Interrupted"),
            body: "Agent was interrupted.",
            status: Some("interrupted"),
            metadata: None,
        },
    );
    Ok(session)
}

pub fn close_agent_chat_session(
    state: &AppState,
    session_id: &str,
) -> Result<AgentChatSession, String> {
    if let Ok(Some(session)) = agent_chat_repository::get_session(&state.db, session_id) {
        if session.status == "running" {
            let _ = interrupt_agent_chat_session(state, session_id);
        }
    }
    let closed = timestamp();
    agent_chat_repository::close_session(&state.db, session_id, &closed)?;
    agent_chat_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Agent chat session {session_id} was not found"))
}

fn start_adapter_process(
    state: AppState,
    session: AgentChatSession,
    prompt: String,
    input: SendAgentChatMessageInput,
    resume_provider_session: bool,
) -> Result<(), String> {
    let mut command =
        command_for_session(&state, &session, &prompt, &input, resume_provider_session)?;
    command
        .current_dir(&session.cwd)
        .env("PATH", terminal_service::enriched_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start {} adapter: {err}", session.provider))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child_slot = Arc::new(Mutex::new(Some(child)));
    state
        .processes
        .lock()
        .map_err(|_| "Process registry lock poisoned".to_string())?
        .insert(session.id.clone(), child_slot.clone());

    if let Some(stdout) = stdout {
        let state_for_stdout = state.clone();
        let session_for_stdout = session.clone();
        thread::spawn(move || read_stdout(state_for_stdout, session_for_stdout, stdout));
    }
    if let Some(stderr) = stderr {
        let state_for_stderr = state.clone();
        let session_for_stderr = session.clone();
        thread::spawn(move || read_stderr(state_for_stderr, session_for_stderr, stderr));
    }

    thread::spawn(move || wait_for_process(state, session, child_slot));
    Ok(())
}

fn command_for_session(
    state: &AppState,
    session: &AgentChatSession,
    prompt: &str,
    input: &SendAgentChatMessageInput,
    resume_provider_session: bool,
) -> Result<Command, String> {
    match session.provider.as_str() {
        "claude_code" => {
            let command_path = resolve_binary("claude")?;
            let mut command = Command::new(command_path);
            command.arg("-p");
            command.args(["--output-format", "stream-json"]);
            command.arg("--verbose");
            command.arg("--include-partial-messages");
            if let Some(provider_session_id) = session.provider_session_id.as_deref() {
                if resume_provider_session {
                    command.args(["--resume", provider_session_id]);
                } else {
                    command.args(["--session-id", provider_session_id]);
                }
            }
            if let Some(reasoning) = input.reasoning.as_deref().and_then(normalize_reasoning) {
                command.args(["--effort", reasoning]);
            }
            if let Some(model) = input
                .model
                .as_deref()
                .filter(|model| !model.trim().is_empty())
            {
                command.args(["--model", model.trim()]);
            }
            if let Some(agent) = input
                .claude_agent
                .as_deref()
                .and_then(normalize_claude_agent)
            {
                command.args(["--agent", agent]);
            }
            if input
                .task_mode
                .as_deref()
                .is_some_and(|mode| mode.eq_ignore_ascii_case("plan"))
            {
                command.args(["--permission-mode", "plan"]);
            }
            command.arg(prompt);
            Ok(command)
        }
        "codex" => {
            let command_path = resolve_binary("codex")?;
            let mut command = Command::new(command_path);
            command.args(["exec", "--json", "--cd", &session.cwd]);
            if let Some(reasoning) = input
                .reasoning
                .as_deref()
                .and_then(normalize_codex_reasoning)
            {
                command.args(["-c", &format!("model_reasoning_effort=\"{reasoning}\"")]);
            }
            command.arg(prompt);
            Ok(command)
        }
        "kimi_code" => {
            let command_path = resolve_binary("kimi")?;
            let mut command = Command::new(command_path);
            command.args([
                "--print",
                "--output-format=stream-json",
                "--work-dir",
                &session.cwd,
            ]);
            if let Some(provider_session_id) = session.provider_session_id.as_deref() {
                if resume_provider_session {
                    command.args(["--resume", provider_session_id]);
                } else {
                    command.args(["--session", provider_session_id]);
                }
            }
            if let Some(model) = input
                .model
                .as_deref()
                .filter(|model| !model.trim().is_empty())
            {
                command.args(["--model", model.trim()]);
            }
            if let Some(thinking) = input.reasoning.as_deref().and_then(normalize_kimi_thinking) {
                command.arg(thinking);
            }
            command.args(["--prompt", prompt]);
            Ok(command)
        }
        "local_llm" => {
            let profile = agent_profile_service::resolve_agent_profile(
                state,
                Some(&session.workspace_id),
                input.profile_id.as_deref(),
                None,
            )?;
            let command_path = resolve_binary(&profile.command)?;
            let mut command = Command::new(command_path);
            command.current_dir(&session.cwd);

            // For Ollama/local LLMs, we usually just pass the prompt as an argument or via stdin.
            // Here we'll follow the same pattern as Codex/Claude for consistency if the CLI supports it,
            // or fallback to a simple 'run' or 'chat' command.
            if profile.command == "ollama" {
                command.args(["run", profile.model.as_deref().unwrap_or("llama3")]);
            } else {
                command.args(&profile.args);
            }

            command.arg(prompt);
            Ok(command)
        }
        other => Err(format!("Unsupported agent provider: {other}")),
    }
}

fn read_stdout(state: AppState, session: AgentChatSession, stdout: impl Read) {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let raw = format!("{line}\n");
        let _ = agent_chat_repository::append_raw_output(&state.db, &session.id, &raw);
        let events = parse_adapter_line(&session.provider, &line);
        for parsed in events {
            let _ = append_event(
                &state,
                &session,
                EventInput {
                    event_type: &parsed.event_type,
                    role: parsed.role.as_deref(),
                    title: parsed.title.as_deref(),
                    body: &parsed.body,
                    status: parsed.status.as_deref(),
                    metadata: parsed.metadata,
                },
            );
        }
    }
}

fn read_stderr(state: AppState, session: AgentChatSession, stderr: impl Read) {
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        let raw = format!("[stderr] {line}\n");
        let _ = agent_chat_repository::append_raw_output(&state.db, &session.id, &raw);
        if !line.trim().is_empty() && should_surface_diagnostic_line(&session.provider, &line) {
            let _ = append_event(
                &state,
                &session,
                EventInput {
                    event_type: "diagnostic",
                    role: None,
                    title: Some("Diagnostic"),
                    body: line.trim(),
                    status: None,
                    metadata: None,
                },
            );
        }
    }
}

fn should_surface_diagnostic_line(provider: &str, line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    if provider != "codex" {
        return true;
    }

    // Codex may emit MCP auth noise to stderr when optional MCP servers are configured
    // but not authenticated. Keep this in Raw output while avoiding chat clutter.
    let lower = trimmed.to_lowercase();
    !(lower.contains("reading additional input from stdin")
        || lower.contains("rmcp::transport::worker: worker quit with fatal")
        || lower.contains("transport channel closed")
        || lower.contains("authrequired(authrequirederror")
        || lower.contains("no access token was provided in this request"))
}

fn wait_for_process(
    state: AppState,
    session: AgentChatSession,
    child_slot: Arc<Mutex<Option<std::process::Child>>>,
) {
    let status = loop {
        let maybe_status = {
            match child_slot.lock() {
                Ok(mut guard) => match guard.as_mut() {
                    Some(child) => child.try_wait().ok().flatten(),
                    None => return,
                },
                Err(_) => return,
            }
        };
        if let Some(status) = maybe_status {
            break status;
        }
        thread::sleep(Duration::from_millis(200));
    };
    if let Ok(mut guard) = child_slot.lock() {
        *guard = None;
    }
    if let Ok(mut processes) = state.processes.lock() {
        processes.remove(&session.id);
    }
    let final_status = if status.success() {
        "succeeded"
    } else {
        "failed"
    };
    let task_run_id = format!("task-{}-agent_chat-{}", session.workspace_id, session.id);
    task_lifecycle_service::append_task_event(
        &state,
        &task_run_id,
        &session.workspace_id,
        if status.success() {
            "agent_chat_completed"
        } else {
            "agent_chat_failed"
        },
        serde_json::json!({ "exitCode": status.code() }),
    );
    let _ = task_lifecycle_service::mark_task_run_completed(&state, &task_run_id, final_status);
    let ended = timestamp();
    let _ = agent_chat_repository::update_session_status(
        &state.db,
        &session.id,
        final_status,
        Some(&ended),
    );
    if let Ok(Some(updated)) = agent_chat_repository::get_session(&state.db, &session.id) {
        let _ = append_event(
            &state,
            &updated,
            EventInput {
                event_type: if status.success() { "result" } else { "error" },
                role: None,
                title: Some(if status.success() {
                    "Run result"
                } else {
                    "Run failed"
                }),
                body: if status.success() {
                    "Agent run completed successfully."
                } else {
                    "Agent run failed. Open diagnostics for details."
                },
                status: Some(final_status),
                metadata: Some(serde_json::json!({ "exitCode": status.code() })),
            },
        );
        let _ = append_event(
            &state,
            &updated,
            EventInput {
                event_type: "status",
                role: None,
                title: Some(if status.success() { "Done" } else { "Failed" }),
                body: if status.success() {
                    "Agent finished."
                } else {
                    "Agent exited with an error."
                },
                status: Some(final_status),
                metadata: Some(serde_json::json!({ "exitCode": status.code() })),
            },
        );
    }
}

struct EventInput<'a> {
    event_type: &'a str,
    role: Option<&'a str>,
    title: Option<&'a str>,
    body: &'a str,
    status: Option<&'a str>,
    metadata: Option<Value>,
}

fn append_event(
    state: &AppState,
    session: &AgentChatSession,
    input: EventInput<'_>,
) -> Result<AgentChatEvent, String> {
    let seq = agent_chat_repository::next_event_seq(&state.db, &session.id)?;
    let event = AgentChatEvent {
        id: format!("agent-chat-event-{}", unique_suffix()),
        session_id: session.id.clone(),
        seq,
        event_type: input.event_type.to_string(),
        role: input.role.map(str::to_string),
        title: input.title.map(str::to_string),
        body: input.body.to_string(),
        status: input.status.map(str::to_string),
        metadata: input.metadata,
        created_at: timestamp(),
    };
    agent_chat_repository::insert_event(&state.db, &event)?;
    let latest_session = agent_chat_repository::get_session(&state.db, &session.id)?
        .unwrap_or_else(|| session.clone());
    let _ = state.app_handle.emit(
        "forge://agent-chat-event",
        AgentChatEventEnvelope {
            workspace_id: session.workspace_id.clone(),
            session: latest_session,
            event: event.clone(),
        },
    );
    Ok(event)
}

fn normalize_provider(provider: &str) -> String {
    match provider.trim().to_lowercase().as_str() {
        "claude" | "claude-code" | "claude_code" => "claude_code".to_string(),
        "codex" => "codex".to_string(),
        "kimi" | "kimi-code" | "kimi_code" => "kimi_code".to_string(),
        "local" | "local_llm" | "ollama" => "local_llm".to_string(),
        _ => "claude_code".to_string(),
    }
}

fn default_title(provider: &str) -> &'static str {
    match provider {
        "codex" => "Codex Chat",
        "kimi_code" => "Kimi Chat",
        "local_llm" => "Local LLM Chat",
        _ => "Claude Chat",
    }
}

fn resolve_binary(binary: &str) -> Result<String, String> {
    environment_service::find_binary(binary)
        .map_err(|err| format!("Failed to resolve {binary}: {err}"))?
        .map(|path| path.display().to_string())
        .ok_or_else(|| format!("{binary} CLI was not found on PATH"))
}

fn normalize_reasoning(input: &str) -> Option<&'static str> {
    match input.to_lowercase().as_str() {
        "low" => Some("low"),
        "medium" => Some("medium"),
        "high" => Some("high"),
        "extra high" | "extra_high" | "xhigh" => Some("xhigh"),
        "max" => Some("max"),
        _ => None,
    }
}

fn normalize_claude_agent(input: &str) -> Option<&'static str> {
    match input.trim() {
        "Explore" => Some("Explore"),
        "Plan" => Some("Plan"),
        "general-purpose" => Some("general-purpose"),
        "statusline-setup" => Some("statusline-setup"),
        "superpowers:code-reviewer" => Some("superpowers:code-reviewer"),
        _ => None,
    }
}

fn normalize_codex_reasoning(input: &str) -> Option<&'static str> {
    match input.to_lowercase().as_str() {
        "low" => Some("low"),
        "medium" => Some("medium"),
        "high" => Some("high"),
        _ => None,
    }
}

fn normalize_kimi_thinking(input: &str) -> Option<&'static str> {
    match input.trim().to_lowercase().as_str() {
        "on" | "true" | "thinking" | "enabled" => Some("--thinking"),
        "off" | "false" | "no-thinking" | "disabled" => Some("--no-thinking"),
        _ => None,
    }
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos}")
}

fn pseudo_uuid() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let value = nanos ^ (pid << 64);
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        (value >> 96) as u32,
        (value >> 80) as u16,
        ((value >> 64) as u16) & 0x0fff,
        ((value >> 48) as u16) & 0x0fff,
        value & 0x0000_ffff_ffff_ffff
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claude_text_and_tool_jsonl() {
        let text = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello"},{"type":"tool_use","name":"Bash","input":{"command":"npm test"}}]}}"#;
        let events = parse_adapter_line("claude_code", text);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "assistant_message");
        assert_eq!(events[0].body, "hello");
        assert_eq!(events[1].event_type, "command");
        assert_eq!(events[1].body, "npm test");
    }

    #[test]
    fn ignores_claude_final_result_duplicate_text() {
        let events = parse_adapter_line(
            "claude_code",
            r#"{"type":"result","subtype":"success","result":"hello"}"#,
        );
        assert!(events.is_empty());
    }

    #[test]
    fn parses_claude_thinking_stream_event() {
        let events = parse_adapter_line(
            "claude_code",
            r#"{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"thinking","thinking":""}}}"#,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "thinking");
    }

    #[test]
    fn ignores_claude_text_delta_to_avoid_duplicate_final_messages() {
        let events = parse_adapter_line(
            "claude_code",
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}}"#,
        );
        assert!(events.is_empty());
    }

    #[test]
    fn maps_claude_file_read_and_todo_tools_to_structured_events() {
        let events = parse_adapter_line(
            "claude_code",
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/main.rs"}},{"type":"tool_use","name":"TodoWrite","input":{"todos":[{"content":"ship it"}]}}]}}"#,
        );
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "file_read");
        assert_eq!(events[0].body, "src/main.rs");
        assert_eq!(events[1].event_type, "todo");
    }

    #[test]
    fn parses_codex_jsonl_message_and_command() {
        let events = parse_adapter_line("codex", r#"{"type":"message","message":"done"}"#);
        assert_eq!(events[0].body, "done");
        let events =
            parse_adapter_line("codex", r#"{"type":"exec_command","command":"cargo test"}"#);
        assert_eq!(events[0].event_type, "command");
    }

    #[test]
    fn parses_local_llm_markdown_output() {
        let text = "Here is the fix:\n\n```rust\nfn main() {}\n```";
        let events = parse_adapter_line("local_llm", text);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "assistant_message");
        assert_eq!(events[0].body, text);
    }

    #[test]
    fn parses_kimi_assistant_and_tool_messages() {
        let events = parse_adapter_line(
            "kimi_code",
            r#"{"role":"assistant","content":"I'll run tests.","tool_calls":[{"type":"function","id":"tc_1","function":{"name":"Shell","arguments":"{\"command\":\"cargo test\"}"}}]}"#,
        );
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "assistant_message");
        assert_eq!(events[1].event_type, "command");

        let tool_result = parse_adapter_line(
            "kimi_code",
            r#"{"role":"tool","tool_call_id":"tc_1","content":"ok"}"#,
        );
        assert_eq!(tool_result.len(), 1);
        assert_eq!(tool_result[0].event_type, "tool_result");
    }
}
