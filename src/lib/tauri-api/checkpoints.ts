import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointBranchResult,
  WorkspaceCheckpointDeleteResult,
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

export function deleteWorkspaceCheckpoint(workspaceId: string, reference: string): Promise<WorkspaceCheckpointDeleteResult> {
  return invokeCommand<WorkspaceCheckpointDeleteResult>('delete_workspace_checkpoint', { workspaceId, reference });
}

export function createBranchFromWorkspaceCheckpoint(
  workspaceId: string,
  reference: string,
  branch: string,
): Promise<WorkspaceCheckpointBranchResult> {
  return invokeCommand<WorkspaceCheckpointBranchResult>('create_branch_from_workspace_checkpoint', { workspaceId, reference, branch });
}
