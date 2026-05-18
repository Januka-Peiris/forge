import { invokeCommand } from './client';
import type {
  CoordinationArtifact,
  CreateCoordinationArtifactInput,
  UpdateCoordinationArtifactInput,
  UpdateCoordinationArtifactStatusInput,
} from '../../types/coordination-artifact';

export function listCoordinationArtifacts(workspaceId: string): Promise<CoordinationArtifact[]> {
  return invokeCommand<CoordinationArtifact[]>('list_coordination_artifacts', { workspaceId });
}

export function createCoordinationArtifact(
  input: CreateCoordinationArtifactInput,
): Promise<CoordinationArtifact> {
  return invokeCommand<CoordinationArtifact>('create_coordination_artifact', { input });
}

export function updateCoordinationArtifact(
  input: UpdateCoordinationArtifactInput,
): Promise<CoordinationArtifact> {
  return invokeCommand<CoordinationArtifact>('update_coordination_artifact', { input });
}

export function updateCoordinationArtifactStatus(
  input: UpdateCoordinationArtifactStatusInput,
): Promise<CoordinationArtifact> {
  return invokeCommand<CoordinationArtifact>('update_coordination_artifact_status', { input });
}

export function deleteCoordinationArtifact(artifactId: string): Promise<void> {
  return invokeCommand<void>('delete_coordination_artifact', { artifactId });
}
