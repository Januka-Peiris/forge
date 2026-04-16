import type { ActivityItem } from '../../types/activity';
import { invokeCommand } from './client';

export function listActivity(): Promise<ActivityItem[]> {
  return invokeCommand<ActivityItem[]>('list_activity');
}

export function listWorkspaceActivity(workspaceId: string, limit?: number): Promise<ActivityItem[]> {
  return invokeCommand<ActivityItem[]>('list_workspace_activity', { workspaceId, limit });
}
