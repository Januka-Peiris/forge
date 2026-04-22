export interface TaskRun {
  id: string;
  workspaceId: string;
  kind: string;
  status: string;
  sourceId?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface TaskEvent {
  id: string;
  taskRunId: string;
  workspaceId: string;
  ts: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface WorkspaceTaskSnapshot {
  workspaceId: string;
  runs: TaskRun[];
  events: TaskEvent[];
}

export interface WorkspaceSchedulerJob {
  id: string;
  workspaceId: string;
  kind: string;
  intervalSeconds: number;
  nextRunAt: number;
  enabled: boolean;
  jitterPct: number;
}
