use std::sync::atomic::Ordering;

use tauri::State;

use crate::models::{AiModelSettings, AppSettings, SaveAiModelSettingsInput, SaveRepoRootsInput};
use crate::repositories::settings_repository;
use crate::services::{repo_scanner_service, settings_service};
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    settings_service::get_settings(&state)
}

#[tauri::command]
pub fn save_repo_roots(
    state: State<'_, AppState>,
    input: SaveRepoRootsInput,
) -> Result<AppSettings, String> {
    settings_service::save_repo_roots(&state, input)
}

#[tauri::command]
pub fn resolve_git_repository_path(path: String) -> Result<String, String> {
    repo_scanner_service::resolve_git_repository_path(&path)
}

#[tauri::command]
pub fn get_ai_model_settings(state: State<'_, AppState>) -> Result<AiModelSettings, String> {
    let agent_model = settings_repository::get_value(&state.db, "agent_default_model")?
        .unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let orchestrator_model = settings_repository::get_value(&state.db, "orchestrator_model")?
        .unwrap_or_else(|| "claude-opus-4-6".to_string());
    Ok(AiModelSettings { agent_model, orchestrator_model })
}

#[tauri::command]
pub fn save_ai_model_settings(
    state: State<'_, AppState>,
    input: SaveAiModelSettingsInput,
) -> Result<AiModelSettings, String> {
    settings_repository::set_value(&state.db, "agent_default_model", &input.agent_model)?;
    settings_repository::set_value(&state.db, "orchestrator_model", &input.orchestrator_model)?;
    // Update live orchestrator model in AppState.
    if let Ok(mut guard) = state.orchestrator_model.lock() {
        *guard = input.orchestrator_model.clone();
    }
    state.orchestrator_enabled.load(Ordering::Relaxed); // just a fence, no-op
    Ok(AiModelSettings {
        agent_model: input.agent_model,
        orchestrator_model: input.orchestrator_model,
    })
}

#[tauri::command]
pub fn save_has_completed_env_check(
    state: State<'_, AppState>,
    completed: bool,
) -> Result<AppSettings, String> {
    settings_service::save_has_completed_env_check(&state, completed)
}
