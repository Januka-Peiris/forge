import type { WorkspaceTemplate } from '../../types/workspace-template';
import { invokeCommand } from './client';

export function listWorkspaceTemplates(): Promise<WorkspaceTemplate[]> {
  return invokeCommand<WorkspaceTemplate[]>('list_workspace_templates');
}

export function createWorkspaceTemplate(
  name: string,
  description: string,
  taskPrompt: string,
  agent: string,
): Promise<WorkspaceTemplate> {
  return invokeCommand<WorkspaceTemplate>('create_workspace_template', { name, description, taskPrompt, agent });
}
