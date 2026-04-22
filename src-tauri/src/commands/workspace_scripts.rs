use tauri::State;

use crate::models::{ForgeWorkspaceConfig, TerminalSession, WorkspaceHookInspector};
use crate::services::{hook_service, workspace_script_service};
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_forge_config(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<ForgeWorkspaceConfig, String> {
    workspace_script_service::get_workspace_forge_config(&state, &workspace_id)
}

#[tauri::command]
pub fn run_workspace_setup(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TerminalSession>, String> {
    workspace_script_service::run_workspace_setup(&state, &workspace_id)
}

#[tauri::command]
pub fn start_workspace_run_command(
    state: State<'_, AppState>,
    workspace_id: String,
    command_index: usize,
) -> Result<TerminalSession, String> {
    workspace_script_service::start_workspace_run_command(&state, &workspace_id, command_index)
}

#[tauri::command]
pub fn restart_workspace_run_command(
    state: State<'_, AppState>,
    workspace_id: String,
    command_index: usize,
) -> Result<TerminalSession, String> {
    workspace_script_service::restart_workspace_run_command(&state, &workspace_id, command_index)
}

#[tauri::command]
pub fn stop_workspace_run_commands(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<TerminalSession>, String> {
    workspace_script_service::stop_workspace_run_commands(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_hook_inspector(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceHookInspector, String> {
    hook_service::get_workspace_hook_inspector(&state, &workspace_id)
}
