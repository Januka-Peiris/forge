import type { WorkspacePrDraft, WorkspacePrResult, WorkspacePrStatus } from '../../types/pr-draft';
import { invokeCommand } from './client';

const PR_STATUS_CACHE_PREFIX = 'forge:workspace-pr-status:';

function prStatusCacheKey(workspaceId: string): string {
  return `${PR_STATUS_CACHE_PREFIX}${workspaceId}`;
}

export function getCachedWorkspacePrStatus(workspaceId: string): WorkspacePrStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(prStatusCacheKey(workspaceId));
    return raw ? JSON.parse(raw) as WorkspacePrStatus : null;
  } catch {
    return null;
  }
}

function cacheWorkspacePrStatus(workspaceId: string, status: WorkspacePrStatus): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(prStatusCacheKey(workspaceId), JSON.stringify(status));
  } catch {
    // Best-effort speed cache only.
  }
}

export function getWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('get_workspace_pr_draft', { workspaceId });
}

export function refreshWorkspacePrDraft(workspaceId: string): Promise<WorkspacePrDraft> {
  return invokeCommand<WorkspacePrDraft>('refresh_workspace_pr_draft', { workspaceId });
}

export function createWorkspacePr(workspaceId: string): Promise<WorkspacePrResult> {
  return invokeCommand<WorkspacePrResult>('create_workspace_pr', { workspaceId });
}

export async function getWorkspacePrStatus(workspaceId: string): Promise<WorkspacePrStatus> {
  const status = await invokeCommand<WorkspacePrStatus>('get_workspace_pr_status', { workspaceId });
  cacheWorkspacePrStatus(workspaceId, status);
  return status;
}
