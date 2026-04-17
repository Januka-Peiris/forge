use tauri::State;

use crate::models::{
    AgentChatEvent, AgentChatSession, CreateAgentChatSessionInput, SendAgentChatMessageInput,
};
use crate::services::agent_chat_service;
use crate::state::AppState;

#[tauri::command]
pub fn create_agent_chat_session(
    state: State<'_, AppState>,
    input: CreateAgentChatSessionInput,
) -> Result<AgentChatSession, String> {
    agent_chat_service::create_agent_chat_session(&state, input)
}

#[tauri::command]
pub fn send_agent_chat_message(
    state: State<'_, AppState>,
    input: SendAgentChatMessageInput,
) -> Result<AgentChatEvent, String> {
    agent_chat_service::send_agent_chat_message(&state, input)
}

#[tauri::command]
pub fn list_agent_chat_sessions(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<AgentChatSession>, String> {
    agent_chat_service::list_agent_chat_sessions(&state, &workspace_id)
}

#[tauri::command]
pub fn list_agent_chat_events(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<AgentChatEvent>, String> {
    agent_chat_service::list_agent_chat_events(&state, &session_id)
}

#[tauri::command]
pub fn interrupt_agent_chat_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<AgentChatSession, String> {
    agent_chat_service::interrupt_agent_chat_session(&state, &session_id)
}

#[tauri::command]
pub fn close_agent_chat_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<AgentChatSession, String> {
    agent_chat_service::close_agent_chat_session(&state, &session_id)
}
