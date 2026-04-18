import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointDiff,
  WorkspaceCheckpointRestorePlan,
  WorkspaceCheckpointRestoreResult,
} from '../../types/checkpoint';
import { invokeCommand } from './client';

export function listWorkspaceCheckpoints(workspaceId: string): Promise<WorkspaceCheckpoint[]> {
  return invokeCommand<WorkspaceCheckpoint[]>('list_workspace_checkpoints', { workspaceId });
}

export function createWorkspaceCheckpoint(workspaceId: string, reason?: string): Promise<WorkspaceCheckpoint | null> {
  return invokeCommand<WorkspaceCheckpoint | null>('create_workspace_checkpoint', { workspaceId, reason });
}

export function getWorkspaceCheckpointDiff(workspaceId: string, reference: string): Promise<WorkspaceCheckpointDiff> {
  return invokeCommand<WorkspaceCheckpointDiff>('get_workspace_checkpoint_diff', { workspaceId, reference });
}

export function getWorkspaceCheckpointRestorePlan(workspaceId: string, reference: string): Promise<WorkspaceCheckpointRestorePlan> {
  return invokeCommand<WorkspaceCheckpointRestorePlan>('get_workspace_checkpoint_restore_plan', { workspaceId, reference });
}

export function restoreWorkspaceCheckpoint(workspaceId: string, reference: string): Promise<WorkspaceCheckpointRestoreResult> {
  return invokeCommand<WorkspaceCheckpointRestoreResult>('restore_workspace_checkpoint', { workspaceId, reference });
}
