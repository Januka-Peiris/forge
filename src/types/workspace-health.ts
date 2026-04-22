import type { WorkspacePort } from './workspace-ports';

export interface WorkspaceConflict {
  workspaceIdA: string;
  workspaceIdB: string;
  sharedFiles: string[];
  fileCount: number;
}

export interface WorkspaceConflicts {
  conflicts: WorkspaceConflict[];
  conflictingWorkspaceIds: string[];
}

export interface WorkspaceTerminalHealth {
  sessionId: string;
  title: string;
  kind: string;
  profile: string;
  status: string;
  backend: string;
  attached: boolean;
  stale: boolean;
  recoveryStatus: 'recoverable_running' | 'orphaned' | 'stale_silent' | 'interrupted' | 'closed' | string;
  lastOutputAt?: string | null;
  recommendedAction: string;
  /** Unix timestamp (seconds) when silence crossed the stuck threshold. Only set for running agent sessions. */
  stuckSince?: string | null;
}

export interface WorkspaceHealth {
  workspaceId: string;
  status: 'healthy' | 'needs_attention' | 'idle' | string;
  terminals: WorkspaceTerminalHealth[];
  ports: WorkspacePort[];
  warnings: string[];
}

export interface WorkspaceSessionRecoveryResult {
  workspaceId: string;
  closedSessions: number;
  skippedSessions: number;
  actions: WorkspaceSessionRecoveryAction[];
  warnings: string[];
}

export interface WorkspaceSessionRecoveryAction {
  sessionId: string;
  title: string;
  action: 'closed' | 'skipped' | 'failed' | 'resumed' | 'marked_interrupted' | string;
  reason: string;
}

export interface ApplyWorkspaceSessionRecoveryInput {
  workspaceId: string;
  sessionId: string;
  action: 'resume_tracking' | 'mark_interrupted' | 'close_session' | string;
  reason?: string | null;
}
