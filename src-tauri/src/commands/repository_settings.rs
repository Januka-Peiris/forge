use tauri::State;

use crate::repositories::repository_settings_repository;
use crate::state::AppState;

#[tauri::command]
pub fn get_repository_setting(
    state: State<'_, AppState>,
    repository_id: String,
    key: String,
) -> Result<Option<String>, String> {
    repository_settings_repository::get_value(&state.db, &repository_id, &key)
}

#[tauri::command]
pub fn set_repository_setting(
    state: State<'_, AppState>,
    repository_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    repository_settings_repository::set_value(&state.db, &repository_id, &key, &value)
}
