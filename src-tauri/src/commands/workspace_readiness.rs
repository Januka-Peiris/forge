use tauri::State;

use crate::models::WorkspaceReadiness;
use crate::services::workspace_readiness_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_readiness(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceReadiness, String> {
    workspace_readiness_service::get_workspace_readiness(&state, &workspace_id)
}
