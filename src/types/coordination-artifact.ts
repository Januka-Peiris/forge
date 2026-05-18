export type CoordinationArtifactKind =
  | 'api_diff'
  | 'schema_change'
  | 'decision_summary'
  | 'dependency_note'
  | 'release_ordering_note';

export type CoordinationArtifactStatus = 'draft' | 'active' | 'resolved' | 'dismissed';

export interface CoordinationArtifact {
  id: string;
  parentWorkspaceId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId?: string | null;
  artifactKind: CoordinationArtifactKind;
  title: string;
  body: string;
  status: CoordinationArtifactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCoordinationArtifactInput {
  sourceWorkspaceId: string;
  targetWorkspaceId?: string | null;
  artifactKind: CoordinationArtifactKind;
  title: string;
  body: string;
  status?: CoordinationArtifactStatus;
}

export interface UpdateCoordinationArtifactInput {
  id: string;
  targetWorkspaceId?: string | null;
  artifactKind: CoordinationArtifactKind;
  title: string;
  body: string;
  status: CoordinationArtifactStatus;
}

export interface UpdateCoordinationArtifactStatusInput {
  id: string;
  status: CoordinationArtifactStatus;
}
