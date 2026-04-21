export type TerminalProfile = 'shell' | 'codex' | 'claude_code' | 'kimi_code' | string;
export type TerminalSessionStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'interrupted' | string;

export interface TerminalSession {
  id: string;
  workspaceId: string;
  sessionRole?: 'agent' | 'utility' | string;
  profile: TerminalProfile | string;
  cwd: string;
  status: TerminalSessionStatus;
  startedAt: string;
  endedAt?: string;
  command: string;
  args: string[];
  pid?: number;
  stale: boolean;
  closedAt?: string;
  backend: string;
  title: string;
  terminalKind: 'agent' | 'shell' | 'run' | 'utility' | string;
  displayOrder: number;
  isVisible: boolean;
  lastAttachedAt?: string;
  lastCapturedSeq: number;
}

export interface TerminalOutputChunk {
  id: string;
  sessionId: string;
  seq: number;
  timestamp: string;
  streamType: 'pty' | 'system' | string;
  data: string;
}

export interface TerminalOutputEvent {
  workspaceId: string;
  chunk: TerminalOutputChunk;
}

export interface TerminalSessionState {
  activeSession?: TerminalSession | null;
  latestSession?: TerminalSession | null;
}

export interface TerminalOutputResponse {
  session?: TerminalSession | null;
  chunks: TerminalOutputChunk[];
  nextSeq: number;
}

export interface StartTerminalSessionInput {
  workspaceId: string;
  profile: TerminalProfile;
  sessionRole?: 'agent' | 'utility';
  cols?: number;
  rows?: number;
  replaceExisting?: boolean;
}

export interface CreateWorkspaceTerminalInput {
  workspaceId: string;
  kind: 'agent' | 'shell' | 'run' | 'utility';
  profile: TerminalProfile;
  profileId?: string;
  title?: string;
  command?: string;
  args?: string[];
  cols?: number;
  rows?: number;
}

export interface AttachWorkspaceTerminalInput {
  workspaceId: string;
  sessionId: string;
  cols?: number;
  rows?: number;
}

export type AgentPromptStatus = 'queued' | 'sent' | 'succeeded' | 'failed' | 'interrupted' | 'stopped' | string;

export interface AgentPromptEntry {
  id: string;
  workspaceId: string;
  sessionId?: string;
  profile: TerminalProfile | string;
  prompt: string;
  status: AgentPromptStatus;
  createdAt: string;
  sentAt?: string;
}

export interface QueueAgentPromptInput {
  workspaceId: string;
  prompt: string;
  profile?: TerminalProfile;
  profileId?: string;
  taskMode?: string;
  reasoning?: string;
  /** Optional; server always dispatches to the agent terminal after recording the prompt. */
  mode?: 'send_now' | 'interrupt_send';
}

export interface TerminalSearchResult {
  workspaceId: string;
  workspaceName: string;
  sessionId: string;
  timestamp: string;
  line: string;
}
