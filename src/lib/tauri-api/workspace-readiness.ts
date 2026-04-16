import type { WorkspaceReadiness } from '../../types';
import { invokeCommand } from './client';

export function getWorkspaceReadiness(workspaceId: string): Promise<WorkspaceReadiness> {
  return invokeCommand<WorkspaceReadiness>('get_workspace_readiness', { workspaceId });
}
