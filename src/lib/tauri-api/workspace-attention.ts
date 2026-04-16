import type { WorkspaceAttention } from '../../types/workspace-attention';
import { invokeCommand } from './client';

export function listWorkspaceAttention(): Promise<WorkspaceAttention[]> {
  return invokeCommand<WorkspaceAttention[]>('list_workspace_attention');
}

export function markWorkspaceAttentionRead(workspaceId: string): Promise<void> {
  return invokeCommand<void>('mark_workspace_attention_read', { workspaceId });
}
