use tauri::State;

use crate::models::{WorkspaceAgentContext, WorkspaceContextPreview};
use crate::services::agent_context_service;
use crate::services::repo_intelligence_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_agent_context(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceAgentContext, String> {
    agent_context_service::get_workspace_agent_context(&state, &workspace_id)
}

#[tauri::command]
pub fn get_workspace_context_preview(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceContextPreview, String> {
    agent_context_service::get_workspace_context_preview(&state, &workspace_id)
}

#[tauri::command]
pub fn refresh_workspace_repo_context(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceContextPreview, String> {
    agent_context_service::refresh_workspace_repo_context(&state, &workspace_id)
}

#[tauri::command]
pub fn build_workspace_repo_context(
    state: State<'_, AppState>,
    workspace_id: String,
    force: bool,
) -> Result<String, String> {
    if repo_intelligence_service::repo_intelligence_enabled(&state) {
        let snapshot = repo_intelligence_service::ensure_workspace_repo_intelligence(
            &state,
            &workspace_id,
            force,
        )?;
        Ok(format!(
            "Built repo intelligence: {} files indexed, {} symbols, branch={} commit={}",
            snapshot.files_indexed,
            snapshot.symbol_count,
            snapshot.default_branch,
            &snapshot.commit_hash[..8.min(snapshot.commit_hash.len())]
        ))
    } else {
        let workspace =
            crate::repositories::workspace_repository::get_detail(&state.db, &workspace_id)?
                .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
        let primary_path = workspace
            .summary
            .workspace_root_path
            .clone()
            .unwrap_or_else(|| workspace.worktree_path.clone());
        let root = std::path::Path::new(&primary_path);
        let (_, meta) = crate::context::discovery::build_repo_map(root, force, &state.db)?;
        Ok(format!(
            "Built repo map: {} files indexed, {} symbols, signal_score={:.2}, engine={}",
            meta.stats.files_indexed,
            meta.stats.symbol_count,
            meta.quality.signal_score,
            meta.generator.engine,
        ))
    }
}

#[tauri::command]
pub fn get_context_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<serde_json::Value, String> {
    if repo_intelligence_service::repo_intelligence_enabled(&state) {
        let workspace =
            crate::repositories::workspace_repository::get_detail(&state.db, &workspace_id)?
                .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
        let primary_path = workspace
            .summary
            .workspace_root_path
            .clone()
            .unwrap_or_else(|| workspace.worktree_path.clone());
        let root = std::path::Path::new(&primary_path);
        if let Ok(context_preview) = repo_intelligence_service::build_workspace_context_preview(
            &state,
            &workspace_id,
            None,
            &crate::context::schema::SelectConfig::default(),
        ) {
            let repo_status = repo_intelligence_service::workspace_repo_intelligence_status(
                &state,
                &workspace_id,
            )?
            .unwrap_or(serde_json::json!({ "enabled": true, "indexed": false }));
            return Ok(serde_json::json!({
                "mode": "repo_intelligence",
                "stale": context_preview.stale_map,
                "signalScore": context_preview.signal_score,
                "engine": "repo-intelligence-v1",
                "defaultBranch": crate::context::discovery::resolve_default_ref(root).ok().map(|r| r.branch).unwrap_or_else(|| "unknown".to_string()),
                "repoIntelligence": repo_status,
            }));
        }
    }

    let workspace =
        crate::repositories::workspace_repository::get_detail(&state.db, &workspace_id)?
            .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    let primary_path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let root = std::path::Path::new(&primary_path);
    let stale = crate::context::discovery::is_stale(root, &state.db);
    let meta_path = root
        .join(".forge")
        .join("context")
        .join("repo_map.meta.json");
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<crate::context::schema::RepoMapMetaV2>(&raw) {
            return Ok(serde_json::json!({
                "mode": "repo_map",
                "stale": stale,
                "signalScore": meta.quality.signal_score,
                "symbolCoverage": meta.quality.symbol_coverage,
                "engine": meta.generator.engine,
                "filesIndexed": meta.stats.files_indexed,
                "symbolCount": meta.stats.symbol_count,
                "defaultBranch": meta.default_branch,
                "baseCommit": &meta.base_commit[..8.min(meta.base_commit.len())],
            }));
        }
    }
    Ok(
        serde_json::json!({ "mode": "repo_map", "stale": true, "signalScore": 0.0, "engine": "none" }),
    )
}

#[tauri::command]
pub fn get_context_preview_with_hint(
    state: State<'_, AppState>,
    workspace_id: String,
    prompt_hint: Option<String>,
) -> Result<crate::context::schema::ContextPreview, String> {
    agent_context_service::get_context_preview_with_hint(
        &state,
        &workspace_id,
        prompt_hint.as_deref(),
    )
}
