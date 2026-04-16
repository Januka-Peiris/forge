use tauri::State;

use crate::models::WorkspaceAttention;
use crate::services::workspace_attention_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_attention(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceAttention>, String> {
    workspace_attention_service::list_workspace_attention(&state)
}

#[tauri::command]
pub fn mark_workspace_attention_read(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    workspace_attention_service::mark_workspace_attention_read(&state, &workspace_id)
}
