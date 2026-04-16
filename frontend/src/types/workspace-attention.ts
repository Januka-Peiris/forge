export type WorkspaceAttentionStatus = 'idle' | 'running' | 'waiting' | 'error' | 'complete' | string;

export interface WorkspaceAttention {
  workspaceId: string;
  status: WorkspaceAttentionStatus;
  runningCount: number;
  unreadCount: number;
  lastEvent?: string | null;
  lastEventAt?: string | null;
  queuedCount?: number;
}
