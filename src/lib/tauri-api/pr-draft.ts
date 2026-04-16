import type { WorkspacePrDraft, WorkspacePrResult } from '../../types/pr-draft';
import { invokeCommand } from './client';

export function getWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('get_workspace_pr_draft', { workspaceId });
}

export function refreshWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('refresh_workspace_pr_draft', { workspaceId });
}

export function createWorkspacePr(workspaceId: string): Promise<WorkspacePrResult> {
  return invokeCommand<WorkspacePrResult>('create_workspace_pr', { workspaceId });
}
