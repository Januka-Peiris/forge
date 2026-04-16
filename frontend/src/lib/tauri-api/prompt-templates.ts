import type { WorkspacePromptTemplates } from '../../types/prompt-template';
import { invokeCommand } from './client';

export function listWorkspacePromptTemplates(workspaceId: string): Promise<WorkspacePromptTemplates> {
  return invokeCommand<WorkspacePromptTemplates>('list_workspace_prompt_templates', { workspaceId });
}
