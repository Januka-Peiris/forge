use tauri::State;

use crate::models::{DiscoveredRepository, ScanRepositoriesResult};
use crate::repositories::repository_repository;
use crate::services::{repo_scanner_service, worktree_discovery_service};
use crate::state::AppState;

#[tauri::command]
pub fn scan_repositories(state: State<'_, AppState>) -> Result<ScanRepositoriesResult, String> {
    repo_scanner_service::scan_repositories(&state)
}

#[tauri::command]
pub fn remove_repository(state: State<'_, AppState>, repository_id: String) -> Result<(), String> {
    repo_scanner_service::remove_repository(&state, &repository_id)
}

/// Return the list of known repositories from the DB without any scanning.
#[tauri::command]
pub fn list_repositories(state: State<'_, AppState>) -> Result<Vec<DiscoveredRepository>, String> {
    repository_repository::list(&state.db)
}

/// Add a single repository by its resolved git root path (no directory walking).
/// Returns the full updated list of repositories.
#[tauri::command]
pub fn add_repository(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<DiscoveredRepository>, String> {
    use std::path::Path;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let mut repo = repo_scanner_service::build_repository(Path::new(&path), &now)?;
    let (worktrees, _) = worktree_discovery_service::discover_worktrees(&repo.id, Path::new(&path));
    repo.worktrees = worktrees;

    repository_repository::upsert(&state.db, &repo)?;
    repository_repository::list(&state.db)
}
