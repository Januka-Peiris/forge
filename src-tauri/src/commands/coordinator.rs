use tauri::State;

use crate::models::{
    ReplayWorkspaceCoordinatorActionInput, StartWorkspaceCoordinatorInput,
    StepWorkspaceCoordinatorInput, WorkspaceCoordinatorStatus,
};
use crate::services::coordinator_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_coordinator_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceCoordinatorStatus, String> {
    coordinator_service::get_workspace_coordinator_status(&state, &workspace_id)
}

#[tauri::command]
pub fn start_workspace_coordinator(
    state: State<'_, AppState>,
    input: StartWorkspaceCoordinatorInput,
) -> Result<WorkspaceCoordinatorStatus, String> {
    coordinator_service::start_workspace_coordinator(&state, input)
}

#[tauri::command]
pub fn step_workspace_coordinator(
    state: State<'_, AppState>,
    input: StepWorkspaceCoordinatorInput,
) -> Result<WorkspaceCoordinatorStatus, String> {
    coordinator_service::step_workspace_coordinator(&state, input)
}

#[tauri::command]
pub fn stop_workspace_coordinator(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceCoordinatorStatus, String> {
    coordinator_service::stop_workspace_coordinator(&state, &workspace_id)
}

#[tauri::command]
pub fn replay_workspace_coordinator_action(
    state: State<'_, AppState>,
    input: ReplayWorkspaceCoordinatorActionInput,
) -> Result<WorkspaceCoordinatorStatus, String> {
    coordinator_service::replay_workspace_coordinator_action(&state, input)
}
