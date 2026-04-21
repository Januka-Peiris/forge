use tauri::State;

use crate::models::WorkspaceFileTreeNode;
use crate::services::workspace_file_tree_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_workspace_file_tree(
    state: State<'_, AppState>,
    workspace_id: String,
    path: Option<String>,
    depth: Option<u8>,
) -> Result<Vec<WorkspaceFileTreeNode>, String> {
    workspace_file_tree_service::list_workspace_file_tree(
        &state,
        &workspace_id,
        path.as_deref(),
        depth.map(usize::from),
    )
}

#[tauri::command]
pub fn read_workspace_file(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
) -> Result<String, String> {
    workspace_file_tree_service::read_workspace_file(&state, &workspace_id, &path)
}

#[tauri::command]
pub fn write_workspace_file(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    workspace_file_tree_service::write_workspace_file(&state, &workspace_id, &path, &content)
}
