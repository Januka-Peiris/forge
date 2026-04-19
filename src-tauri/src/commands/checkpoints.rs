use tauri::State;

use crate::models::{
    WorkspaceCheckpoint, WorkspaceCheckpointBranchResult, WorkspaceCheckpointDeleteResult,
    WorkspaceCheckpointDiff, WorkspaceCheckpointRestorePlan, WorkspaceCheckpointRestoreResult,
};
use crate::services::checkpoint_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_checkpoints(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceCheckpoint>, String> {
    checkpoint_service::list_workspace_checkpoints(&state, &workspace_id)
}

#[tauri::command]
pub fn create_workspace_checkpoint(
    state: State<'_, AppState>,
    workspace_id: String,
    reason: Option<String>,
) -> Result<Option<WorkspaceCheckpoint>, String> {
    checkpoint_service::create_workspace_checkpoint(&state, &workspace_id, reason.as_deref())
}

#[tauri::command]
pub fn get_workspace_checkpoint_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    reference: String,
) -> Result<WorkspaceCheckpointDiff, String> {
    checkpoint_service::get_workspace_checkpoint_diff(&state, &workspace_id, &reference)
}

#[tauri::command]
pub fn get_workspace_checkpoint_restore_plan(
    state: State<'_, AppState>,
    workspace_id: String,
    reference: String,
) -> Result<WorkspaceCheckpointRestorePlan, String> {
    checkpoint_service::get_workspace_checkpoint_restore_plan(&state, &workspace_id, &reference)
}

#[tauri::command]
pub fn restore_workspace_checkpoint(
    state: State<'_, AppState>,
    workspace_id: String,
    reference: String,
) -> Result<WorkspaceCheckpointRestoreResult, String> {
    checkpoint_service::restore_workspace_checkpoint(&state, &workspace_id, &reference)
}

#[tauri::command]
pub fn delete_workspace_checkpoint(
    state: State<'_, AppState>,
    workspace_id: String,
    reference: String,
) -> Result<WorkspaceCheckpointDeleteResult, String> {
    checkpoint_service::delete_workspace_checkpoint(&state, &workspace_id, &reference)
}

#[tauri::command]
pub fn create_branch_from_workspace_checkpoint(
    state: State<'_, AppState>,
    workspace_id: String,
    reference: String,
    branch: String,
) -> Result<WorkspaceCheckpointBranchResult, String> {
    checkpoint_service::create_branch_from_workspace_checkpoint(
        &state,
        &workspace_id,
        &reference,
        &branch,
    )
}
