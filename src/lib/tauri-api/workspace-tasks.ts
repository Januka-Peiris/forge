import type { WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from '../../types/task-lifecycle';
import { invokeCommand } from './client';

export function getWorkspaceTaskSnapshot(workspaceId: string): Promise<WorkspaceTaskSnapshot> {
  return invokeCommand<WorkspaceTaskSnapshot>('get_workspace_task_snapshot', { workspaceId });
}

export function listWorkspaceSchedulerJobs(workspaceId: string): Promise<WorkspaceSchedulerJob[]> {
  return invokeCommand<WorkspaceSchedulerJob[]>('list_workspace_scheduler_jobs', { workspaceId });
}
