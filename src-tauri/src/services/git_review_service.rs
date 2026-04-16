use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::{WorkspaceChangedFile, WorkspaceFileDiff};
use crate::repositories::workspace_repository;
use crate::state::AppState;

const MAX_UNTRACKED_PREVIEW_BYTES: usize = 200_000;

pub fn get_workspace_changed_files(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<WorkspaceChangedFile>, String> {
    let root = workspace_root(state, workspace_id)?;
    ensure_git_worktree(&root)?;
    let porcelain = git(&root, &["status", "--porcelain=v1", "-z"])?;
    let mut files = parse_porcelain(workspace_id, &porcelain);

    for file in &mut files {
        let (additions, deletions) = diff_counts(&root, file);
        file.additions = additions;
        file.deletions = deletions;
    }

    Ok(files)
}

pub fn get_workspace_file_diff(
    state: &AppState,
    workspace_id: &str,
    path: &str,
) -> Result<WorkspaceFileDiff, String> {
    let root = workspace_root(state, workspace_id)?;
    ensure_git_worktree(&root)?;
    let changed_files = get_workspace_changed_files(state, workspace_id)?;
    let changed = changed_files
        .iter()
        .find(|file| file.path == path)
        .cloned()
        .unwrap_or_else(|| WorkspaceChangedFile {
            workspace_id: workspace_id.to_string(),
            path: path.to_string(),
            old_path: None,
            status: "modified".to_string(),
            staged: false,
            unstaged: true,
            additions: None,
            deletions: None,
        });

    let (diff, source, is_binary) = if changed.status == "untracked" {
        untracked_preview(&root, &changed.path)?
    } else {
        let mut parts = Vec::new();
        if changed.staged {
            if let Ok(staged) = git(&root, &["diff", "--cached", "--", &changed.path]) {
                if !staged.trim().is_empty() {
                    parts.push(staged);
                }
            }
        }
        if changed.unstaged || parts.is_empty() {
            if let Ok(unstaged) = git(&root, &["diff", "--", &changed.path]) {
                if !unstaged.trim().is_empty() {
                    parts.push(unstaged);
                }
            }
        }
        if parts.is_empty() && changed.status == "deleted" {
            if let Ok(deleted) = git(&root, &["diff", "HEAD", "--", &changed.path]) {
                if !deleted.trim().is_empty() {
                    parts.push(deleted);
                }
            }
        }

        let combined = parts.join("\n");
        let is_binary = combined.contains("Binary files") || combined.contains("GIT binary patch");
        let diff = if combined.trim().is_empty() {
            "No text diff available for this file.".to_string()
        } else {
            combined
        };
        (diff, "git_diff".to_string(), is_binary)
    };

    Ok(WorkspaceFileDiff {
        workspace_id: workspace_id.to_string(),
        path: changed.path,
        old_path: changed.old_path,
        status: changed.status,
        diff,
        is_binary,
        source,
    })
}

fn workspace_root(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let detail = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let root = detail
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(detail.worktree_path);
    let path = PathBuf::from(root);
    if !path.exists() {
        return Err(format!(
            "Workspace root path does not exist: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn ensure_git_worktree(root: &Path) -> Result<(), String> {
    let inside = git(root, &["rev-parse", "--is-inside-work-tree"])?;
    if inside.trim() == "true" {
        Ok(())
    } else {
        Err(format!("Path is not a git worktree: {}", root.display()))
    }
}

fn parse_porcelain(workspace_id: &str, porcelain: &str) -> Vec<WorkspaceChangedFile> {
    let entries = porcelain
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;

    while index < entries.len() {
        let entry = entries[index];
        if entry.len() < 4 {
            index += 1;
            continue;
        }

        let x = entry.as_bytes()[0] as char;
        let y = entry.as_bytes()[1] as char;
        let raw_path = entry[3..].to_string();
        let staged = x != ' ' && x != '?';
        let unstaged = y != ' ' || x == '?';
        let status = status_from_xy(x, y);
        let mut old_path = None;
        let path;

        if x == 'R' || x == 'C' {
            old_path = Some(raw_path);
            index += 1;
            path = entries.get(index).copied().unwrap_or_default().to_string();
        } else {
            path = raw_path;
        }

        files.push(WorkspaceChangedFile {
            workspace_id: workspace_id.to_string(),
            path,
            old_path,
            status,
            staged,
            unstaged,
            additions: None,
            deletions: None,
        });
        index += 1;
    }

    files
}

fn status_from_xy(x: char, y: char) -> String {
    if x == '?' {
        "untracked"
    } else if x == 'R' || y == 'R' {
        "renamed"
    } else if x == 'A' || y == 'A' {
        "added"
    } else if x == 'D' || y == 'D' {
        "deleted"
    } else {
        "modified"
    }
    .to_string()
}

fn diff_counts(root: &Path, file: &WorkspaceChangedFile) -> (Option<u32>, Option<u32>) {
    let output = if file.status == "untracked" {
        fs::read_to_string(root.join(&file.path))
            .ok()
            .map(|content| format!("0\t{}\t{}", content.lines().count(), file.path))
    } else if file.staged {
        git(root, &["diff", "--cached", "--numstat", "--", &file.path]).ok()
    } else {
        git(root, &["diff", "--numstat", "--", &file.path]).ok()
    };

    let Some(output) = output else {
        return (None, None);
    };
    let first = output.lines().next().unwrap_or_default();
    let mut parts = first.split_whitespace();
    let additions = parts.next().and_then(|value| value.parse::<u32>().ok());
    let deletions = parts.next().and_then(|value| value.parse::<u32>().ok());
    (additions, deletions)
}

fn untracked_preview(root: &Path, path: &str) -> Result<(String, String, bool), String> {
    let full_path = root.join(path);
    let metadata = fs::metadata(&full_path).map_err(|err| {
        format!(
            "Failed to inspect untracked file {}: {err}",
            full_path.display()
        )
    })?;
    if metadata.len() as usize > MAX_UNTRACKED_PREVIEW_BYTES {
        return Ok((
            format!(
                "Untracked file is too large to preview ({} bytes).",
                metadata.len()
            ),
            "untracked_preview".to_string(),
            false,
        ));
    }

    let bytes = fs::read(&full_path).map_err(|err| {
        format!(
            "Failed to read untracked file {}: {err}",
            full_path.display()
        )
    })?;
    if bytes.contains(&0) {
        return Ok((
            "Binary untracked file; no text diff available.".to_string(),
            "untracked_preview".to_string(),
            true,
        ));
    }

    let content = String::from_utf8_lossy(&bytes);
    let mut diff = format!(
        "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n"
    );
    for line in content.lines() {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    Ok((diff, "untracked_preview".to_string(), false))
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|err| format!("failed to run git in {}: {err}", root.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git command failed in {}", root.display())
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
