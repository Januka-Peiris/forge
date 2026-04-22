use tauri::State;

use crate::models::{AgentMemory, SetAgentMemoryInput};
use crate::repositories::agent_memory_repository;
use crate::state::AppState;

#[tauri::command]
pub fn list_agent_memories(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
) -> Result<Vec<AgentMemory>, String> {
    match workspace_id.as_deref() {
        Some(ws) => agent_memory_repository::list_for_workspace(&state.db, ws),
        None => agent_memory_repository::list_all(&state.db),
    }
}

#[tauri::command]
pub fn set_agent_memory(
    state: State<'_, AppState>,
    input: SetAgentMemoryInput,
) -> Result<AgentMemory, String> {
    agent_memory_repository::upsert(
        &state.db,
        input.workspace_id.as_deref(),
        input.scope.as_deref(),
        &input.key,
        &input.value,
        input.origin.as_deref(),
        input.confidence,
        input.source_task_run_id.as_deref(),
        input.last_used_at.as_deref(),
    )
}

#[tauri::command]
pub fn delete_agent_memory(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    key: String,
) -> Result<(), String> {
    agent_memory_repository::delete(&state.db, workspace_id.as_deref(), &key)
}
