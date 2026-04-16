use tauri::State;

use crate::models::ActivityItem;
use crate::services::activity_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_activity(state: State<'_, AppState>) -> Result<Vec<ActivityItem>, String> {
    activity_service::list_activity(&state)
}
