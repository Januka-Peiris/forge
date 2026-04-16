use tauri::State;

use crate::models::WorkspaceAgentContext;
use crate::services::agent_context_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_agent_context(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceAgentContext, String> {
    agent_context_service::get_workspace_agent_context(&state, &workspace_id)
}
