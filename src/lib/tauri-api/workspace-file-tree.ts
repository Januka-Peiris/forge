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

export function createWorkspaceDirectory(workspaceId: string, path: string): Promise<void> {
  return invokeCommand<void>('create_workspace_directory', { workspaceId, path });
}

export function renameWorkspacePath(workspaceId: string, fromPath: string, toPath: string): Promise<void> {
  return invokeCommand<void>('rename_workspace_path', { workspaceId, fromPath, toPath });
}

export function deleteWorkspacePath(workspaceId: string, path: string): Promise<void> {
  return invokeCommand<void>('delete_workspace_path', { workspaceId, path });
}

export function saveWorkspacePastedImage(workspaceId: string, filename: string, bytes: number[]): Promise<string> {
  return invokeCommand<string>('save_workspace_pasted_image', { workspaceId, filename, bytes });
}
