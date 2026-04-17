import { invoke } from '@tauri-apps/api/core';
import type { ContextPreview, ContextStatus } from '../../types/context';

export async function getContextPreview(workspaceId: string, promptHint?: string): Promise<ContextPreview> {
  return invoke('get_context_preview_with_hint', { workspaceId, promptHint: promptHint ?? null });
}

export async function getContextStatus(workspaceId: string): Promise<ContextStatus> {
  return invoke('get_context_status', { workspaceId });
}

export async function buildWorkspaceRepoContext(workspaceId: string, force: boolean): Promise<string> {
  return invoke('build_workspace_repo_context', { workspaceId, force });
}

export async function refreshWorkspaceRepoContext(workspaceId: string): Promise<unknown> {
  return invoke('refresh_workspace_repo_context', { workspaceId });
}
