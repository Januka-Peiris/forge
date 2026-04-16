import type { WorkspacePort } from './workspace-ports';

export interface WorkspaceTerminalHealth {
  sessionId: string;
  title: string;
  kind: string;
  profile: string;
  status: string;
  backend: string;
  tmuxAlive: boolean;
  attached: boolean;
  stale: boolean;
  lastOutputAt?: string | null;
  recommendedAction: string;
}

export interface WorkspaceHealth {
  workspaceId: string;
  status: 'healthy' | 'needs_attention' | 'idle' | string;
  terminals: WorkspaceTerminalHealth[];
  ports: WorkspacePort[];
  warnings: string[];
}
