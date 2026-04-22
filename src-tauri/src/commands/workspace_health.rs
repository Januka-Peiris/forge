use tauri::State;

use crate::models::{
    ApplyWorkspaceSessionRecoveryInput, WorkspaceConflicts, WorkspaceHealth,
    WorkspaceSessionRecoveryAction, WorkspaceSessionRecoveryResult,
};
use crate::services::{conflict_detection_service, workspace_health_service};
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_health(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceHealth, String> {
    workspace_health_service::get_workspace_health(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_conflicts(state: State<'_, AppState>) -> Result<WorkspaceConflicts, String> {
    conflict_detection_service::detect_workspace_conflicts(&state.db)
}

#[tauri::command]
pub fn recover_workspace_sessions(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceSessionRecoveryResult, String> {
    workspace_health_service::recover_workspace_sessions(&state, &workspace_id)
}

#[tauri::command]
pub fn apply_workspace_session_recovery_action(
    state: State<'_, AppState>,
    input: ApplyWorkspaceSessionRecoveryInput,
) -> Result<WorkspaceSessionRecoveryAction, String> {
    workspace_health_service::apply_workspace_session_recovery_action(&state, input)
}
