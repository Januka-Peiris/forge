import type { WorkspaceChangedFile } from '../../types/git-review';
import { invokeCommand } from './client';

export function getWorkspaceChangedFiles(workspaceId: string): Promise<WorkspaceChangedFile[]> {
  return invokeCommand<WorkspaceChangedFile[]>('get_workspace_changed_files', { workspaceId });
}
