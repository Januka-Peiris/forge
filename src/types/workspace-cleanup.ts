import type { WorkspaceHealth } from './workspace-health';
import type { WorkspacePort } from './workspace-ports';

export interface CleanupWorkspaceInput {
  workspaceId: string;
  killPorts?: boolean;
  removeManagedWorktree?: boolean;
}

export interface CleanupWorkspaceResult {
  workspaceId: string;
  stoppedSessions: number;
  teardownSessions: number;
  remainingPorts: WorkspacePort[];
  killedPorts: number;
  health?: WorkspaceHealth | null;
  workspaceDeleted: boolean;
  warnings: string[];
}
