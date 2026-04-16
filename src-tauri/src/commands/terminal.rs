use tauri::State;

use crate::commands::perf::measure_command;
use crate::models::{
    AgentPromptEntry, AttachWorkspaceTerminalInput, CreateWorkspaceTerminalInput,
    QueueAgentPromptInput, StartTerminalSessionInput, TerminalOutputResponse, TerminalSession,
    TerminalSessionState,
};
use crate::services::terminal_service;
use crate::state::AppState;

#[tauri::command]
pub fn create_workspace_terminal(
    state: State<'_, AppState>,
    input: CreateWorkspaceTerminalInput,
) -> Result<TerminalSession, String> {
    measure_command("create_workspace_terminal", || {
        terminal_service::create_workspace_terminal(&state, input)
    })
}

#[tauri::command]
pub fn attach_workspace_terminal_session(
    state: State<'_, AppState>,
    input: AttachWorkspaceTerminalInput,
) -> Result<TerminalSession, String> {
    measure_command("attach_workspace_terminal_session", || {
        terminal_service::attach_workspace_terminal_session(&state, input)
    })
}

#[tauri::command]
pub fn write_workspace_terminal_session_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    terminal_service::write_workspace_terminal_session_input(&state, &session_id, &data)
}

#[tauri::command]
pub fn resize_workspace_terminal_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_service::resize_workspace_terminal_session(&state, &session_id, cols, rows)
}

#[tauri::command]
pub fn interrupt_workspace_terminal_session_by_id(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TerminalSession, String> {
    terminal_service::interrupt_workspace_terminal_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn stop_workspace_terminal_session_by_id(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TerminalSession, String> {
    terminal_service::stop_workspace_terminal_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn close_workspace_terminal_session_by_id(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TerminalSession, String> {
    terminal_service::close_workspace_terminal_session_by_id(&state, &session_id)
}

#[tauri::command]
pub fn list_workspace_visible_terminal_sessions(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TerminalSession>, String> {
    measure_command("list_workspace_visible_terminal_sessions", || {
        terminal_service::list_workspace_visible_terminal_sessions(&state, &workspace_id)
    })
}

#[tauri::command]
pub fn capture_workspace_terminal_scrollback(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TerminalOutputResponse, String> {
    measure_command("capture_workspace_terminal_scrollback", || {
        terminal_service::capture_workspace_terminal_scrollback(&state, &session_id)
    })
}

#[tauri::command]
pub fn start_workspace_terminal_session(
    state: State<'_, AppState>,
    input: StartTerminalSessionInput,
) -> Result<TerminalSession, String> {
    measure_command("start_workspace_terminal_session", || {
        terminal_service::start_workspace_terminal_session(&state, input)
    })
}

#[tauri::command]
pub fn write_workspace_terminal_input(
    state: State<'_, AppState>,
    workspace_id: String,
    data: String,
) -> Result<(), String> {
    terminal_service::write_workspace_terminal_input(&state, &workspace_id, &data)
}

#[tauri::command]
pub fn resize_workspace_terminal(
    state: State<'_, AppState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_service::resize_workspace_terminal(&state, &workspace_id, cols, rows)
}

#[tauri::command]
pub fn stop_workspace_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::stop_workspace_terminal_session(&state, &workspace_id)
}

#[tauri::command]
pub fn interrupt_workspace_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::interrupt_workspace_terminal_session(&state, &workspace_id)
}

#[tauri::command]
pub fn close_workspace_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::close_workspace_terminal_session(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_terminal_session_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::get_workspace_terminal_session_state(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_terminal_output(
    state: State<'_, AppState>,
    workspace_id: String,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    measure_command("get_workspace_terminal_output", || {
        terminal_service::get_workspace_terminal_output(&state, &workspace_id, since_seq)
    })
}

#[tauri::command]
pub fn get_workspace_terminal_output_for_session(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: String,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    measure_command("get_workspace_terminal_output_for_session", || {
        terminal_service::get_workspace_terminal_output_for_session(
            &state,
            &workspace_id,
            &session_id,
            since_seq,
        )
    })
}

#[tauri::command]
pub fn list_workspace_terminal_sessions(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TerminalSession>, String> {
    measure_command("list_workspace_terminal_sessions", || {
        terminal_service::list_workspace_terminal_sessions(&state, &workspace_id)
    })
}

#[tauri::command]
pub fn reconnect_workspace_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: Option<String>,
) -> Result<TerminalSessionState, String> {
    terminal_service::reconnect_workspace_terminal_session(
        &state,
        &workspace_id,
        session_id.as_deref(),
    )
}

#[tauri::command]
pub fn queue_workspace_agent_prompt(
    state: State<'_, AppState>,
    input: QueueAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    measure_command("queue_workspace_agent_prompt", || {
        terminal_service::queue_workspace_agent_prompt(&state, input)
    })
}

#[tauri::command]
pub fn run_next_workspace_agent_prompt(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<AgentPromptEntry>, String> {
    terminal_service::run_next_workspace_agent_prompt(&state, &workspace_id)
}

#[tauri::command]
pub fn list_workspace_agent_prompts(
    state: State<'_, AppState>,
    workspace_id: String,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    measure_command("list_workspace_agent_prompts", || {
        terminal_service::list_workspace_agent_prompts(&state, &workspace_id, limit)
    })
}

#[tauri::command]
pub fn write_workspace_utility_terminal_input(
    state: State<'_, AppState>,
    workspace_id: String,
    data: String,
) -> Result<(), String> {
    terminal_service::write_workspace_utility_terminal_input(&state, &workspace_id, &data)
}

#[tauri::command]
pub fn resize_workspace_utility_terminal(
    state: State<'_, AppState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_service::resize_workspace_utility_terminal(&state, &workspace_id, cols, rows)
}

#[tauri::command]
pub fn stop_workspace_utility_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::stop_workspace_utility_terminal_session(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_utility_terminal_session_state(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TerminalSessionState, String> {
    terminal_service::get_workspace_utility_terminal_session_state(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_utility_terminal_output(
    state: State<'_, AppState>,
    workspace_id: String,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    terminal_service::get_workspace_utility_terminal_output(&state, &workspace_id, since_seq)
}

#[tauri::command]
pub fn reconnect_workspace_utility_terminal_session(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: Option<String>,
) -> Result<TerminalSessionState, String> {
    terminal_service::reconnect_workspace_utility_terminal_session(
        &state,
        &workspace_id,
        session_id.as_deref(),
    )
}
