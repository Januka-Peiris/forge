use std::path::Path;
use std::process::Command;

use crate::models::{
    AttachLinkedWorktreeInput, CreateChildWorkspaceInput, CreateWorkspaceInput,
    DiscoveredRepository, LinkedWorktreeRef, RepositoryWorkspaceOptions, WorkspaceDetail,
    WorkspaceSummary,
};
use crate::repositories::{repository_repository, workspace_repository};
use crate::services::git_worktree_service;
use crate::state::AppState;

mod ops;

pub fn list_workspaces(state: &AppState) -> Result<Vec<WorkspaceSummary>, String> {
    workspace_repository::list(&state.db)
}

pub fn get_workspace_detail(state: &AppState, id: &str) -> Result<Option<WorkspaceDetail>, String> {
    workspace_repository::get_detail(&state.db, id)
}

pub fn list_repositories_for_workspace_creation(
    state: &AppState,
) -> Result<Vec<DiscoveredRepository>, String> {
    repository_repository::list(&state.db)
}

pub fn get_repository_workspace_options(
    state: &AppState,
    repository_id: &str,
) -> Result<RepositoryWorkspaceOptions, String> {
    let repository = repository_repository::get(&state.db, repository_id)?
        .ok_or_else(|| format!("Repository {repository_id} was not found"))?;
    let branches = git_worktree_service::list_branches(Path::new(&repository.path));

    Ok(RepositoryWorkspaceOptions {
        repository,
        branches,
    })
}

pub fn create_workspace(
    state: &AppState,
    input: CreateWorkspaceInput,
) -> Result<WorkspaceDetail, String> {
    ops::create_workspace(state, input)
}

pub fn delete_workspace(state: &AppState, workspace_id: &str) -> Result<(), String> {
    ops::delete_workspace(state, workspace_id)
}

pub fn create_child_workspace(
    state: &AppState,
    input: CreateChildWorkspaceInput,
) -> Result<WorkspaceDetail, String> {
    ops::create_child_workspace(state, input)
}

pub fn attach_workspace_linked_worktree(
    state: &AppState,
    input: AttachLinkedWorktreeInput,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    let workspace = workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    let target = repository_repository::get_worktree(&state.db, &input.worktree_id)?
        .ok_or_else(|| format!("Worktree {} was not found", input.worktree_id))?;
    if let Some(primary_repo_id) = workspace.summary.repository_id.as_ref() {
        if primary_repo_id == &target.repo_id {
            return Err(
                "Linked worktrees must come from a different repository than the primary workspace"
                    .to_string(),
            );
        }
    }
    let primary_path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(workspace.worktree_path);
    if primary_path == target.path {
        return Err("Cannot link the workspace primary worktree to itself".to_string());
    }
    workspace_repository::attach_linked_worktree(
        &state.db,
        &input.workspace_id,
        &input.worktree_id,
    )?;
    workspace_repository::list_linked_worktrees_for_workspace(&state.db, &input.workspace_id)
}

pub fn detach_workspace_linked_worktree(
    state: &AppState,
    workspace_id: &str,
    worktree_id: &str,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    workspace_repository::detach_linked_worktree(&state.db, workspace_id, worktree_id)?;
    workspace_repository::list_linked_worktrees_for_workspace(&state.db, workspace_id)
}

pub fn list_workspace_linked_worktrees(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<LinkedWorktreeRef>, String> {
    workspace_repository::list_linked_worktrees_for_workspace(&state.db, workspace_id)
}

pub fn open_in_cursor(state: &AppState, workspace_id: &str) -> Result<(), String> {
    let detail = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let target_path = detail
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(detail.worktree_path.clone());
    let path = Path::new(&target_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Cannot open workspace in Cursor because path is unavailable: {}",
            path.display()
        ));
    }

    let output = Command::new("cursor").arg(path).output().map_err(|err| {
        format!("Failed to launch Cursor. Ensure 'cursor' CLI is installed and on PATH: {err}")
    })?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "Cursor CLI returned a non-zero exit code while opening the workspace".to_string()
        } else {
            format!("Cursor failed to open workspace: {stderr}")
        })
    }
}

pub fn open_worktree_in_cursor(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Cannot open linked worktree in Cursor because path is unavailable: {}",
            path.display()
        ));
    }
    let output = Command::new("cursor")
        .arg(path)
        .output()
        .map_err(|err| format!("Failed to launch Cursor: {err}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "Cursor CLI returned a non-zero exit code".to_string()
        } else {
            format!("Cursor failed to open linked worktree: {stderr}")
        })
    }
}
