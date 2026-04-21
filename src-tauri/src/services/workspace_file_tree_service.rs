use std::fs;
use std::path::{Path, PathBuf};

use crate::context::ignore::IgnoreSet;
use crate::models::WorkspaceFileTreeNode;
use crate::repositories::workspace_repository;
use crate::state::AppState;

const DEFAULT_DEPTH: usize = 1;
const MAX_DEPTH: usize = 4;

pub fn list_workspace_file_tree(
    state: &AppState,
    workspace_id: &str,
    path: Option<&str>,
    depth: Option<usize>,
) -> Result<Vec<WorkspaceFileTreeNode>, String> {
    let root = workspace_root_path(state, workspace_id)?;
    let requested_depth = depth.unwrap_or(DEFAULT_DEPTH).clamp(1, MAX_DEPTH);
    let dir = resolve_directory(&root, path)?;
    let rel_prefix = relative_to_root(&root, &dir)?;
    let ignore = IgnoreSet::load(&root);
    list_nodes_in_dir(&root, &dir, rel_prefix.as_deref(), requested_depth, &ignore)
}

pub fn read_workspace_file(
    state: &AppState,
    workspace_id: &str,
    path: &str,
) -> Result<String, String> {
    let root = workspace_root_path(state, workspace_id)?;
    let file_path = resolve_file_path(&root, path)?;
    let bytes = fs::read(&file_path).map_err(|err| {
        format!(
            "Could not read workspace file {}: {err}",
            file_path.display()
        )
    })?;
    if bytes.len() > 2_000_000 {
        return Err("File is too large to open in the inline editor (max 2MB).".to_string());
    }
    String::from_utf8(bytes).map_err(|_| {
        "This file is not valid UTF-8 text and cannot be edited inline yet.".to_string()
    })
}

pub fn write_workspace_file(
    state: &AppState,
    workspace_id: &str,
    path: &str,
    content: &str,
) -> Result<(), String> {
    let root = workspace_root_path(state, workspace_id)?;
    let file_path = resolve_file_path(&root, path)?;
    fs::write(&file_path, content.as_bytes()).map_err(|err| {
        format!(
            "Could not write workspace file {}: {err}",
            file_path.display()
        )
    })
}

fn workspace_root_path(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let path = PathBuf::from(path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Workspace root path is unavailable: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn resolve_directory(root: &Path, path: Option<&str>) -> Result<PathBuf, String> {
    let Some(path) = path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(root.to_path_buf());
    };

    let candidate = root.join(path);
    if !candidate.exists() {
        return Err(format!("Path not found in workspace: {path}"));
    }
    if !candidate.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve path {path}: {err}"))?;

    if canonical_candidate == canonical_root || canonical_candidate.starts_with(&canonical_root) {
        Ok(canonical_candidate)
    } else {
        Err(format!("Path escapes workspace root: {path}"))
    }
}

fn resolve_file_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("File path is required.".to_string());
    }
    let candidate = root.join(trimmed);
    if !candidate.exists() {
        return Err(format!("File not found in workspace: {trimmed}"));
    }
    if !candidate.is_file() {
        return Err(format!("Path is not a file: {trimmed}"));
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to resolve path {trimmed}: {err}"))?;
    if canonical_candidate == canonical_root || canonical_candidate.starts_with(&canonical_root) {
        Ok(canonical_candidate)
    } else {
        Err(format!("Path escapes workspace root: {trimmed}"))
    }
}

fn list_nodes_in_dir(
    root: &Path,
    dir: &Path,
    rel_prefix: Option<&str>,
    depth: usize,
    ignore: &IgnoreSet,
) -> Result<Vec<WorkspaceFileTreeNode>, String> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(dir).map_err(|err| {
        format!(
            "Could not read workspace directory {}: {err}",
            dir.display()
        )
    })?;

    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() {
            continue;
        }

        let rel_path = match rel_prefix {
            Some(prefix) if !prefix.is_empty() => format!("{prefix}/{name}"),
            _ => name.clone(),
        };

        if should_exclude_path(ignore, &rel_path, file_type.is_dir()) {
            continue;
        }

        if file_type.is_dir() {
            let dir_path = entry.path();
            let children = if depth > 1 {
                Some(list_nodes_in_dir(
                    root,
                    &dir_path,
                    Some(&rel_path),
                    depth.saturating_sub(1),
                    ignore,
                )?)
            } else {
                None
            };
            let has_children = if let Some(children) = children.as_ref() {
                !children.is_empty()
            } else {
                directory_has_visible_children(&dir_path, &rel_path, ignore)
            };

            nodes.push(WorkspaceFileTreeNode {
                path: rel_path,
                name,
                kind: "dir".to_string(),
                has_children,
                children,
            });
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        nodes.push(WorkspaceFileTreeNode {
            path: rel_path,
            name,
            kind: "file".to_string(),
            has_children: false,
            children: None,
        });
    }

    sort_nodes(&mut nodes);
    Ok(nodes)
}

