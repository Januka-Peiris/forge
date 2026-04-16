use tauri::State;

use crate::models::WorkspacePort;
use crate::services::workspace_port_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_ports(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspacePort>, String> {
    workspace_port_service::list_workspace_ports(&state, &workspace_id)
}

#[tauri::command]
pub fn open_workspace_port(
    state: State<'_, AppState>,
    workspace_id: String,
    port: u16,
) -> Result<(), String> {
    workspace_port_service::open_workspace_port(&state, &workspace_id, port)
}

#[tauri::command]
pub fn kill_workspace_port_process(
    state: State<'_, AppState>,
    workspace_id: String,
    port: u16,
    pid: u32,
) -> Result<Vec<WorkspacePort>, String> {
    workspace_port_service::kill_workspace_port_process(&state, &workspace_id, port, pid)
}
