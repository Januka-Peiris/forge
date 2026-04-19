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
    agent_profile_service, checkpoint_service, environment_service, terminal_service,
};
use crate::state::AppState;

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
        provider_session_id: if provider == "claude_code" {
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
        "user_message",
        Some("user"),
        None,
        &prompt,
        None,
        Some(user_metadata),
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
        "status",
        None,
        Some("Running"),
        "Agent started.",
        Some("running"),
        None,
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
    let profile = agent_profile_service::default_profiles()
        .into_iter()
        .find(|profile| profile.id == "claude-default")?;
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
        "status",
        None,
        Some("Interrupted"),
        "Agent was interrupted.",
        Some("interrupted"),
        None,
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
    let mut command = command_for_session(&session, &prompt, &input, resume_provider_session)?;
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
                &parsed.event_type,
                parsed.role.as_deref(),
                parsed.title.as_deref(),
                &parsed.body,
                parsed.status.as_deref(),
                parsed.metadata,
            );
        }
    }
}

fn read_stderr(state: AppState, session: AgentChatSession, stderr: impl Read) {
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        let raw = format!("[stderr] {line}\n");
        let _ = agent_chat_repository::append_raw_output(&state.db, &session.id, &raw);
        if !line.trim().is_empty() {
            let _ = append_event(
                &state,
                &session,
                "diagnostic",
                None,
                Some("Diagnostic"),
                line.trim(),
                None,
                None,
            );
        }
    }
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
            if status.success() { "result" } else { "error" },
            None,
            Some(if status.success() {
                "Run result"
            } else {
                "Run failed"
            }),
            if status.success() {
                "Agent run completed successfully."
            } else {
                "Agent run failed. Open diagnostics for details."
            },
            Some(final_status),
            Some(serde_json::json!({ "exitCode": status.code() })),
        );
        let _ = append_event(
            &state,
            &updated,
            "status",
            None,
            Some(if status.success() { "Done" } else { "Failed" }),
            if status.success() {
                "Agent finished."
            } else {
                "Agent exited with an error."
            },
            Some(final_status),
            Some(serde_json::json!({ "exitCode": status.code() })),
        );
    }
}

#[derive(Debug)]
struct ParsedAgentEvent {
    event_type: String,
    role: Option<String>,
    title: Option<String>,
    body: String,
    status: Option<String>,
    metadata: Option<Value>,
}

fn parse_adapter_line(provider: &str, line: &str) -> Vec<ParsedAgentEvent> {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(_) => {
            let text = strip_ansi(line).trim().to_string();
            if text.is_empty() {
                return Vec::new();
            }
            return vec![ParsedAgentEvent {
                event_type: "assistant_message".to_string(),
                role: Some("assistant".to_string()),
                title: None,
                body: text,
                status: None,
                metadata: None,
            }];
        }
    };
    match provider {
        "claude_code" => parse_claude_json_line(&value),
        "codex" => parse_codex_json_line(&value),
        _ => Vec::new(),
    }
}

fn parse_claude_json_line(value: &Value) -> Vec<ParsedAgentEvent> {
    let mut out = Vec::new();
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    if event_type == "stream_event" {
        return parse_claude_stream_event(value.get("event").unwrap_or(value));
    }
    if event_type == "result" {
        // Claude stream-json emits the final assistant text twice:
        //   1. as an `assistant` message/content block
        //   2. again on the terminal `result.result` object
        // The result object is useful in Raw / Diagnostics but should not become
        // a second chat bubble.
        return out;
    }
    let message = value.get("message").unwrap_or(value);
    if let Some(content) = message.get("content").and_then(Value::as_array) {
        for item in content {
            match item.get("type").and_then(Value::as_str).unwrap_or("") {
                "text" => {
                    if let Some(text) = item
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                    {
                        out.push(assistant_text(text));
                    }
                }
                "tool_use" => {
                    let name = item.get("name").and_then(Value::as_str).unwrap_or("Tool");
                    out.push(ParsedAgentEvent {
                        event_type: tool_event_type(name),
                        role: None,
                        title: Some(name.to_string()),
                        body: summarize_json(item.get("input"))
                            .unwrap_or_else(|| "Tool started.".to_string()),
                        status: Some("running".to_string()),
                        metadata: Some(item.clone()),
                    });
                }
                "tool_result" => {
                    out.push(ParsedAgentEvent {
                        event_type: "tool_result".to_string(),
                        role: None,
                        title: Some("Tool result".to_string()),
                        body: item
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("Tool completed.")
                            .to_string(),
                        status: Some("done".to_string()),
                        metadata: Some(item.clone()),
                    });
                }
                _ => {}
            }
        }
    }
    out
}

