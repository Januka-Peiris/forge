use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct CreatedWorktree {
    pub path: String,
    pub branch: String,
}

pub fn create_forge_worktree(
    repo_path: &str,
    workspace_id: &str,
    branch: &str,
    base_branch: &str,
) -> Result<CreatedWorktree, String> {
    let repo_path = Path::new(repo_path);
    if !repo_path.exists() {
        return Err(format!(
            "Repository path does not exist: {}",
            repo_path.display()
        ));
    }

    let branch = sanitize_branch(branch)?;
    let worktree_path = forge_worktree_path(repo_path, workspace_id)?;
    if worktree_path.exists() {
        return Err(format!(
            "Workspace path already exists: {}",
            worktree_path.display()
        ));
    }

    if let Some(parent) = worktree_path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "Failed to create Forge worktree parent directory {}: {err}",
                parent.display()
            )
        })?;
    }

    if branch_exists(repo_path, &branch)? {
        git(
            repo_path,
            &[
                "worktree",
                "add",
                path_arg(&worktree_path).as_str(),
                &branch,
            ],
        )?;
    } else {
        let base = if base_branch.trim().is_empty() {
            "HEAD"
        } else {
            base_branch.trim()
        };
        git(
            repo_path,
            &[
                "worktree",
                "add",
                "-b",
                &branch,
                path_arg(&worktree_path).as_str(),
                base,
            ],
        )?;
    }

    Ok(CreatedWorktree {
        path: worktree_path.to_string_lossy().to_string(),
        branch,
    })
}

pub fn remove_forge_worktree(repo_path: &str, worktree_path: &str) -> Result<(), String> {
    let repo_path = Path::new(repo_path);
    let worktree_path = Path::new(worktree_path);
    git(
        repo_path,
        &[
            "worktree",
            "remove",
            "--force",
            path_arg(worktree_path).as_str(),
        ],
    )?;
    Ok(())
}

/// Clears stale `git worktree` registrations after the checkout directory was removed manually.
pub fn prune_worktrees(repo_path: &Path) -> Result<(), String> {
    git(repo_path, &["worktree", "prune"])?;
    Ok(())
}

pub fn list_branches(repo_path: &Path) -> Vec<String> {
    git(repo_path, &["branch", "--format=%(refname:short)"])
        .ok()
        .map(|output| {
            output
                .lines()
                .map(str::trim)
                .filter(|branch| !branch.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub fn local_branch_exists(repo_path: &Path, branch: &str) -> Result<bool, String> {
    branch_exists(repo_path, branch)
}

fn branch_exists(repo_path: &Path, branch: &str) -> Result<bool, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args([
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ])
        .output()
        .map_err(|err| format!("failed to run git show-ref: {err}"))?;

    Ok(output.status.success())
}

/// Forge-managed worktrees live under `<repo>/forge/<workspace_id>/`.
///
/// Paths are anchored to the repository checkout the user registered (not a sibling
/// tree under the parent directory). The leaf folder is the workspace id so shells
/// stay compact; labels and branches live in the DB and Git.
fn forge_worktree_path(repo_path: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    let leaf = sanitize_path_part(workspace_id);
    Ok(repo_path.join("forge").join(leaf))
}

fn sanitize_branch(branch: &str) -> Result<String, String> {
    let trimmed = branch.trim().trim_start_matches('/').trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }
    if trimmed.contains("..")
        || trimmed.contains(' ')
        || trimmed.contains('~')
        || trimmed.contains('^')
        || trimmed.contains(':')
        || trimmed.contains('\\')
    {
        return Err(format!("Unsupported branch name: {branch}"));
    }
    Ok(trimmed.to_string())
}

fn sanitize_path_part(input: &str) -> String {
    let part = input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();

    if part.is_empty() {
        "workspace".to_string()
    } else {
        part
    }
}

fn path_arg(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|err| format!("failed to run git in {}: {err}", repo_path.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git command failed in {}", repo_path.display())
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
