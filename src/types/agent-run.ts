export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'abandoned';
export type AgentRunStreamType = 'stdout' | 'stderr' | 'system';
export type AgentRunType = 'codex' | 'claude_code';

export interface WorkspaceRun {
  id: string;
  workspaceId: string;
  agentType: AgentRunType | string;
  command: string;
  args: string[];
  cwd: string;
  status: AgentRunStatus | string;
  pid?: number;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  errorMessage?: string;
}

export interface WorkspaceRunLog {
  id: string;
  runId: string;
  timestamp: string;
  streamType: AgentRunStreamType | string;
  message: string;
}

export interface StartWorkspaceRunInput {
  workspaceId: string;
  agentType: AgentRunType;
  prompt?: string;
}
