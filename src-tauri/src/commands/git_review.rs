use tauri::State;

use crate::models::{WorkspaceChangedFile, WorkspaceFileDiff};
use crate::services::git_review_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_changed_files(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceChangedFile>, String> {
    git_review_service::get_workspace_changed_files(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_file_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
) -> Result<WorkspaceFileDiff, String> {
    git_review_service::get_workspace_file_diff(&state, &workspace_id, &path)
}
