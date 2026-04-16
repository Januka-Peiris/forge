use tauri::State;

use crate::models::WorkspaceHealth;
use crate::services::workspace_health_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_health(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceHealth, String> {
    workspace_health_service::get_workspace_health(&state, &workspace_id)
}
