import type { WorkspaceAgentContext } from '../../types/agent-context';
import { invokeCommand } from './client';

export function getWorkspaceAgentContext(workspaceId: string): Promise<WorkspaceAgentContext> {
  return invokeCommand<WorkspaceAgentContext>('get_workspace_agent_context', { workspaceId });
}
