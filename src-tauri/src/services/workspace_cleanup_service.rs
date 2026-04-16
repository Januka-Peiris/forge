use crate::models::{CleanupWorkspaceInput, CleanupWorkspaceResult};
use crate::repositories::{terminal_repository, workspace_repository};
use crate::services::{
    terminal_service, workspace_health_service, workspace_port_service, workspace_script_service,
    workspace_service,
};
use crate::state::AppState;

pub fn cleanup_workspace(
    state: &AppState,
    input: CleanupWorkspaceInput,
) -> Result<CleanupWorkspaceResult, String> {
    workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    let mut warnings = Vec::new();
    let mut stopped_sessions = 0u32;
    for session in terminal_repository::list_visible_for_workspace(&state.db, &input.workspace_id)?
    {
        if session.status == "running" {
            match terminal_service::stop_workspace_terminal_session_by_id(state, &session.id) {
                Ok(_) => stopped_sessions += 1,
                Err(err) => warnings.push(format!("Could not stop {}: {err}", session.title)),
            }
        }
    }

    let config = workspace_script_service::get_workspace_forge_config(state, &input.workspace_id)
        .unwrap_or_default();
    let mut teardown_sessions = 0u32;
    if config.warning.is_none() {
        for (index, command) in config.teardown.iter().enumerate() {
            match workspace_script_service::start_command_terminal(
                state,
                &input.workspace_id,
                "run",
                &format!("Teardown {}", index + 1),
                command,
            ) {
                Ok(_) => teardown_sessions += 1,
                Err(err) => warnings.push(format!(
                    "Could not start teardown command {}: {err}",
                    index + 1
                )),
            }
        }
    }

    let mut killed_ports = 0u32;
    let mut remaining_ports =
        workspace_port_service::list_workspace_ports(state, &input.workspace_id)
            .unwrap_or_default();
    if input.kill_ports.unwrap_or(false) {
        for port in remaining_ports.clone() {
            if workspace_port_service::kill_workspace_port_process(
                state,
                &input.workspace_id,
                port.port,
                port.pid,
            )
            .is_ok()
            {
                killed_ports += 1;
            }
        }
        remaining_ports = workspace_port_service::list_workspace_ports(state, &input.workspace_id)
            .unwrap_or_default();
    }

    let health = workspace_health_service::get_workspace_health(state, &input.workspace_id).ok();
    let mut workspace_deleted = false;
    if input.remove_managed_worktree.unwrap_or(false) {
        if remaining_ports.is_empty() {
            workspace_service::delete_workspace(state, &input.workspace_id)?;
            workspace_deleted = true;
        } else {
            warnings.push(
                "Workspace was not removed because verified ports are still running.".to_string(),
            );
        }
    }

    Ok(CleanupWorkspaceResult {
        workspace_id: input.workspace_id,
        stopped_sessions,
        teardown_sessions,
        remaining_ports,
        killed_ports,
        health,
        workspace_deleted,
        warnings,
    })
}
