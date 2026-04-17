import type {
  CreateChildWorkspaceInput,
  CreateWorkspaceInput,
  DiscoveredRepository,
  LinkedWorktreeRef,
  RepositoryWorkspaceOptions,
  Workspace,
  WorkspaceDetail,
  WorkspaceSummary,
} from '../../types';
import { toWorkspace } from '../../types/workspace';
import { invokeCommand } from './client';

export async function listWorkspaces(): Promise<Workspace[]> {
  const summaries = await invokeCommand<WorkspaceSummary[]>('list_workspaces');
  return summaries.map(toWorkspace);
}

export async function getWorkspaceDetail(id: string): Promise<WorkspaceDetail | null> {
  return invokeCommand<WorkspaceDetail | null>('get_workspace_detail', { id });
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const detail = await invokeCommand<WorkspaceDetail>('create_workspace', { input });
  return toWorkspace(detail);
}

export async function createChildWorkspace(input: CreateChildWorkspaceInput): Promise<Workspace> {
  const detail = await invokeCommand<WorkspaceDetail>('create_child_workspace', { input });
  return toWorkspace(detail);
}

export async function openInCursor(workspaceId: string): Promise<void> {
  return invokeCommand<void>('open_in_cursor', { workspaceId });
}

export async function openWorktreeInCursor(path: string): Promise<void> {
  return invokeCommand<void>('open_worktree_in_cursor', { path });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invokeCommand<void>('delete_workspace', { workspaceId });
}

export async function listWorkspaceLinkedWorktrees(workspaceId: string): Promise<LinkedWorktreeRef[]> {
  return invokeCommand<LinkedWorktreeRef[]>('list_workspace_linked_worktrees', { workspaceId });
}

export async function attachWorkspaceLinkedWorktree(workspaceId: string, worktreeId: string): Promise<LinkedWorktreeRef[]> {
  return invokeCommand<LinkedWorktreeRef[]>('attach_workspace_linked_worktree', {
    input: { workspaceId, worktreeId },
  });
}

export async function detachWorkspaceLinkedWorktree(workspaceId: string, worktreeId: string): Promise<LinkedWorktreeRef[]> {
  return invokeCommand<LinkedWorktreeRef[]>('detach_workspace_linked_worktree', { workspaceId, worktreeId });
}


export function listRepositoriesForWorkspaceCreation(): Promise<DiscoveredRepository[]> {
  return invokeCommand<DiscoveredRepository[]>('list_repositories_for_workspace_creation');
}

export function getRepositoryWorkspaceOptions(repositoryId: string): Promise<RepositoryWorkspaceOptions> {
  return invokeCommand<RepositoryWorkspaceOptions>('get_repository_workspace_options', { repositoryId });
}

export function setWorkspaceCostLimit(workspaceId: string, limitUsd: number | null): Promise<void> {
  return invokeCommand<void>('set_workspace_cost_limit', { workspaceId, limitUsd });
}
