use crate::models::{AppSettings, SaveRepoRootsInput};
use crate::repositories::{repository_repository, settings_repository};
use crate::state::AppState;

pub fn get_settings(state: &AppState) -> Result<AppSettings, String> {
    Ok(AppSettings {
        repo_roots: settings_repository::get_repo_roots(&state.db)?,
        discovered_repositories: repository_repository::list(&state.db)?,
    })
}

pub fn save_repo_roots(state: &AppState, input: SaveRepoRootsInput) -> Result<AppSettings, String> {
    settings_repository::save_repo_roots(&state.db, &input.repo_roots)?;
    get_settings(state)
}
