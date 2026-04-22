export interface AgentMemory {
  id: string;
  workspaceId: string | null;
  scope: 'global' | 'workspace' | string;
  key: string;
  value: string;
  origin: 'manual' | 'auto' | string;
  confidence: number;
  sourceTaskRunId?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetAgentMemoryInput {
  workspaceId?: string | null;
  scope?: 'global' | 'workspace' | string;
  key: string;
  value: string;
  origin?: 'manual' | 'auto' | string;
  confidence?: number;
  sourceTaskRunId?: string | null;
  lastUsedAt?: string | null;
}
