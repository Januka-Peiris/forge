import type { AgentChatEvent, AgentChatSession, CreateAgentChatSessionInput, SendAgentChatMessageInput } from '../../types/agent-chat';
import { invokeCommand } from './client';

export function createAgentChatSession(input: CreateAgentChatSessionInput): Promise<AgentChatSession> {
  return invokeCommand<AgentChatSession>('create_agent_chat_session', { input });
}

export function sendAgentChatMessage(input: SendAgentChatMessageInput): Promise<AgentChatEvent> {
  return invokeCommand<AgentChatEvent>('send_agent_chat_message', { input });
}

export function listAgentChatSessions(workspaceId: string): Promise<AgentChatSession[]> {
  return invokeCommand<AgentChatSession[]>('list_agent_chat_sessions', { workspaceId });
}

export function listAgentChatEvents(sessionId: string): Promise<AgentChatEvent[]> {
  return invokeCommand<AgentChatEvent[]>('list_agent_chat_events', { sessionId });
}

export function interruptAgentChatSession(sessionId: string): Promise<AgentChatSession> {
  return invokeCommand<AgentChatSession>('interrupt_agent_chat_session', { sessionId });
}

export function closeAgentChatSession(sessionId: string): Promise<AgentChatSession> {
  return invokeCommand<AgentChatSession>('close_agent_chat_session', { sessionId });
}
