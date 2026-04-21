export type AgentChatProvider = 'claude_code' | 'codex' | 'kimi_code' | string;
export type AgentChatStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'interrupted' | string;

export interface AgentChatSession {
  id: string;
  workspaceId: string;
  provider: AgentChatProvider;
  status: AgentChatStatus;
  title: string;
  providerSessionId?: string | null;
  cwd: string;
  rawOutput: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string | null;
  closedAt?: string | null;
}

export interface AgentChatEvent {
  id: string;
  sessionId: string;
  seq: number;
  eventType: 'user_message' | 'assistant_message' | 'thinking' | 'plan' | 'todo' | 'tool_call' | 'tool_result' | 'command' | 'file_read' | 'file_change' | 'test_run' | 'error' | 'result' | 'next_action' | 'diagnostic' | 'status' | string;
  role?: 'user' | 'assistant' | string | null;
  title?: string | null;
  body: string;
  status?: string | null;
  metadata?: AgentChatEventMetadata | null;
  createdAt: string;
}

export interface AgentChatNextAction {
  id: string;
  label: string;
  kind: 'accept_plan' | 'ask_followup' | 'switch_to_act' | 'copy_plan' | 'review_diff' | 'run_tests' | 'ask_reviewer' | 'create_pr' | 'open_diagnostics' | 'send_failure' | 'refresh_comments' | 'check_merge' | 'archive_chat' | string;
  tone?: 'primary' | 'muted' | 'warning' | 'danger' | string;
}

export interface AgentChatEventMetadata {
  command?: string;
  exitCode?: number | null;
  path?: string;
  paths?: string[];
  summary?: string;
  risk?: string;
  testStatus?: string;
  nextActions?: AgentChatNextAction[];
  planId?: string;
  taskMode?: string;
  claudeAgent?: string;
  model?: string;
  reasoning?: string;
  [key: string]: unknown;
}

export interface AgentChatEventEnvelope {
  workspaceId: string;
  session: AgentChatSession;
  event: AgentChatEvent;
}

export interface CreateAgentChatSessionInput {
  workspaceId: string;
  provider: AgentChatProvider;
  title?: string;
}

export interface SendAgentChatMessageInput {
  sessionId: string;
  prompt: string;
  profileId?: string;
  taskMode?: string;
  reasoning?: string;
  claudeAgent?: string;
  model?: string;
}
