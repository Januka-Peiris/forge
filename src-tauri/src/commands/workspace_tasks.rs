use tauri::State;

use crate::models::WorkspaceTaskSnapshot;
use crate::services::task_lifecycle_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_task_snapshot(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceTaskSnapshot, String> {
    task_lifecycle_service::get_workspace_task_snapshot(&state, &workspace_id)
}
