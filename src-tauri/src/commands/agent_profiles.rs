use tauri::State;

use crate::models::AgentProfile;
use crate::services::agent_profile_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_agent_profiles(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
) -> Result<Vec<AgentProfile>, String> {
    agent_profile_service::list_workspace_agent_profiles(&state, workspace_id.as_deref())
}
