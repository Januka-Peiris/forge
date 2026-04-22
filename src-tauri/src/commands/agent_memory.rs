use tauri::State;

use crate::models::{AgentMemory, SetAgentMemoryInput};
use crate::repositories::agent_memory_repository;
use crate::services::agent_memory_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_agent_memories(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
) -> Result<Vec<AgentMemory>, String> {
    agent_memory_service::sync_candidate_memories(&state, workspace_id.as_deref())?;
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
        agent_memory_repository::AgentMemoryUpsert {
            workspace_id: input.workspace_id.as_deref(),
            scope: input.scope.as_deref(),
            key: &input.key,
            value: &input.value,
            origin: input.origin.as_deref(),
            status: input.status.as_deref(),
            confidence: input.confidence,
            source_task_run_id: input.source_task_run_id.as_deref(),
            source_label: input.source_label.as_deref(),
            source_detail: input.source_detail.as_deref(),
            last_used_at: input.last_used_at.as_deref(),
        },
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
