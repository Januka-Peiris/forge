import type { Workspace } from '../types';

const EMPTY_TASK_PLACEHOLDERS = new Set([
  'Workspace created and waiting for an agent instruction.',
  'Workspace ready. Start an agent or send an instruction.',
]);

export function displayWorkspaceTask(task: string | null | undefined): string {
  const trimmed = (task ?? '').trim();
  return EMPTY_TASK_PLACEHOLDERS.has(trimmed) ? '' : trimmed;
}

export function sanitizeWorkspaceForDisplay(workspace: Workspace): Workspace {
  const currentTask = displayWorkspaceTask(workspace.currentTask);
  return currentTask === workspace.currentTask ? workspace : { ...workspace, currentTask };
}

export function sanitizeWorkspacesForDisplay(workspaces: Workspace[]): Workspace[] {
  return workspaces.map(sanitizeWorkspaceForDisplay);
}