fn directory_has_visible_children(dir: &Path, rel_path: &str, ignore: &IgnoreSet) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() {
            continue;
        }
        let child_rel = format!("{rel_path}/{name}");
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if should_exclude_path(ignore, &child_rel, file_type.is_dir()) {
            continue;
        }
        if file_type.is_dir() || file_type.is_file() {
            return true;
        }
    }
    false
}

fn sort_nodes(nodes: &mut [WorkspaceFileTreeNode]) {
    nodes.sort_by(|left, right| {
        let left_rank = if left.kind == "dir" { 0 } else { 1 };
        let right_rank = if right.kind == "dir" { 0 } else { 1 };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

fn should_exclude_path(ignore: &IgnoreSet, rel_path: &str, is_dir: bool) -> bool {
    if ignore.should_exclude(rel_path) {
        return true;
    }
    if is_dir {
        let with_slash = format!("{rel_path}/");
        return ignore.should_exclude(&with_slash);
    }
    false
}

fn relative_to_root(root: &Path, path: &Path) -> Result<Option<String>, String> {
    let relative = path.strip_prefix(root).map_err(|_| {
        format!(
            "Path {} is not inside workspace root {}",
            path.display(),
            root.display()
        )
    })?;
    let raw = relative.to_string_lossy().replace('\\', "/");
    if raw.trim().is_empty() {
        Ok(None)
    } else {
        Ok(Some(raw))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_fixture_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("forge-file-tree-test-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    }

    #[test]
    fn excludes_ignored_paths_and_includes_source_files() {
        let root = temp_fixture_dir();
        let ignore = IgnoreSet::load(&root);
        write(&root.join("src/main.ts"), "console.log('ok')");
        write(&root.join("src/app.tsx"), "export {};");
        write(&root.join("node_modules/lib/index.js"), "ignored");
        write(&root.join(".git/config"), "ignored");

        let nodes = list_nodes_in_dir(&root, &root, None, 1, &ignore).expect("list files");

        assert!(nodes
            .iter()
            .any(|node| node.path == "src" && node.kind == "dir"));
        assert!(!nodes
            .iter()
            .any(|node| node.path.starts_with("node_modules")));
        assert!(!nodes.iter().any(|node| node.path.starts_with(".git")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reports_file_and_directory_shapes() {
        let root = temp_fixture_dir();
        let ignore = IgnoreSet::load(&root);
        write(&root.join("src/index.ts"), "export const x = 1;");

        let nodes = list_nodes_in_dir(&root, &root, None, 2, &ignore).expect("list files");
        let src = nodes
            .iter()
            .find(|node| node.path == "src")
            .expect("src dir");

        assert_eq!(src.kind, "dir");
        assert!(src.has_children);
        let src_children = src.children.as_ref().expect("src children");
        assert!(src_children
            .iter()
            .any(|node| node.path == "src/index.ts" && node.kind == "file"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn supports_nested_relative_directory_listing() {
        let root = temp_fixture_dir();
        let ignore = IgnoreSet::load(&root);
        write(
            &root.join("src/components/Tree.tsx"),
            "export function Tree() { return null; }",
        );
        write(
            &root.join("src/components/Node.tsx"),
            "export function Node() { return null; }",
        );

        let nested = list_nodes_in_dir(
            &root,
            &root.join("src/components"),
            Some("src/components"),
            1,
            &ignore,
        )
        .expect("list nested");

        assert!(nested
            .iter()
            .any(|node| node.path == "src/components/Tree.tsx"));
        assert!(nested
            .iter()
            .any(|node| node.path == "src/components/Node.tsx"));

        let _ = fs::remove_dir_all(root);
    }
}
