use tauri::State;

use crate::models::{WorkspaceAgentContext, WorkspaceContextPreview};
use crate::services::agent_context_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_agent_context(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceAgentContext, String> {
    agent_context_service::get_workspace_agent_context(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_context_preview(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceContextPreview, String> {
    agent_context_service::get_workspace_context_preview(&state, &workspace_id)
}

#[tauri::command]
pub fn refresh_workspace_repo_context(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceContextPreview, String> {
    agent_context_service::refresh_workspace_repo_context(&state, &workspace_id)
}
