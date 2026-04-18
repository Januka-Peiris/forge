use tauri::State;

use crate::models::{WorkspacePrDraft, WorkspacePrResult, WorkspacePrStatus};
use crate::services::pr_draft_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_pr_draft(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspacePrDraft, String> {
    pr_draft_service::get_workspace_pr_draft(&state, &workspace_id)
}

#[tauri::command]
pub fn refresh_workspace_pr_draft(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspacePrDraft, String> {
    pr_draft_service::refresh_workspace_pr_draft(&state, &workspace_id)
}

#[tauri::command]
pub fn create_workspace_pr(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspacePrResult, String> {
    pr_draft_service::create_workspace_pr(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_pr_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspacePrStatus, String> {
    pr_draft_service::get_workspace_pr_status(&state, &workspace_id)
}
