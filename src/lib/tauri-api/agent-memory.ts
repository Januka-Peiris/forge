import type { AgentMemory, SetAgentMemoryInput } from '../../types/agent-memory';
import { invokeCommand } from './client';

export function listAgentMemories(workspaceId?: string | null): Promise<AgentMemory[]> {
  return invokeCommand<AgentMemory[]>('list_agent_memories', { workspaceId: workspaceId ?? null });
}

export function setAgentMemory(input: SetAgentMemoryInput): Promise<AgentMemory> {
  return invokeCommand<AgentMemory>('set_agent_memory', { input });
}

export function deleteAgentMemory(key: string, workspaceId?: string | null): Promise<void> {
  return invokeCommand<void>('delete_agent_memory', { key, workspaceId: workspaceId ?? null });
}
