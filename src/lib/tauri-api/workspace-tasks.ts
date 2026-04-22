import type { WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from '../../types/task-lifecycle';
import { invokeCommand } from './client';

export function getWorkspaceTaskSnapshot(workspaceId: string): Promise<WorkspaceTaskSnapshot> {
  return invokeCommand<WorkspaceTaskSnapshot>('get_workspace_task_snapshot', { workspaceId });
}

export function listWorkspaceSchedulerJobs(workspaceId: string): Promise<WorkspaceSchedulerJob[]> {
  return invokeCommand<WorkspaceSchedulerJob[]>('list_workspace_scheduler_jobs', { workspaceId });
}

export function setWorkspaceSchedulerJobEnabled(workspaceId: string, jobId: string, enabled: boolean): Promise<void> {
  return invokeCommand<void>('set_workspace_scheduler_job_enabled', { workspaceId, jobId, enabled });
}

export function scheduleWorkspaceSchedulerJobNow(workspaceId: string, jobId: string): Promise<void> {
  return invokeCommand<void>('schedule_workspace_scheduler_job_now', { workspaceId, jobId });
}
