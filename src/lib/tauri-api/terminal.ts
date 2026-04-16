import type {
  AgentPromptEntry,
  AttachWorkspaceTerminalInput,
  CreateWorkspaceTerminalInput,
  QueueAgentPromptInput,
  StartTerminalSessionInput,
  TerminalOutputResponse,
  TerminalSession,
  TerminalSessionState,
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

export function captureWorkspaceTerminalScrollback(sessionId: string): Promise<TerminalOutputResponse> {
  return invokeCommand<TerminalOutputResponse>('capture_workspace_terminal_scrollback', { sessionId });
}

export function startWorkspaceTerminalSession(input: StartTerminalSessionInput): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('start_workspace_terminal_session', { input });
}

export function writeWorkspaceTerminalInput(workspaceId: string, data: string): Promise<void> {
  return invokeCommand<void>('write_workspace_terminal_input', { workspaceId, data });
}

export function resizeWorkspaceTerminal(workspaceId: string, cols: number, rows: number): Promise<void> {
  return invokeCommand<void>('resize_workspace_terminal', { workspaceId, cols, rows });
}

export function stopWorkspaceTerminalSession(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('stop_workspace_terminal_session', { workspaceId });
}

export function interruptWorkspaceTerminalSession(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('interrupt_workspace_terminal_session', { workspaceId });
}

export function closeWorkspaceTerminalSession(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('close_workspace_terminal_session', { workspaceId });
}

export function getWorkspaceTerminalSessionState(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('get_workspace_terminal_session_state', { workspaceId });
}

export function getWorkspaceTerminalOutput(workspaceId: string, sinceSeq?: number): Promise<TerminalOutputResponse> {
  return invokeCommand<TerminalOutputResponse>('get_workspace_terminal_output', { workspaceId, sinceSeq });
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

export function reconnectWorkspaceTerminalSession(
  workspaceId: string,
  sessionId?: string,
): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('reconnect_workspace_terminal_session', {
    workspaceId,
    sessionId,
  });
}

export function queueWorkspaceAgentPrompt(input: QueueAgentPromptInput): Promise<AgentPromptEntry> {
  return invokeCommand<AgentPromptEntry>('queue_workspace_agent_prompt', { input });
}

export function writeWorkspaceUtilityTerminalInput(workspaceId: string, data: string): Promise<void> {
  return invokeCommand<void>('write_workspace_utility_terminal_input', { workspaceId, data });
}

export function resizeWorkspaceUtilityTerminal(workspaceId: string, cols: number, rows: number): Promise<void> {
  return invokeCommand<void>('resize_workspace_utility_terminal', { workspaceId, cols, rows });
}

export function stopWorkspaceUtilityTerminalSession(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('stop_workspace_utility_terminal_session', { workspaceId });
}

export function getWorkspaceUtilityTerminalSessionState(workspaceId: string): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('get_workspace_utility_terminal_session_state', { workspaceId });
}

export function getWorkspaceUtilityTerminalOutput(workspaceId: string, sinceSeq?: number): Promise<TerminalOutputResponse> {
  return invokeCommand<TerminalOutputResponse>('get_workspace_utility_terminal_output', { workspaceId, sinceSeq });
}

export function reconnectWorkspaceUtilityTerminalSession(
  workspaceId: string,
  sessionId?: string,
): Promise<TerminalSessionState> {
  return invokeCommand<TerminalSessionState>('reconnect_workspace_utility_terminal_session', {
    workspaceId,
    sessionId,
  });
}
