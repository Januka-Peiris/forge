import type { ListWorkspaceFileTreeInput, WorkspaceFileTreeNode } from '../../types/workspace-file-tree';
import { invokeCommand } from './client';

export function listWorkspaceFileTree(workspaceId: string, input?: ListWorkspaceFileTreeInput): Promise<WorkspaceFileTreeNode[]> {
  return invokeCommand<WorkspaceFileTreeNode[]>('list_workspace_file_tree', {
    workspaceId,
    path: input?.path,
    depth: input?.depth,
  });
}

export function readWorkspaceFile(workspaceId: string, path: string): Promise<string> {
  return invokeCommand<string>('read_workspace_file', { workspaceId, path });
}

export function writeWorkspaceFile(workspaceId: string, path: string, content: string): Promise<void> {
  return invokeCommand<void>('write_workspace_file', { workspaceId, path, content });
}
