use tauri::State;

use crate::models::WorkspacePromptTemplates;
use crate::services::prompt_template_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_prompt_templates(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspacePromptTemplates, String> {
    prompt_template_service::list_workspace_prompt_templates(&state, &workspace_id)
}
