import type { StartWorkspaceRunInput, WorkspaceRun, WorkspaceRunLog } from '../../types/agent-run';
import { invokeCommand } from './client';

export function startWorkspaceRun(input: StartWorkspaceRunInput): Promise<WorkspaceRun> {
  return invokeCommand<WorkspaceRun>('start_workspace_run', { input });
}

export function stopWorkspaceRun(runId: string): Promise<WorkspaceRun> {
  return invokeCommand<WorkspaceRun>('stop_workspace_run', { runId });
}

export function getWorkspaceRuns(workspaceId: string): Promise<WorkspaceRun[]> {
  return invokeCommand<WorkspaceRun[]>('get_workspace_runs', { workspaceId });
}

export function getWorkspaceRunLogs(runId: string): Promise<WorkspaceRunLog[]> {
  return invokeCommand<WorkspaceRunLog[]>('get_workspace_run_logs', { runId });
}
