use tauri::State;

use crate::models::ScanRepositoriesResult;
use crate::services::repo_scanner_service;
use crate::state::AppState;

#[tauri::command]
pub fn scan_repositories(state: State<'_, AppState>) -> Result<ScanRepositoriesResult, String> {
    repo_scanner_service::scan_repositories(&state)
}

#[tauri::command]
pub fn remove_repository(state: State<'_, AppState>, repository_id: String) -> Result<(), String> {
    repo_scanner_service::remove_repository(&state, &repository_id)
}
