use tauri::State;

use crate::models::{WorkspaceAgentContext, WorkspaceContextPreview};
use crate::services::agent_context_service;
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
    let workspace = crate::repositories::workspace_repository::get_detail(&state.db, &workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    let primary_path = workspace.summary.workspace_root_path.clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let root = std::path::Path::new(&primary_path);
    let (_, meta) = crate::context::discovery::build_repo_map(root, force, &state.db)?;
    // Return a summary string
    Ok(format!(
        "Built repo map: {} files indexed, {} symbols, signal_score={:.2}, engine={}",
        meta.stats.files_indexed,
        meta.stats.symbol_count,
        meta.quality.signal_score,
        meta.generator.engine,
    ))
}

#[tauri::command]
pub fn get_context_status(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<serde_json::Value, String> {
    let workspace = crate::repositories::workspace_repository::get_detail(&state.db, &workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} not found"))?;
    let primary_path = workspace.summary.workspace_root_path.clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let root = std::path::Path::new(&primary_path);
    let stale = crate::context::discovery::is_stale(root, &state.db);
    let meta_path = root.join(".forge").join("context").join("repo_map.meta.json");
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<crate::context::schema::RepoMapMetaV2>(&raw) {
            return Ok(serde_json::json!({
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
    Ok(serde_json::json!({ "stale": true, "signalScore": 0.0, "engine": "none" }))
}

#[tauri::command]
pub fn get_context_preview_with_hint(
    state: State<'_, AppState>,
    workspace_id: String,
    prompt_hint: Option<String>,
) -> Result<crate::context::schema::ContextPreview, String> {
    let cfg = crate::context::schema::SelectConfig::default();
    crate::context::preview::build_context_preview(
        &state,
        &workspace_id,
        prompt_hint.as_deref(),
        &cfg,
    )
}
