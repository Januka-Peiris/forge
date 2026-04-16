import type { WorkspaceHealth } from '../../types/workspace-health';
import { invokeCommand } from './client';

export function getWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealth> {
  return invokeCommand<WorkspaceHealth>('get_workspace_health', { workspaceId });
}
