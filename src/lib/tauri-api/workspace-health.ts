import type {
  WorkspaceConflicts,
  WorkspaceHealth,
  WorkspaceSessionRecoveryResult,
} from '../../types/workspace-health';
import { invokeCommand } from './client';

export function getWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealth> {
  return invokeCommand<WorkspaceHealth>('get_workspace_health', { workspaceId });
}

export function getWorkspaceConflicts(): Promise<WorkspaceConflicts> {
  return invokeCommand<WorkspaceConflicts>('get_workspace_conflicts', {});
}

export function recoverWorkspaceSessions(workspaceId: string): Promise<WorkspaceSessionRecoveryResult> {
  return invokeCommand<WorkspaceSessionRecoveryResult>('recover_workspace_sessions', { workspaceId });
}
