use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{
    AgentContextWorktree, RepoMap, RepoMapEntry, RepoMapMeta, WorkspaceAgentContext,
    WorkspaceContextItem, WorkspaceContextPreview,
};
use crate::repositories::workspace_repository;
use crate::state::AppState;

const REPO_MAP_VERSION: u32 = 3;

pub fn get_workspace_agent_context(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceAgentContext, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let primary_path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let linked_worktrees = linked_worktrees(state, workspace_id)?;
    let prompt_preamble = format_prompt_preamble(&primary_path, &linked_worktrees);
    Ok(WorkspaceAgentContext {
        workspace_id: workspace_id.to_string(),
        primary_path,
        linked_worktrees,
        prompt_preamble,
    })
}

pub fn build_session_open_context(state: &AppState, workspace_id: &str) -> Option<String> {
    crate::context::preview::build_session_context_string(state, workspace_id)
}

pub fn get_workspace_context_preview(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceContextPreview, String> {
    let cfg = crate::context::schema::SelectConfig::default();
    let preview = crate::context::preview::build_context_preview(state, workspace_id, None, &cfg)?;

    // Map new ContextPreview → old WorkspaceContextPreview for frontend compat
    let items = preview.included.iter().map(|seg| WorkspaceContextItem {
        label: seg.path.clone(),
        path: Some(seg.path.clone()),
        kind: seg.tier.clone(),
        priority: if seg.tier == "mandatory" { 10 } else { 30 },
        chars: seg.content.chars().count(),
        included: true,
        trimmed: false,
    }).collect();

    let prompt_context = preview.included.iter().map(|s| s.content.as_str()).collect::<Vec<_>>().join("\n\n");
    let approx_chars = prompt_context.chars().count();

    // Get branch info for display
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    let primary_path = workspace.summary.workspace_root_path.clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let root = std::path::Path::new(&primary_path);
    let (repo_root_str, default_branch, ref_name, commit_hash) =
        crate::context::discovery::resolve_default_ref(root)
            .map(|r| (primary_path.clone(), r.branch.clone(), r.ref_name.clone(), r.commit_hash.clone()))
            .unwrap_or_else(|_| (primary_path.clone(), "unknown".to_string(), "unknown".to_string(), String::new()));

    let status = if preview.stale_map { "stale" } else { "fresh" };

    Ok(WorkspaceContextPreview {
        workspace_id: workspace_id.to_string(),
        repo_root: repo_root_str,
        status: status.to_string(),
        default_branch,
        ref_name,
        commit_hash,
        generated_at: None,
        approx_chars,
        max_chars: (cfg.soft_repo_context_tokens * 4) as usize,
        trimmed: !preview.excluded.is_empty(),
        items,
        prompt_context,
        warning: preview.warning,
    })
}

pub fn refresh_workspace_repo_context(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceContextPreview, String> {
    // Force-rebuild the map, then return preview
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    let primary_path = workspace.summary.workspace_root_path.clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let root = std::path::Path::new(&primary_path);
    let _ = crate::context::discovery::build_repo_map(root, true, &state.db);
    get_workspace_context_preview(state, workspace_id)
}

pub fn format_prompt_preamble(primary_path: &str, linked: &[AgentContextWorktree]) -> String {
    if linked.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "Forge linked repository context:".to_string(),
        format!("- Primary writable workspace: {primary_path}"),
        "- Linked repositories are read-only context unless the user explicitly asks to edit them:"
            .to_string(),
    ];
    for item in linked {
        let branch = item.branch.as_deref().unwrap_or("detached");
        lines.push(format!("  - {} ({branch}): {}", item.repo_name, item.path));
    }
    lines.push("Use these paths for cross-repo understanding and mention before making assumptions across repos.".to_string());
    lines.join("\n")
}

fn linked_worktrees(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<AgentContextWorktree>, String> {
    Ok(
        workspace_repository::list_linked_worktrees_for_workspace(&state.db, workspace_id)?
            .into_iter()
            .map(|linked| AgentContextWorktree {
                repo_id: linked.repo_id,
                repo_name: linked.repo_name,
                path: linked.path,
                branch: linked.branch,
                head: linked.head,
            })
            .collect::<Vec<_>>(),
    )
}

struct ContextFragment {
    label: String,
    path: Option<String>,
    kind: String,
    priority: u8,
    body: String,
}

impl ContextFragment {
    fn new(label: String, path: Option<String>, kind: &str, priority: u8, body: String) -> Self {
        Self {
            label,
            path,
            kind: kind.to_string(),
            priority,
            body,
        }
    }

    fn into_item(self, chars: usize, included: bool, trimmed: bool) -> WorkspaceContextItem {
        WorkspaceContextItem {
            label: self.label,
            path: self.path,
            kind: self.kind,
            priority: self.priority,
            chars,
            included,
            trimmed,
        }
    }
}

struct DefaultRef {
    branch: String,
    ref_name: String,
    commit_hash: String,
}

struct RepoMapState {
    map: RepoMap,
    meta: RepoMapMeta,
    warning: Option<String>,
}

fn ensure_repo_map(
    root: &Path,
    default_ref: &DefaultRef,
    force_refresh: bool,
) -> Result<RepoMapState, String> {
    let context_dir = root.join(".forge").join("context");
    let map_path = context_dir.join("repo_map.json");
    let meta_path = context_dir.join("repo_map.meta.json");

    let existing_meta = read_json::<RepoMapMeta>(&meta_path).ok();
    let missing = !map_path.exists() || !meta_path.exists();
    let stale = existing_meta
        .as_ref()
        .map(|meta| meta.commit_hash != default_ref.commit_hash || meta.version != REPO_MAP_VERSION)
        .unwrap_or(true);

    if force_refresh || missing || stale {
        fs::create_dir_all(&context_dir)
            .map_err(|err| format!("Failed to create {}: {err}", context_dir.display()))?;
        let map = generate_repo_map(root, default_ref)?;
        let meta = RepoMapMeta {
            version: map.version,
            branch: map.branch.clone(),
            ref_name: map.ref_name.clone(),
            commit_hash: map.commit_hash.clone(),
            generated_at: map.generated_at.clone(),
        };
        write_json(&map_path, &map)?;
        write_json(&meta_path, &meta)?;
        return Ok(RepoMapState {
            map,
            meta,
            warning: None,
        });
    }

    let map = read_json::<RepoMap>(&map_path)
        .map_err(|err| format!("Failed to read {}: {err}", map_path.display()))?;
    let meta = existing_meta
        .ok_or_else(|| format!("Missing repo map metadata at {}", meta_path.display()))?;
    Ok(RepoMapState {
        map,
        meta,
        warning: None,
    })
}

fn extract_symbols(content: &str, ext: &str) -> Vec<String> {
    let mut symbols = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        let sym = match ext {
            "rs" => {
                if let Some(rest) = trimmed.strip_prefix("pub fn ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else if let Some(rest) = trimmed.strip_prefix("pub struct ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("pub enum ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("pub trait ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("pub type ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else { None }
            },
            "ts" | "tsx" | "js" | "jsx" => {
                if let Some(rest) = trimmed.strip_prefix("export function ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export async function ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export class ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export interface ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export type ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export const ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else if let Some(rest) = trimmed.strip_prefix("export default function ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else { None }
            },
            "py" => {
                if let Some(rest) = trimmed.strip_prefix("def ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else if let Some(rest) = trimmed.strip_prefix("async def ") {
                    rest.split('(').next().map(|s| s.trim().to_string())
                } else if let Some(rest) = trimmed.strip_prefix("class ") {
                    rest.split(|c: char| !c.is_alphanumeric() && c != '_').next().map(|s| s.to_string())
                } else { None }
            },
            "go" => {
                if trimmed.starts_with("func ") {
                    trimmed.split('(').next().and_then(|s| s.strip_prefix("func ")).map(|s| s.trim().to_string())
                } else { None }
            },
            _ => None,
        };
        if let Some(name) = sym {
            let name = name.trim().to_string();
            if !name.is_empty() && name.len() < 80 && !symbols.contains(&name) {
                symbols.push(name);
            }
        }
    }
    symbols.truncate(30); // max 30 symbols per file
    symbols
}

fn generate_repo_map(root: &Path, default_ref: &DefaultRef) -> Result<RepoMap, String> {
    let output = git(
        root,
        &["ls-tree", "-r", "--name-only", &default_ref.ref_name],
    )?;
    let mut dirs = BTreeSet::new();
    let mut entries = Vec::new();
    let mut processed_count: usize = 0;

    for raw in output.lines() {
        let path = raw.trim();
        if path.is_empty() || should_exclude_path(path) {
            continue;
        }
        collect_parent_dirs(path, &mut dirs);
        let symbols = if processed_count < 500 {
            let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(ext, "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go") {
                processed_count += 1;
                let content_result = git(root, &["show", &format!("{}:{}", default_ref.ref_name, path)]);
                match content_result {
                    Ok(content) if content.len() < 150_000 => extract_symbols(&content, ext),
                    _ => Vec::new(),
                }
            } else { Vec::new() }
        } else { Vec::new() };
        entries.push(RepoMapEntry {
            path: path.to_string(),
            kind: "file".to_string(),
            symbols,
        });
    }

    let mut dir_entries = dirs
        .into_iter()
        .map(|path| RepoMapEntry {
            path,
            kind: "dir".to_string(),
            symbols: Vec::new(),
        })
        .collect::<Vec<_>>();
    dir_entries.append(&mut entries);
    dir_entries.sort_by(|a, b| a.path.cmp(&b.path).then(a.kind.cmp(&b.kind)));

    Ok(RepoMap {
        version: REPO_MAP_VERSION,
        generated_at: unix_timestamp_string(),
        branch: default_ref.branch.clone(),
        ref_name: default_ref.ref_name.clone(),
        commit_hash: default_ref.commit_hash.clone(),
        entries: dir_entries,
    })
}

fn repo_root(path: &Path) -> Result<PathBuf, String> {
    let output = git(path, &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(output.trim()))
}

fn resolve_default_ref(root: &Path) -> Result<DefaultRef, String> {
    let candidates = [
        git(
            root,
            &[
                "symbolic-ref",
                "--quiet",
                "--short",
                "refs/remotes/origin/HEAD",
            ],
        )
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()),
        Some("main".to_string()),
        Some("master".to_string()),
        git(root, &["branch", "--show-current"])
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    ];

    for candidate in candidates.into_iter().flatten() {
        if let Ok(commit_hash) = git(root, &["rev-parse", "--verify", &candidate]) {
            let branch = candidate
                .strip_prefix("origin/")
                .unwrap_or(&candidate)
                .to_string();
            return Ok(DefaultRef {
                branch,
                ref_name: candidate,
                commit_hash: commit_hash.trim().to_string(),
            });
        }
    }

    let commit_hash = git(root, &["rev-parse", "HEAD"])?;
    Ok(DefaultRef {
        branch: "HEAD".to_string(),
        ref_name: "HEAD".to_string(),
        commit_hash: commit_hash.trim().to_string(),
    })
}

fn compressed_repo_map(map: &RepoMap) -> String {
    let mut lines = vec![format!(
        "default={} commit={}",
        map.branch,
        short_hash(&map.commit_hash)
    )];
    for entry in &map.entries {
        if entry.kind == "dir" {
            lines.push(format!("{}/", entry.path));
        } else if entry.symbols.is_empty() {
            lines.push(entry.path.clone());
        } else {
            lines.push(format!("{} — {}", entry.path, entry.symbols.join(", ")));
        }
    }
    lines.join("\n")
}

fn related_file_paths(map: &RepoMap, changed_paths: &HashSet<String>) -> Vec<String> {
    if changed_paths.is_empty() {
        return Vec::new();
    }
    let changed_dirs = changed_paths
        .iter()
        .filter_map(|path| Path::new(path).parent())
        .map(|path| path.to_string_lossy().to_string())
        .collect::<HashSet<_>>();

    map.entries
        .iter()
        .filter(|entry| entry.kind == "file" && !changed_paths.contains(&entry.path))
        .filter(|entry| {
            Path::new(&entry.path)
                .parent()
                .map(|parent| changed_dirs.contains(&parent.to_string_lossy().to_string()))
                .unwrap_or(false)
        })
        .map(|entry| format!("- {}", entry.path))
        .collect()
}

fn collect_parent_dirs(path: &str, dirs: &mut BTreeSet<String>) {
    let mut current = Path::new(path).parent();
    while let Some(dir) = current {
        let value = dir.to_string_lossy();
        if value.is_empty() {
            break;
        }
        dirs.insert(value.to_string());
        current = dir.parent();
    }
}

fn should_exclude_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let parts = normalized.split('/').collect::<Vec<_>>();
    let excluded_dirs = [
        ".git",
        ".forge/context",
        "node_modules",
        "dist",
        "dist-ssr",
        "target",
        ".next",
        "coverage",
        ".cache",
        ".turbo",
    ];
    if excluded_dirs
        .iter()
        .any(|dir| normalized == *dir || normalized.starts_with(&format!("{dir}/")))
    {
        return true;
    }
    if parts
        .iter()
        .any(|part| matches!(*part, "node_modules" | "target" | "dist" | "coverage"))
    {
        return true;
    }
    matches!(
        Path::new(&normalized)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref(),
        Some(
            "png"
                | "jpg"
                | "jpeg"
                | "gif"
                | "webp"
                | "ico"
                | "icns"
                | "pdf"
                | "zip"
                | "gz"
                | "tar"
                | "mp4"
                | "mov"
                | "woff"
                | "woff2"
                | "ttf"
                | "otf"
                | "lock"
        )
    )
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let raw = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&raw).map_err(|err| err.to_string())
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, format!("{raw}\n"))
        .map_err(|err| format!("Failed to write {}: {err}", path.display()))
}

fn unix_timestamp_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn short_hash(hash: &str) -> String {
    hash.chars().take(8).collect()
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|err| format!("failed to run git in {}: {err}", root.display()))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("git command failed in {}", root.display())
        } else {
            stderr
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_linked_context_has_no_preamble() {
        assert_eq!(format_prompt_preamble("/tmp/app", &[]), "");
    }

    #[test]
    fn formats_linked_context_as_read_only() {
        let preamble = format_prompt_preamble(
            "/tmp/frontend",
            &[AgentContextWorktree {
                repo_id: "repo-backend".to_string(),
                repo_name: "backend".to_string(),
                path: "/tmp/backend".to_string(),
                branch: Some("main".to_string()),
                head: None,
            }],
        );
        assert!(preamble.contains("Primary writable workspace: /tmp/frontend"));
        assert!(preamble.contains("backend (main): /tmp/backend"));
        assert!(preamble.contains("read-only context"));
    }

    #[test]
    fn excludes_heavy_paths() {
        assert!(should_exclude_path("node_modules/react/index.js"));
        assert!(should_exclude_path("src-tauri/target/debug/app"));
        assert!(should_exclude_path("dist/assets/app.js"));
        assert!(!should_exclude_path("src/App.tsx"));
    }
}
