use std::path::Path;
use std::process::Command;

use crate::models::DiscoveredWorktree;

pub fn discover_worktrees(
    repo_id: &str,
    repo_path: &Path,
) -> (Vec<DiscoveredWorktree>, Vec<String>) {
    let mut warnings = Vec::new();
    let output = match git(repo_path, &["worktree", "list", "--porcelain"]) {
        Ok(output) => output,
        Err(err) => {
            warnings.push(format!(
                "Could not list worktrees for {}: {err}",
                repo_path.display()
            ));
            return (Vec::new(), warnings);
        }
    };

    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_head: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut current_detached = false;

    for line in output.lines().chain(std::iter::once("")) {
        if line.trim().is_empty() {
            if let Some(path) = current_path.take() {
                let path_ref = Path::new(&path);
                let branch = current_branch
                    .take()
                    .map(|branch| branch.trim_start_matches("refs/heads/").to_string())
                    .or_else(|| git(path_ref, &["branch", "--show-current"]).ok())
                    .filter(|branch| !branch.trim().is_empty());
                let head = current_head
                    .take()
                    .or_else(|| git(path_ref, &["rev-parse", "--short", "HEAD"]).ok());
                let is_dirty = is_dirty(path_ref);
                let is_detached = current_detached || branch.is_none();

                if !should_skip_discovered_worktree(repo_path, path_ref) {
                    worktrees.push(DiscoveredWorktree {
                        id: stable_id(&format!("{repo_id}:{path}")),
                        repo_id: repo_id.to_string(),
                        path,
                        branch,
                        head,
                        is_dirty,
                        is_detached,
                    });
                }
            }

            current_head = None;
            current_branch = None;
            current_detached = false;
            continue;
        }

        if let Some(value) = line.strip_prefix("worktree ") {
            current_path = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("HEAD ") {
            current_head = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("branch ") {
            current_branch = Some(value.to_string());
        } else if line == "detached" {
            current_detached = true;
        }
    }

    (worktrees, warnings)
}

pub fn current_branch(path: &Path) -> Option<String> {
    git(path, &["branch", "--show-current"])
        .ok()
        .filter(|branch| !branch.trim().is_empty())
}

pub fn head(path: &Path) -> Option<String> {
    git(path, &["rev-parse", "--short", "HEAD"])
        .ok()
        .filter(|head| !head.trim().is_empty())
}

pub fn is_dirty(path: &Path) -> bool {
    git(path, &["status", "--porcelain"])
        .map(|status| !status.trim().is_empty())
        .unwrap_or(false)
}

/// Hides tool-managed checkouts from "discovered worktrees" so the UI only shows human branches.
fn should_skip_discovered_worktree(repo_root: &Path, worktree_path: &Path) -> bool {
    let wt = worktree_path.to_string_lossy().replace('\\', "/");
    if wt.contains("/.forge-worktrees/")
        || wt.ends_with("/.forge-worktrees")
        || wt.contains("/.cursor/worktrees/")
        || wt.contains("/.codex/")
        || wt.contains("/.codex-app/")
    {
        return true;
    }
    if is_forge_workspace_folder_under_repo(repo_root, worktree_path) {
        return true;
    }
    false
}

/// `<repo>/forge/ws-NNN` checkouts created by Forge (see `git_worktree_service`).
fn is_forge_workspace_folder_under_repo(repo_root: &Path, worktree_path: &Path) -> bool {
    if let Ok(rel) = worktree_path.strip_prefix(repo_root) {
        return path_starts_with_forge_ws(rel);
    }
    let Ok(repo_canon) = std::fs::canonicalize(repo_root) else {
        return false;
    };
    let Ok(wt_canon) = std::fs::canonicalize(worktree_path) else {
        return false;
    };
    wt_canon
        .strip_prefix(&repo_canon)
        .ok()
        .is_some_and(|rel| path_starts_with_forge_ws(rel))
}

fn path_starts_with_forge_ws(rel: &Path) -> bool {
    let mut it = rel.components();
    match (it.next(), it.next()) {
        (Some(first), Some(second))
            if first.as_os_str() == "forge" && is_ws_id_folder(second.as_os_str()) =>
        {
            true
        }
        _ => false,
    }
}

fn is_ws_id_folder(name: &std::ffi::OsStr) -> bool {
    let s = name.to_string_lossy();
    let Some(rest) = s.strip_prefix("ws-") else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .map_err(|err| format!("failed to run git: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn stable_id(input: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("wt-{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_forge_managed_ws_folder() {
        let repo = Path::new("/proj/repo");
        assert!(should_skip_discovered_worktree(
            repo,
            Path::new("/proj/repo/forge/ws-001")
        ));
        assert!(!should_skip_discovered_worktree(
            repo,
            Path::new("/proj/repo/forge/not-ws")
        ));
    }

    #[test]
    fn skips_agent_sandbox_paths() {
        let repo = Path::new("/r");
        assert!(should_skip_discovered_worktree(
            repo,
            Path::new("/tmp/foo/.codex/session")
        ));
        assert!(should_skip_discovered_worktree(
            repo,
            Path::new("/home/u/.codex-app/worktrees/a923/proj")
        ));
        assert!(should_skip_discovered_worktree(
            repo,
            Path::new("/tmp/foo/.cursor/worktrees/bar/abc")
        ));
        assert!(should_skip_discovered_worktree(
            repo,
            Path::new("/legacy/.forge-worktrees/x/y")
        ));
    }
}
