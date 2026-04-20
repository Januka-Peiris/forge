use std::path::Path;
use std::process::Command;

use crate::models::{
    AgentSessionSummary, AttachLinkedWorktreeInput, BranchHealth, CreateChildWorkspaceInput,
    CreateWorkspaceInput, DiscoveredRepository, LinkedWorktreeRef, RepositoryWorkspaceOptions,
    WorkspaceDetail, WorkspaceSummary,
};
use crate::repositories::{
    activity_repository, repository_repository, settings_repository, workspace_repository,
};
use crate::services::{
    git_worktree_service, repo_scanner_service, terminal_service, workspace_script_service,
};
use crate::state::AppState;

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
    if input.name.trim().is_empty() {
        return Err("Workspace name is required".to_string());
    }

    let next_id = workspace_repository::next_workspace_id(&state.db)?;
    let selected_repo = match input.repository_id.as_deref() {
        Some(repository_id) if !repository_id.trim().is_empty() => Some(
            repository_repository::get(&state.db, repository_id)?
                .ok_or_else(|| format!("Repository {repository_id} was not found"))?,
        ),
        _ => None,
    };

    let selected_worktree = match input.selected_worktree_id.as_deref() {
        Some(worktree_id) if !worktree_id.trim().is_empty() => {
            repository_repository::get_worktree(&state.db, worktree_id)?
        }
        _ => None,
    };

    let repo_name = selected_repo
        .as_ref()
        .map(|repo| repo.name.clone())
        .unwrap_or_else(|| input.repo.clone());
    if repo_name.trim().is_empty() {
        return Err("Repository is required".to_string());
    }

    let repo_path = selected_repo.as_ref().map(|repo| repo.path.clone());
    let mut branch = selected_worktree
        .as_ref()
        .and_then(|worktree| worktree.branch.clone())
        .or_else(|| input.selected_branch.clone())
        .or_else(|| input.branch.clone())
        .or_else(|| {
            selected_repo
                .as_ref()
                .and_then(|repo| repo.current_branch.clone())
        })
        .unwrap_or_else(|| slug_branch(&input.name));

    let selected_worktree_path;
    let workspace_root_path;
    let worktree_path;
    let worktree_managed_by_forge;
    let workspace_source;

    if let Some(worktree) = &selected_worktree {
        selected_worktree_path = Some(worktree.path.clone());
        workspace_root_path = Some(worktree.path.clone());
        worktree_path = worktree.path.clone();
        worktree_managed_by_forge = false;
        workspace_source = "external_worktree".to_string();
    } else if let Some(repo) = &selected_repo {
        let created = git_worktree_service::create_forge_worktree(
            &repo.path,
            &next_id,
            &branch,
            &input.base_branch,
        )?;
        branch = created.branch;
        selected_worktree_path = Some(created.path.clone());
        workspace_root_path = Some(created.path.clone());
        worktree_path = created.path;
        worktree_managed_by_forge = true;
        workspace_source = "forge_managed_worktree".to_string();
    } else {
        return Err(
            "Repository selection is required to create a real branch workspace".to_string(),
        );
    }

    let current_task = if input.task_prompt.trim().is_empty() {
        "Workspace created and waiting for an agent instruction.".to_string()
    } else {
        format!("Queued: {}", input.task_prompt.trim())
    };
    let selected_agent = input.agent.clone();

    let detail = WorkspaceDetail {
        summary: WorkspaceSummary {
            id: next_id.clone(),
            name: input.name,
            repo: repo_name.clone(),
            branch: branch.clone(),
            agent: selected_agent.clone(),
            status: "Waiting".to_string(),
            current_step: "Planning".to_string(),
            completed_steps: vec![],
            changed_files: vec![],
            last_updated: "just now".to_string(),
            pr_status: None,
            pr_number: None,
            description: if worktree_managed_by_forge {
                "Branch workspace created with a Forge-managed Git worktree.".to_string()
            } else if selected_worktree.is_some() {
                "Branch workspace linked to an existing external Git worktree.".to_string()
            } else {
                "Workspace record created without a managed worktree.".to_string()
            },
            current_task,
            branch_health: BranchHealth {
                ahead_by: 0,
                behind_by: 0,
                merge_risk: "Low".to_string(),
                last_rebase: "not checked".to_string(),
                base_branch: input.base_branch.clone(),
            },
            agent_session: AgentSessionSummary {
                id: format!("session-{}", next_id),
                agent: detail_agent_name(&selected_agent),
                status: "idle".to_string(),
                model: "local".to_string(),
                token_count: 0,
                estimated_cost: "$0.00".to_string(),
                last_message: "No terminal session started yet".to_string(),
                started_at: "not started".to_string(),
            },
            repository_id: selected_repo.as_ref().map(|repo| repo.id.clone()),
            repository_path: repo_path.clone(),
            selected_branch: Some(branch.clone()),
            selected_worktree_id: selected_worktree
                .as_ref()
                .map(|worktree| worktree.id.clone()),
            selected_worktree_path: selected_worktree_path.clone(),
            workspace_root_path: workspace_root_path.clone(),
            worktree_managed_by_forge,
            workspace_source: workspace_source.clone(),
            parent_workspace_id: input.parent_workspace_id.clone(),
            source_workspace_id: input.source_workspace_id.clone(),
            derived_from_branch: input.derived_from_branch.clone(),
            linked_worktrees: vec![],
            cost_limit_usd: None,
        },
        worktree_path,
        base_branch: input.base_branch,
        recent_events: vec!["Workspace lifecycle record created".to_string()],
    };

    if let Err(err) = workspace_repository::insert(&state.db, &detail) {
        if detail.summary.worktree_managed_by_forge {
            if let Some(repo_path) = detail.summary.repository_path.as_deref() {
                let _ =
                    git_worktree_service::remove_forge_worktree(repo_path, &detail.worktree_path);
            }
        }
        return Err(err);
    }

    activity_repository::record(
        &state.db,
        &detail.summary.id,
        &detail.summary.repo,
        Some(&detail.summary.branch),
        "Workspace created",
        "success",
        Some(&format!("{} · {}", workspace_source, detail.worktree_path)),
    )?;

    if let Some(repository_id) = detail.summary.repository_id.as_deref() {
        repo_scanner_service::refresh_repository_by_id(state, repository_id)?;
    }

    let auto_setup_enabled = settings_repository::get_value(&state.db, "auto_run_setup_enabled")
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(false);

    if detail.summary.worktree_managed_by_forge && auto_setup_enabled {
        match workspace_script_service::run_workspace_setup(state, &detail.summary.id) {
            Ok(sessions) if !sessions.is_empty() => {
                let details = format!(
                    "Started {} setup command(s) from .forge/config.json",
                    sessions.len()
                );
                let _ = activity_repository::record(
                    &state.db,
                    &detail.summary.id,
                    &detail.summary.repo,
                    Some(&detail.summary.branch),
                    "Workspace setup launched",
                    "info",
                    Some(&details),
                );
            }
            Ok(_) => {}
            Err(err) => {
                let _ = activity_repository::record(
                    &state.db,
                    &detail.summary.id,
                    &detail.summary.repo,
                    Some(&detail.summary.branch),
                    "Workspace setup warning",
                    "warning",
                    Some(&err),
                );
            }
        }
    } else if detail.summary.worktree_managed_by_forge {
        let _ = activity_repository::record(
            &state.db,
            &detail.summary.id,
            &detail.summary.repo,
            Some(&detail.summary.branch),
            "Workspace setup waiting",
            "info",
            Some(
                "Automatic setup is disabled. Run setup manually from the workspace commands panel.",
            ),
        );
    }

    Ok(detail)
}

