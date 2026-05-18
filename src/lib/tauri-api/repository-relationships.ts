import { invokeCommand } from './client';
import type {
  CreateRepositoryRelationshipInput,
  RelevantRepositoriesSuggestionResult,
  RepositoryRelationshipsResult,
  SuggestRelevantRepositoriesInput,
  UpdateRepositoryRelationshipInput,
} from '../../types/repository-relationship';

export function listRepositoryRelationships(): Promise<RepositoryRelationshipsResult> {
  return invokeCommand<RepositoryRelationshipsResult>('list_repository_relationships');
}

export function createAppRepositoryRelationship(
  input: CreateRepositoryRelationshipInput,
): Promise<RepositoryRelationshipsResult> {
  return invokeCommand<RepositoryRelationshipsResult>('create_app_repository_relationship', { input });
}

export function updateAppRepositoryRelationship(
  input: UpdateRepositoryRelationshipInput,
): Promise<RepositoryRelationshipsResult> {
  return invokeCommand<RepositoryRelationshipsResult>('update_app_repository_relationship', { input });
}

export function deleteAppRepositoryRelationship(
  relationshipId: string,
): Promise<RepositoryRelationshipsResult> {
  return invokeCommand<RepositoryRelationshipsResult>('delete_app_repository_relationship', { relationshipId });
}

export function suggestRelevantRepositoriesForTask(
  input: SuggestRelevantRepositoriesInput,
): Promise<RelevantRepositoriesSuggestionResult> {
  return invokeCommand<RelevantRepositoriesSuggestionResult>('suggest_relevant_repositories_for_task', { input });
}
