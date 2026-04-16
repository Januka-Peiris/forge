import type { WorkspacePrDraft } from '../../types/pr-draft';
import { invokeCommand } from './client';

export function getWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('get_workspace_pr_draft', { workspaceId });
}

export function refreshWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('refresh_workspace_pr_draft', { workspaceId });
}