pub fn delete_workspace(state: &AppState, workspace_id: &str) -> Result<(), String> {
    log::info!(target: "forge_lib", "delete_workspace begin: id={workspace_id}");
    let detail = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    log::info!(
        target: "forge_lib",
        "delete_workspace loaded: id={workspace_id} worktree_path={} forge_managed={}",
        detail.worktree_path,
        detail.summary.worktree_managed_by_forge
    );

    // Stop PTY sessions before forgetting the workspace record. Git branches/worktrees are preserved.
    match terminal_service::stop_workspace_terminal_session(state, workspace_id) {
        Ok(_) => log::info!(target: "forge_lib", "stop agent terminal: ok id={workspace_id}"),
        Err(e) => log::warn!(target: "forge_lib", "stop agent terminal: {e} id={workspace_id}"),
    }
    match terminal_service::stop_workspace_utility_terminal_session(state, workspace_id) {
        Ok(_) => log::info!(target: "forge_lib", "stop utility terminal: ok id={workspace_id}"),
        Err(e) => log::warn!(target: "forge_lib", "stop utility terminal: {e} id={workspace_id}"),
    }
    match workspace_script_service::stop_workspace_run_commands(state, workspace_id) {
        Ok(stopped) => log::info!(
            target: "forge_lib",
            "stop run terminals: {} stopped id={workspace_id}",
            stopped.len()
        ),
        Err(e) => log::warn!(target: "forge_lib", "stop run terminals: {e} id={workspace_id}"),
    }

    let path = detail
        .summary
        .workspace_root_path
        .as_deref()
        .unwrap_or(&detail.worktree_path)
        .to_string();
    let path_on_disk = Path::new(&path);
    let remove_managed_worktree = false;
    let mut worktree_cleanup_warning: Option<String> = None;

    if remove_managed_worktree {
        let repo_path_opt = detail
            .summary
            .repository_path
            .clone()
            .or_else(|| infer_repo_path_from_worktree(&path).ok());

        match repo_path_opt {
            Some(repo_path) => {
                if !path_on_disk.exists() {
                    log::info!(
                        target: "forge_lib",
                        "worktree folder already absent; git worktree prune repo={} path={}",
                        repo_path,
                        path
                    );
                    if let Err(err) = git_worktree_service::prune_worktrees(Path::new(&repo_path)) {
                        log::warn!(
                            target: "forge_lib",
                            "git worktree prune failed (continuing DB delete): {err}"
                        );
                    }
                } else {
                    log::info!(
                        target: "forge_lib",
                        "git worktree remove: repo={} path={}",
                        repo_path,
                        path
                    );
                    match git_worktree_service::remove_forge_worktree(&repo_path, &path) {
                        Ok(()) => {
                            log::info!(target: "forge_lib", "git worktree remove: ok path={path}");
                        }
                        Err(err) => {
                            if !Path::new(&path).exists() {
                                log::warn!(
                                    target: "forge_lib",
                                    "git worktree remove failed after folder disappeared: {err}"
                                );
                                let _ =
                                    git_worktree_service::prune_worktrees(Path::new(&repo_path));
                            } else {
                                log::warn!(
                                    target: "forge_lib",
                                    "git worktree remove failed; still deleting workspace row: {err}"
                                );
                                worktree_cleanup_warning = Some(format!(
                                    "Git worktree remove failed ({err}). The workspace was removed from Forge; delete the folder manually or run `git worktree prune` in the repository."
                                ));
                                let _ =
                                    git_worktree_service::prune_worktrees(Path::new(&repo_path));
                            }
                        }
                    }
                }
            }
            None => {
                if path_on_disk.exists() {
                    log::warn!(
                        target: "forge_lib",
                        "delete_workspace: could not resolve repository_path for existing worktree path; continuing DB delete path={path}"
                    );
                    worktree_cleanup_warning = Some(
                        "Could not resolve the main repository path for this worktree. The workspace was removed from Forge; remove the checkout folder manually if it is still on disk."
                            .to_string(),
                    );
                } else {
                    log::warn!(
                        target: "forge_lib",
                        "skip git cleanup: no repository_path and worktree path missing; continuing DB delete path={path}"
                    );
                }
            }
        }
    } else {
        log::info!(
            target: "forge_lib",
            "skip git worktree remove (not Forge-managed or policy); path={path}"
        );
    }

    log::info!(target: "forge_lib", "sqlite delete workspace row: id={workspace_id}");
    workspace_repository::delete(&state.db, workspace_id)?;

    // Always prune to ensure "zombie" registrations are cleared from Git's metadata
    if let Some(repo_path) = detail.summary.repository_path.as_deref() {
        let _ = git_worktree_service::prune_worktrees(Path::new(repo_path));
    }

    let activity_level = if worktree_cleanup_warning.is_some() {
        "warning"
    } else {
        "success"
    };
    let activity_details = worktree_cleanup_warning.or_else(|| {
        Some(
            if remove_managed_worktree {
                "Removed workspace record; branch and on-disk worktree were preserved."
            } else {
                "Removed workspace record; on-disk worktree was not removed by Forge."
            }
            .to_string(),
        )
    });

    activity_repository::insert(
        &state.db,
        &crate::models::ActivityItem {
            id: format!("act-delete-{workspace_id}"),
            workspace_id: None,
            repo: detail.summary.repo.clone(),
            branch: Some(detail.summary.branch.clone()),
            event: "Workspace forgotten".to_string(),
            level: activity_level.to_string(),
            details: activity_details,
            timestamp: "just now".to_string(),
        },
    )?;

    if let Some(repository_id) = detail.summary.repository_id.as_deref() {
        if let Err(err) = repo_scanner_service::refresh_repository_by_id(state, repository_id) {
            log::warn!(
                target: "forge_lib",
                "refresh_repository_by_id after delete failed (workspace already removed from DB): repository_id={repository_id} err={err}"
            );
        }
    }

    log::info!(target: "forge_lib", "delete_workspace finished: id={workspace_id}");
    Ok(())
}

