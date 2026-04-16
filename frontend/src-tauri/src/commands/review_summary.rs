use tauri::State;

use crate::models::WorkspaceReviewSummary;
use crate::services::review_summary_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_review_summary(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceReviewSummary, String> {
    review_summary_service::get_workspace_review_summary(&state, &workspace_id)
}

#[tauri::command]
pub fn refresh_workspace_review_summary(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceReviewSummary, String> {
    review_summary_service::refresh_workspace_review_summary(&state, &workspace_id)
}
