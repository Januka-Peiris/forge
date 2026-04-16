import type { WorkspaceMergeReadiness } from '../../types/merge-readiness';
import { invokeCommand } from './client';

export function getWorkspaceMergeReadiness(workspaceId: string): Promise<WorkspaceMergeReadiness> {
  return invokeCommand<WorkspaceMergeReadiness>('get_workspace_merge_readiness', { workspaceId });
}

export function refreshWorkspaceMergeReadiness(workspaceId: string): Promise<WorkspaceMergeReadiness> {
  return invokeCommand<WorkspaceMergeReadiness>('refresh_workspace_merge_readiness', { workspaceId });
}
