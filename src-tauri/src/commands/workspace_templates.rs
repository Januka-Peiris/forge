use tauri::State;

use crate::models::WorkspaceTemplate;
use crate::repositories::workspace_template_repository;
use crate::state::AppState;

fn unique_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("tmpl-{now}")
}

#[tauri::command]
pub fn list_workspace_templates(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceTemplate>, String> {
    workspace_template_repository::list(&state.db)
}

#[tauri::command]
pub fn create_workspace_template(
    state: State<'_, AppState>,
    name: String,
    description: String,
    task_prompt: String,
    agent: String,
) -> Result<WorkspaceTemplate, String> {
    let id = unique_id();
    workspace_template_repository::create(&state.db, &id, &name, &description, &task_prompt, &agent)
}

#[tauri::command]
pub fn delete_workspace_template(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    workspace_template_repository::delete(&state.db, &id)
}
