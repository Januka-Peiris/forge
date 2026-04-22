use tauri::State;

use crate::commands::perf::measure_command;
use crate::models::{
    AttachLinkedWorktreeInput, CreateChildWorkspaceInput, CreateWorkspaceInput,
    DiscoveredRepository, LinkedWorktreeRef, RepositoryWorkspaceOptions, WorkspaceDetail,
    WorkspaceSummary,
};
use crate::repositories::workspace_repository;
use crate::services::workspace_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceSummary>, String> {
    measure_command("list_workspaces", || {
        workspace_service::list_workspaces(&state)
    })
}

#[tauri::command]
pub fn get_workspace_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<WorkspaceDetail>, String> {
    measure_command("get_workspace_detail", || {
        workspace_service::get_workspace_detail(&state, &id)
    })
}

#[tauri::command]
pub fn create_workspace(
    state: State<'_, AppState>,
    input: CreateWorkspaceInput,
) -> Result<WorkspaceDetail, String> {
    measure_command("create_workspace", || {
        workspace_service::create_workspace(&state, input)
    })
}

#[tauri::command]
pub fn list_repositories_for_workspace_creation(
    state: State<'_, AppState>,
) -> Result<Vec<DiscoveredRepository>, String> {
    workspace_service::list_repositories_for_workspace_creation(&state)
}

#[tauri::command]
pub fn get_repository_workspace_options(
    state: State<'_, AppState>,
    repository_id: String,
) -> Result<RepositoryWorkspaceOptions, String> {
    workspace_service::get_repository_workspace_options(&state, &repository_id)
}

#[tauri::command]
pub fn delete_workspace(state: State<'_, AppState>, workspace_id: String) -> Result<(), String> {
    log::info!(target: "forge_lib", "delete_workspace command: workspace_id={workspace_id}");
    let res = workspace_service::delete_workspace(&state, &workspace_id);
    match &res {
        Ok(()) => {
            log::info!(target: "forge_lib", "delete_workspace ok: workspace_id={workspace_id}")
        }
        Err(e) => {
            log::warn!(target: "forge_lib", "delete_workspace failed: workspace_id={workspace_id} err={e}")
        }
    }
    res
}

#[tauri::command]
pub fn open_in_cursor(state: State<'_, AppState>, workspace_id: String) -> Result<(), String> {
    workspace_service::open_in_cursor(&state, &workspace_id)
}

#[tauri::command]
pub fn create_child_workspace(
    state: State<'_, AppState>,
    input: CreateChildWorkspaceInput,
) -> Result<WorkspaceDetail, String> {
    measure_command("create_child_workspace", || {
        workspace_service::create_child_workspace(&state, input)
    })
}

#[tauri::command]
pub fn attach_workspace_linked_worktree(
    state: State<'_, AppState>,
    input: AttachLinkedWorktreeInput,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    workspace_service::attach_workspace_linked_worktree(&state, input)
}

#[tauri::command]
pub fn list_workspace_linked_worktrees(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    workspace_service::list_workspace_linked_worktrees(&state, &workspace_id)
}

#[tauri::command]
pub fn detach_workspace_linked_worktree(
    state: State<'_, AppState>,
    workspace_id: String,
    worktree_id: String,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    workspace_service::detach_workspace_linked_worktree(&state, &workspace_id, &worktree_id)
}

#[tauri::command]
pub fn open_worktree_in_cursor(path: String) -> Result<(), String> {
    workspace_service::open_worktree_in_cursor(&path)
}

#[tauri::command]
pub fn set_workspace_cost_limit(
    state: State<'_, AppState>,
    workspace_id: String,
    limit_usd: Option<f64>,
) -> Result<(), String> {
    workspace_repository::set_cost_limit(&state.db, &workspace_id, limit_usd)
}

#[tauri::command]
pub fn pull_workspace_branch(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<String, String> {
    workspace_service::pull_workspace_branch(&state, &workspace_id)
}
