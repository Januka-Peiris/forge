export const REPOSITORY_RELATIONSHIP_KINDS = [
  'frontend_backend',
  'sdk_api',
  'shared_schema',
  'deployment_dependency',
  'event_flow',
  'depends_on',
  'related',
] as const;

export type RepositoryRelationshipKind = typeof REPOSITORY_RELATIONSHIP_KINDS[number];
export type RepositoryRelationshipSource = 'app' | 'config' | string;

export interface RepositoryRelationship {
  id: string;
  appRelationshipId?: string | null;
  fromRepoId: string;
  fromRepoName: string;
  toRepoId: string;
  toRepoName: string;
  kind: RepositoryRelationshipKind | string;
  label?: string | null;
  notes?: string | null;
  sources: RepositoryRelationshipSource[];
  configPaths: string[];
  readOnly: boolean;
}

export interface RepositoryRelationshipsResult {
  relationships: RepositoryRelationship[];
  warnings: string[];
}

export interface CreateRepositoryRelationshipInput {
  fromRepoId: string;
  toRepoId: string;
  kind: RepositoryRelationshipKind | string;
  label?: string | null;
  notes?: string | null;
}

export interface UpdateRepositoryRelationshipInput extends CreateRepositoryRelationshipInput {
  id: string;
}

export interface SuggestRelevantRepositoriesInput {
  sourceRepoId: string;
  taskPrompt: string;
}

export interface RepositoryScopeSuggestion {
  repoId: string;
  repoName: string;
  repoPath: string;
  score: number;
  selectedByDefault: boolean;
  reasons: string[];
  relationshipKinds: string[];
  sources: RepositoryRelationshipSource[];
}

export interface RelevantRepositoriesSuggestionResult {
  sourceRepoId: string;
  suggestions: RepositoryScopeSuggestion[];
  warnings: string[];
}
