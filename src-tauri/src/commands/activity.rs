use tauri::State;

use crate::models::ActivityItem;
use crate::repositories::activity_repository;
use crate::services::activity_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_activity(state: State<'_, AppState>) -> Result<Vec<ActivityItem>, String> {
    activity_service::list_activity(&state)
}

#[tauri::command]
pub fn list_workspace_activity(
    state: State<'_, AppState>,
    workspace_id: String,
    limit: Option<u32>,
) -> Result<Vec<ActivityItem>, String> {
    activity_repository::list_for_workspace(&state.db, &workspace_id, limit.unwrap_or(50))
}
