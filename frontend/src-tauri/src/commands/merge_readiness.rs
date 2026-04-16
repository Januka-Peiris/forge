use tauri::State;

use crate::models::WorkspaceMergeReadiness;
use crate::services::merge_readiness_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_merge_readiness(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceMergeReadiness, String> {
    merge_readiness_service::get_workspace_merge_readiness(&state, &workspace_id)
}

#[tauri::command]
pub fn refresh_workspace_merge_readiness(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceMergeReadiness, String> {
    merge_readiness_service::refresh_workspace_merge_readiness(&state, &workspace_id)
}
