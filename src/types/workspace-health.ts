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
