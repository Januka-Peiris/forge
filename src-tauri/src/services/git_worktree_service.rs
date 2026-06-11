use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct CreatedWorktree {
    pub path: String,
    pub branch: String,
}

pub fn create_mnemonic_worktree(
    repo_path: &str,
    managed_workspaces_root: &str,
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
    let managed_root = absolute_path(&expand_home(managed_workspaces_root))?;
    ensure_managed_root_outside_repo(repo_path, &managed_root)?;
    let worktree_path = mnemonic_worktree_path(repo_path, &managed_root, workspace_id)?;
    if worktree_path.exists() {
        return Err(format!(
            "Workspace path already exists: {}",
            worktree_path.display()
        ));
    }

    if let Some(parent) = worktree_path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "Failed to create Mnemonic worktree parent directory {}: {err}",
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

    ensure_forge_gitignored(repo_path);

    Ok(CreatedWorktree {
        path: worktree_path.to_string_lossy().to_string(),
        branch,
    })
}

/// Public entry point for callers outside this module (e.g. external worktree workspaces).
pub fn ensure_forge_gitignored_at(repo_path: &Path) {
    ensure_forge_gitignored(repo_path);
}

/// Ensures `.forge/` is listed in the repository root `.gitignore` so
/// Mnemonic's per-repo config directory never shows up as untracked.
/// Silently does nothing if already present or if the file cannot be written.
fn ensure_forge_gitignored(repo_path: &Path) {
    let gitignore = repo_path.join(".gitignore");
    let content = fs::read_to_string(&gitignore).unwrap_or_default();
    let already_ignored = content.lines().any(|line| {
        let trimmed = line.trim();
        trimmed == ".forge/" || trimmed == ".forge" || trimmed == "/.forge/" || trimmed == "/.forge"
    });
    if already_ignored {
        return;
    }
    let entry = if content.ends_with('\n') || content.is_empty() {
        ".forge/\n".to_string()
    } else {
        "\n.forge/\n".to_string()
    };
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(entry.as_bytes())
        });
}

pub fn remove_mnemonic_worktree(repo_path: &str, worktree_path: &str) -> Result<(), String> {
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

/// Mnemonic-managed worktrees live under the configured managed workspace root.
///
/// The repo folder groups worktrees by source checkout, and the leaf folder is the
/// workspace id so labels and branches can continue to live in the DB and Git.
fn mnemonic_worktree_path(
    repo_path: &Path,
    managed_root: &Path,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let repo_name = repo_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(sanitize_path_part)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "repository".to_string());
    let leaf = sanitize_path_part(workspace_id);
    Ok(managed_root.join(repo_name).join(leaf))
}

fn ensure_managed_root_outside_repo(repo_path: &Path, managed_root: &Path) -> Result<(), String> {
    let repo_root = std::fs::canonicalize(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
    if managed_root.starts_with(&repo_root) {
        return Err(format!(
            "Managed workspace location must be outside the repository checkout. Choose a folder outside {}.",
            repo_root.display()
        ));
    }
    Ok(())
}

fn expand_home(path: &str) -> String {
    if path == "~" {
        if let Some(home) = std::env::var_os("HOME") {
            return home.to_string_lossy().to_string();
        }
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return format!("{}/{}", home.to_string_lossy(), rest);
        }
    }
    path.to_string()
}

fn absolute_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|err| format!("Failed to resolve managed workspace location: {err}"))
    }
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
