use tauri::State;

use crate::models::{AppSettings, SaveRepoRootsInput};
use crate::services::{repo_scanner_service, settings_service};
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    settings_service::get_settings(&state)
}

#[tauri::command]
pub fn save_repo_roots(
    state: State<'_, AppState>,
    input: SaveRepoRootsInput,
) -> Result<AppSettings, String> {
    settings_service::save_repo_roots(&state, input)
}

#[tauri::command]
pub fn resolve_git_repository_path(path: String) -> Result<String, String> {
    repo_scanner_service::resolve_git_repository_path(&path)
}
