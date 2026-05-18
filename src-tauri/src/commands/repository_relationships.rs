use tauri::State;

use crate::models::{
    CreateRepositoryRelationshipInput, RelevantRepositoriesSuggestionResult,
    RepositoryRelationshipsResult, SuggestRelevantRepositoriesInput,
    UpdateRepositoryRelationshipInput,
};
use crate::services::repository_relationship_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_repository_relationships(
    state: State<'_, AppState>,
) -> Result<RepositoryRelationshipsResult, String> {
    repository_relationship_service::list_repository_relationships(&state)
}

#[tauri::command]
pub fn create_app_repository_relationship(
    state: State<'_, AppState>,
    input: CreateRepositoryRelationshipInput,
) -> Result<RepositoryRelationshipsResult, String> {
    repository_relationship_service::create_app_repository_relationship(&state, input)
}

#[tauri::command]
pub fn update_app_repository_relationship(
    state: State<'_, AppState>,
    input: UpdateRepositoryRelationshipInput,
) -> Result<RepositoryRelationshipsResult, String> {
    repository_relationship_service::update_app_repository_relationship(&state, input)
}

#[tauri::command]
pub fn delete_app_repository_relationship(
    state: State<'_, AppState>,
    relationship_id: String,
) -> Result<RepositoryRelationshipsResult, String> {
    repository_relationship_service::delete_app_repository_relationship(&state, &relationship_id)
}

#[tauri::command]
pub fn suggest_relevant_repositories_for_task(
    state: State<'_, AppState>,
    input: SuggestRelevantRepositoriesInput,
) -> Result<RelevantRepositoriesSuggestionResult, String> {
    repository_relationship_service::suggest_relevant_repositories_for_task(&state, input)
}
