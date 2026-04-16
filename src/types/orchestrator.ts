export interface OrchestratorAction {
  action: string;
  workspaceId?: string;
  prompt?: string;
  message?: string;
}

export interface OrchestratorStatus {
  enabled: boolean;
  model: string;
  lastRunAt: string | null;
  lastActions: OrchestratorAction[];
}
