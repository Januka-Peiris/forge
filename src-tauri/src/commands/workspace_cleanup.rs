use tauri::State;

use crate::models::{CleanupWorkspaceInput, CleanupWorkspaceResult};
use crate::services::workspace_cleanup_service;
use crate::state::AppState;

#[tauri::command]
pub fn cleanup_workspace(
    state: State<'_, AppState>,
    input: CleanupWorkspaceInput,
) -> Result<CleanupWorkspaceResult, String> {
    workspace_cleanup_service::cleanup_workspace(&state, input)
}
