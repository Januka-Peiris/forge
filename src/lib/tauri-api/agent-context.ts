import type { WorkspaceAgentContext, WorkspaceContextPreview } from '../../types/agent-context';
import { invokeCommand } from './client';

export function getWorkspaceAgentContext(workspaceId: string): Promise<WorkspaceAgentContext> {
  return invokeCommand<WorkspaceAgentContext>('get_workspace_agent_context', { workspaceId });
}

export function getWorkspaceContextPreview(workspaceId: string): Promise<WorkspaceContextPreview> {
  return invokeCommand<WorkspaceContextPreview>('get_workspace_context_preview', { workspaceId });
}

export function refreshWorkspaceRepoContext(workspaceId: string): Promise<WorkspaceContextPreview> {
  return invokeCommand<WorkspaceContextPreview>('refresh_workspace_repo_context', { workspaceId });
}
