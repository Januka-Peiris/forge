use tauri::State;

use crate::models::{
    CoordinationArtifact, CreateCoordinationArtifactInput, UpdateCoordinationArtifactInput,
    UpdateCoordinationArtifactStatusInput,
};
use crate::services::coordination_artifact_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_coordination_artifacts(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<CoordinationArtifact>, String> {
    coordination_artifact_service::list_coordination_artifacts(&state, &workspace_id)
}

#[tauri::command]
pub fn create_coordination_artifact(
    state: State<'_, AppState>,
    input: CreateCoordinationArtifactInput,
) -> Result<CoordinationArtifact, String> {
    coordination_artifact_service::create_coordination_artifact(&state, input)
}

#[tauri::command]
pub fn update_coordination_artifact(
    state: State<'_, AppState>,
    input: UpdateCoordinationArtifactInput,
) -> Result<CoordinationArtifact, String> {
    coordination_artifact_service::update_coordination_artifact(&state, input)
}

#[tauri::command]
pub fn delete_coordination_artifact(
    state: State<'_, AppState>,
    artifact_id: String,
) -> Result<(), String> {
    coordination_artifact_service::delete_coordination_artifact(&state, &artifact_id)
}

#[tauri::command]
pub fn update_coordination_artifact_status(
    state: State<'_, AppState>,
    input: UpdateCoordinationArtifactStatusInput,
) -> Result<CoordinationArtifact, String> {
    coordination_artifact_service::update_coordination_artifact_status(&state, input)
}
