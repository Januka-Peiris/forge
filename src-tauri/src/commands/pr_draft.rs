use tauri::State;

use crate::models::WorkspacePrDraft;
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
