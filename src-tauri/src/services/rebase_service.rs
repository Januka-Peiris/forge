use std::time::Duration;

use tauri::Emitter;

use crate::repositories::{activity_repository, workspace_repository};
use crate::services::agent_process_service;
use crate::state::AppState;

/// How often to attempt auto-rebase across all active workspaces.
const REBASE_INTERVAL_SECS: u64 = 30 * 60;

/// Spawn a background thread that periodically rebases every active workspace
/// against its base branch. On conflict the rebase is aborted and a
/// `forge://workspace-rebase-conflict` event is emitted.
pub fn start_auto_rebase_loop(state: AppState) {
    std::thread::spawn(move || {
        // Initial delay so startup is unaffected.
        std::thread::sleep(Duration::from_secs(REBASE_INTERVAL_SECS));
        loop {
            if let Err(err) = run_rebase_pass(&state) {
                log::warn!(target: "forge_lib", "auto-rebase pass error: {err}");
            }
            std::thread::sleep(Duration::from_secs(REBASE_INTERVAL_SECS));
        }
    });
}

fn run_rebase_pass(state: &AppState) -> Result<(), String> {
    let workspaces = workspace_repository::list(&state.db)?;

    for workspace in workspaces {
        if workspace.status == "Merged" {
            continue;
        }

        let detail = match workspace_repository::get_detail(&state.db, &workspace.id)? {
            Some(d) => d,
            None => continue,
        };

        if detail.worktree_path.is_empty() {
            continue;
        }

        let base_branch = workspace.branch_health.base_branch.clone();
        let base_branch = if base_branch.is_empty() {
            "main".to_string()
        } else {
            base_branch
        };

        let fetch_ok = std::process::Command::new("git")
            .args(["fetch", "origin"])
            .current_dir(&detail.worktree_path)
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);

        if !fetch_ok {
            log::warn!(
                target: "forge_lib",
                "auto-rebase: git fetch failed for workspace {} ({})",
                workspace.id,
                detail.worktree_path,
            );
            continue;
        }

        let rebase_output = std::process::Command::new("git")
            .args(["rebase", &format!("origin/{base_branch}")])
            .current_dir(&detail.worktree_path)
            .output();

        match rebase_output {
            Ok(out) if out.status.success() => {
                let now = agent_process_service::timestamp();
                log::info!(
                    target: "forge_lib",
                    "auto-rebase: workspace {} rebased onto origin/{base_branch}",
                    workspace.id,
                );
                let _ = workspace_repository::update_last_rebase(&state.db, &workspace.id, &now);
                let _ = activity_repository::record(
                    &state.db,
                    &workspace.id,
                    &workspace.repo,
                    Some(&workspace.branch),
                    "Auto-rebase succeeded",
                    "success",
                    Some(&format!("Rebased onto origin/{base_branch}")),
                );
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                log::warn!(
                    target: "forge_lib",
                    "auto-rebase: conflict for workspace {}: {stderr}",
                    workspace.id,
                );
                let _ = std::process::Command::new("git")
                    .args(["rebase", "--abort"])
                    .current_dir(&detail.worktree_path)
                    .output();
                let _ = activity_repository::record(
                    &state.db,
                    &workspace.id,
                    &workspace.repo,
                    Some(&workspace.branch),
                    "Auto-rebase conflict",
                    "warning",
                    Some(&format!("Conflict rebasing onto origin/{base_branch} — rebase aborted")),
                );
                let _ = state.app_handle.emit(
                    "forge://workspace-rebase-conflict",
                    serde_json::json!({
                        "workspaceId": workspace.id,
                        "workspaceName": workspace.name,
                        "branch": workspace.branch,
                        "baseBranch": base_branch,
                    }),
                );
            }
            Err(err) => {
                log::warn!(
                    target: "forge_lib",
                    "auto-rebase: git rebase failed to launch for workspace {}: {err}",
                    workspace.id,
                );
            }
        }
    }

    Ok(())
}