pub fn create_child_workspace(
    state: &AppState,
    input: CreateChildWorkspaceInput,
) -> Result<WorkspaceDetail, String> {
    let parent = workspace_repository::get_detail(&state.db, &input.parent_workspace_id)?
        .ok_or_else(|| {
            format!(
                "Parent workspace {} was not found",
                input.parent_workspace_id
            )
        })?;
    if let Some(branch) = input.branch.as_ref() {
        let repo_path = parent.summary.repository_path.clone().ok_or_else(|| {
            "Parent workspace has no repository path; cannot validate child branch name".to_string()
        })?;
        if git_worktree_service::local_branch_exists(Path::new(&repo_path), branch)? {
            return Err(format!(
                "Branch '{branch}' already exists in this repository. Choose a different branch name."
            ));
        }
    }
    let repository_id = parent.summary.repository_id.clone().ok_or_else(|| {
        "Parent workspace has no repository id; cannot create child workspace".to_string()
    })?;
    let parent_branch = parent
        .summary
        .selected_branch
        .clone()
        .unwrap_or(parent.summary.branch.clone());
    let parent_root = parent
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(parent.worktree_path.clone());
    let head_ref = git_current_head_ref(&parent_root).map_err(|err| {
        format!("Cannot create child workspace: invalid parent workspace context. {err}")
    })?;

    create_workspace(
        state,
        CreateWorkspaceInput {
            name: input.name,
            repo: parent.summary.repo.clone(),
            base_branch: head_ref,
            branch: input.branch,
            agent: input.agent.unwrap_or_else(|| parent.summary.agent.clone()),
            task_prompt: input.task_prompt.unwrap_or_default(),
            open_in_cursor: input.open_in_cursor.unwrap_or(false),
            run_tests: input.run_tests.unwrap_or(true),
            create_pr: input.create_pr.unwrap_or(true),
            repository_id: Some(repository_id),
            selected_worktree_id: None,
            selected_branch: Some(parent_branch.clone()),
            parent_workspace_id: Some(parent.summary.id.clone()),
            source_workspace_id: Some(parent.summary.id),
            derived_from_branch: Some(parent_branch),
        },
    )
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

fn slug_branch(name: &str) -> String {
    let slug = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    format!("feat/{slug}")
}

fn detail_agent_name(agent: &str) -> String {
    match agent {
        "Codex" => "codex".to_string(),
        "Claude Code" => "claude_code".to_string(),
        "Local LLM" => "local_llm".to_string(),
        other => other.to_lowercase(),
    }
}

fn git_current_head_ref(workspace_root: &str) -> Result<String, String> {
    let path = Path::new(workspace_root);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Workspace path is unavailable: {}", path.display()));
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|err| format!("Failed to run git rev-parse HEAD: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git rev-parse HEAD failed in {}", path.display())
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn infer_repo_path_from_worktree(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(worktree_path)
        .args(["rev-parse", "--git-common-dir"])
        .output()
        .map_err(|err| format!("Failed to run git rev-parse --git-common-dir: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git rev-parse --git-common-dir failed in {worktree_path}")
        } else {
            stderr
        });
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let common = Path::new(&raw);
    let resolved = if common.is_absolute() {
        common.to_path_buf()
    } else {
        Path::new(worktree_path).join(common)
    };
    let repo = resolved.parent().ok_or_else(|| {
        format!(
            "Could not derive repository root from git common dir {}",
            resolved.display()
        )
    })?;
    Ok(repo.to_string_lossy().to_string())
}
