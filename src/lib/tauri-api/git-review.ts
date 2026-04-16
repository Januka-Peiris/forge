import type { WorkspaceChangedFile, WorkspaceFileDiff } from '../../types/git-review';
import { invokeCommand } from './client';

export function getWorkspaceChangedFiles(workspaceId: string): Promise<WorkspaceChangedFile[]> {
  return invokeCommand<WorkspaceChangedFile[]>('get_workspace_changed_files', { workspaceId });
}

export function getWorkspaceFileDiff(workspaceId: string, path: string): Promise<WorkspaceFileDiff> {
  return invokeCommand<WorkspaceFileDiff>('get_workspace_file_diff', { workspaceId, path });
}
