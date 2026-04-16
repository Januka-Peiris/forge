export interface AgentMemory {
  id: string;
  workspaceId: string | null;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetAgentMemoryInput {
  workspaceId?: string | null;
  key: string;
  value: string;
}
