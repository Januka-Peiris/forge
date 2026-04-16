use tauri::State;

use crate::models::{StartWorkspaceRunInput, WorkspaceRun, WorkspaceRunLog};
use crate::services::agent_process_service;
use crate::state::AppState;

#[tauri::command]
pub fn start_workspace_run(
    state: State<'_, AppState>,
    input: StartWorkspaceRunInput,
) -> Result<WorkspaceRun, String> {
    agent_process_service::start_workspace_run(&state, input)
}

#[tauri::command]
pub fn stop_workspace_run(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<WorkspaceRun, String> {
    agent_process_service::stop_workspace_run(&state, &run_id)
}

#[tauri::command]
pub fn get_workspace_runs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceRun>, String> {
    agent_process_service::get_workspace_runs(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_run_logs(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<Vec<WorkspaceRunLog>, String> {
    agent_process_service::get_workspace_run_logs(&state, &run_id)
}