fn parse_claude_stream_event(value: &Value) -> Vec<ParsedAgentEvent> {
    match value.get("type").and_then(Value::as_str).unwrap_or("") {
        "content_block_start" => {
            let block_type = value
                .get("content_block")
                .and_then(|block| block.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if block_type == "thinking" {
                vec![ParsedAgentEvent {
                    event_type: "thinking".to_string(),
                    role: None,
                    title: Some("Thinking".to_string()),
                    body: "Claude is thinking…".to_string(),
                    status: Some("running".to_string()),
                    metadata: None,
                }]
            } else {
                Vec::new()
            }
        }
        "content_block_delta" => {
            let delta = value.get("delta").unwrap_or(value);
            // Claude emits text deltas and then later emits the full `assistant`
            // message. Persisting both creates duplicate chat bubbles, so keep
            // raw deltas in diagnostics only and let the final assistant object
            // become the clean chat message.
            if delta.get("text").and_then(Value::as_str).is_some() {
                return Vec::new();
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn parse_codex_json_line(value: &Value) -> Vec<ParsedAgentEvent> {
    let mut out = Vec::new();
    let typ = value
        .get("type")
        .or_else(|| value.get("event"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if let Some(text) = value
        .get("message")
        .or_else(|| value.get("text"))
        .or_else(|| value.get("content"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        out.push(assistant_text(text));
    } else if typ.contains("command") || typ.contains("exec") || typ.contains("tool") {
        out.push(ParsedAgentEvent {
            event_type: if typ.contains("command") || typ.contains("exec") {
                "command"
            } else {
                "tool_call"
            }
            .to_string(),
            role: None,
            title: Some(if typ.is_empty() {
                "Codex event".to_string()
            } else {
                typ.to_string()
            }),
            body: summarize_json(Some(value)).unwrap_or_else(|| "Codex event.".to_string()),
            status: None,
            metadata: Some(value.clone()),
        });
    }
    out
}

fn append_event(
    state: &AppState,
    session: &AgentChatSession,
    event_type: &str,
    role: Option<&str>,
    title: Option<&str>,
    body: &str,
    status: Option<&str>,
    metadata: Option<Value>,
) -> Result<AgentChatEvent, String> {
    let seq = agent_chat_repository::next_event_seq(&state.db, &session.id)?;
    let event = AgentChatEvent {
        id: format!("agent-chat-event-{}", unique_suffix()),
        session_id: session.id.clone(),
        seq,
        event_type: event_type.to_string(),
        role: role.map(str::to_string),
        title: title.map(str::to_string),
        body: body.to_string(),
        status: status.map(str::to_string),
        metadata,
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

fn assistant_text(text: &str) -> ParsedAgentEvent {
    ParsedAgentEvent {
        event_type: "assistant_message".to_string(),
        role: Some("assistant".to_string()),
        title: None,
        body: text.to_string(),
        status: None,
        metadata: None,
    }
}

fn tool_event_type(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("bash") || lower.contains("shell") || lower.contains("command") {
        "command".to_string()
    } else if lower.contains("test") {
        "test_run".to_string()
    } else if lower.contains("todo") {
        "todo".to_string()
    } else if lower.contains("read")
        || lower.contains("view")
        || lower.contains("grep")
        || lower.contains("glob")
    {
        "file_read".to_string()
    } else if lower.contains("edit")
        || lower.contains("write")
        || lower.contains("file")
        || lower.contains("notebook")
    {
        "file_change".to_string()
    } else {
        "tool_call".to_string()
    }
}

fn summarize_json(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(command) = value.get("command").and_then(Value::as_str) {
        return Some(command.to_string());
    }
    if let Some(path) = value
        .get("file_path")
        .or_else(|| value.get("path"))
        .and_then(Value::as_str)
    {
        return Some(path.to_string());
    }
    serde_json::to_string_pretty(value)
        .ok()
        .map(|raw| raw.chars().take(1200).collect())
}

fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn normalize_provider(provider: &str) -> String {
    match provider.trim().to_lowercase().as_str() {
        "claude" | "claude-code" | "claude_code" => "claude_code".to_string(),
        "codex" => "codex".to_string(),
        _ => "claude_code".to_string(),
    }
}

fn default_title(provider: &str) -> &'static str {
    match provider {
        "codex" => "Codex Chat",
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
}
