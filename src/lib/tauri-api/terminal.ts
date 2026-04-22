import type {
  AgentPromptEntry,
  AttachWorkspaceTerminalInput,
  CreateWorkspaceTerminalInput,
  QueueAgentPromptInput,
  TerminalOutputResponse,
  TerminalSearchResult,
  TerminalSession,
} from '../../types/terminal';
import { invokeCommand } from './client';


export function createWorkspaceTerminal(input: CreateWorkspaceTerminalInput): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('create_workspace_terminal', { input });
}

export function attachWorkspaceTerminalSession(input: AttachWorkspaceTerminalInput): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('attach_workspace_terminal_session', { input });
}

export function writeWorkspaceTerminalSessionInput(sessionId: string, data: string): Promise<void> {
  return invokeCommand<void>('write_workspace_terminal_session_input', { sessionId, data });
}

export function approveWorkspaceTerminalCommand(sessionId: string, approved: boolean): Promise<void> {
  return invokeCommand<void>('approve_workspace_terminal_command', { sessionId, approved });
}

export interface BatchDispatchPromptInput {
  workspaceIds: string[];
  prompt: string;
  profileId?: string;
  taskMode?: string;
  reasoning?: string;
}

export function batchDispatchWorkspaceAgentPrompt(input: BatchDispatchPromptInput): Promise<AgentPromptEntry[]> {
  return invokeCommand<AgentPromptEntry[]>('batch_dispatch_workspace_agent_prompt', { input });
}

export function resizeWorkspaceTerminalSession(sessionId: string, cols: number, rows: number): Promise<void> {
  return invokeCommand<void>('resize_workspace_terminal_session', { sessionId, cols, rows });
}

export function interruptWorkspaceTerminalSessionById(sessionId: string): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('interrupt_workspace_terminal_session_by_id', { sessionId });
}

export function stopWorkspaceTerminalSessionById(sessionId: string): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('stop_workspace_terminal_session_by_id', { sessionId });
}

export function closeWorkspaceTerminalSessionById(sessionId: string): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('close_workspace_terminal_session_by_id', { sessionId });
}

export function listWorkspaceVisibleTerminalSessions(workspaceId: string): Promise<TerminalSession[]> {
  return invokeCommand<TerminalSession[]>('list_workspace_visible_terminal_sessions', { workspaceId });
}

export function getWorkspaceTerminalOutputForSession(
  workspaceId: string,
  sessionId: string,
  sinceSeq?: number,
): Promise<TerminalOutputResponse> {
  return invokeCommand<TerminalOutputResponse>('get_workspace_terminal_output_for_session', {
    workspaceId,
    sessionId,
    sinceSeq,
  });
}

export function listWorkspaceTerminalSessions(workspaceId: string): Promise<TerminalSession[]> {
  return invokeCommand<TerminalSession[]>('list_workspace_terminal_sessions', { workspaceId });
}

export function queueWorkspaceAgentPrompt(input: QueueAgentPromptInput): Promise<AgentPromptEntry> {
  return invokeCommand<AgentPromptEntry>('queue_workspace_agent_prompt', { input });
}

export function searchTerminalOutput(query: string, workspaceId?: string): Promise<TerminalSearchResult[]> {
  return invokeCommand<TerminalSearchResult[]>('search_terminal_output', { query, workspaceId });
}
