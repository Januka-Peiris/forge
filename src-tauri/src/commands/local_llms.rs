use tauri::State;

use crate::models::{AgentProfile, LocalLlmModel, LocalLlmProfileDiagnostic};
use crate::services::local_llm_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_local_llm_models(
    _state: State<'_, AppState>,
    provider: Option<String>,
) -> Result<Vec<LocalLlmModel>, String> {
    local_llm_service::list_local_llm_models(provider.as_deref())
}

#[tauri::command]
pub fn diagnose_local_llm_profile(
    _state: State<'_, AppState>,
    profile: AgentProfile,
) -> Result<LocalLlmProfileDiagnostic, String> {
    Ok(local_llm_service::diagnose_local_llm_profile(profile))
}
