export interface CoordinatorRun {
  id: string;
  workspaceId: string;
  status: string;
  brainProfileId: string;
  coderProfileId: string;
  goal: string;
  lastResponse?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface CoordinatorWorker {
  id: string;
  runId: string;
  workspaceId: string;
  profileId: string;
  status: string;
  lastPrompt?: string | null;
  lastSessionId?: string | null;
  notifiedStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoordinatorActionLog {
  id: string;
  runId: string;
  workspaceId: string;
  actionKind: string;
  replayKind?: string | null;
  replayedFromActionId?: string | null;
  workerId?: string | null;
  prompt?: string | null;
  message?: string | null;
  rawJson?: string | null;
  createdAt: string;
}

export interface WorkspaceCoordinatorStatus {
  workspaceId: string;
  mode: 'direct' | 'coordinator' | string;
  activeRun?: CoordinatorRun | null;
  workers: CoordinatorWorker[];
  recentActions: CoordinatorActionLog[];
  plannerAdapter?: string | null;
  plannerParseMode?: string | null;
  plannerFallback?: boolean | null;
  plannerLastMessage?: string | null;
}

export interface StartWorkspaceCoordinatorInput {
  workspaceId: string;
  goal: string;
  brainProfileId?: string | null;
  coderProfileId?: string | null;
}

export interface StepWorkspaceCoordinatorInput {
  workspaceId: string;
  instruction: string;
  brainProfileId?: string | null;
  coderProfileId?: string | null;
}

export interface ReplayWorkspaceCoordinatorActionInput {
  workspaceId: string;
  actionId: string;
  promptOverride?: string | null;
}
