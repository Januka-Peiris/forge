import { useMemo, useState } from 'react';
import type { AgentProfile } from '../../types';
import type { WorkspaceCoordinatorStatus } from '../../types/coordinator';

interface CoordinatorTimelineProps {
  status: WorkspaceCoordinatorStatus | null;
  agentProfiles: AgentProfile[];
  onRefresh: () => void;
  onReplayAction: (actionId: string, promptOverride?: string | null) => Promise<void>;
}

function profileLabel(agentProfiles: AgentProfile[], profileId: string): string {
  return agentProfiles.find((profile) => profile.id === profileId)?.label ?? profileId;
}

export function CoordinatorTimeline({ status, agentProfiles, onRefresh, onReplayAction }: CoordinatorTimelineProps) {
  if (!status) return null;
  if (!status.activeRun && status.recentActions.length === 0) return null;

  const [kindFilter, setKindFilter] = useState<'all' | 'planner' | 'worker' | 'notify' | 'lifecycle'>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [replayBusyActionId, setReplayBusyActionId] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [replayedAtByActionId, setReplayedAtByActionId] = useState<Record<string, string>>({});
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const activeWorkers = status.workers.filter((worker) => worker.status === 'running');

  const filteredActions = useMemo(() => {
    const byKind = (actionKind: string) => {
      if (kindFilter === 'all') return true;
      if (kindFilter === 'planner') return actionKind === 'planner';
      if (kindFilter === 'notify') return actionKind === 'notify_user';
      if (kindFilter === 'worker') {
        return actionKind === 'spawn_worker'
          || actionKind === 'message_worker'
          || actionKind === 'stop_worker'
          || actionKind === 'worker_update'
          || actionKind === 'replay_worker_prompt'
          || actionKind === 'replay_stop_worker';
      }
      if (kindFilter === 'lifecycle') return actionKind === 'complete' || actionKind === 'validation_error';
      return true;
    };
    const byWorker = (workerId?: string | null) => workerFilter === 'all' || workerId === workerFilter;
    return status.recentActions
      .filter((action) => byKind(action.actionKind))
      .filter((action) => byWorker(action.workerId));
  }, [kindFilter, status.recentActions, workerFilter]);

  const groupedByWorker = useMemo(() => {
    const groups = new Map<string, typeof filteredActions>();
    for (const action of filteredActions) {
      const key = action.workerId ?? 'general';
      const bucket = groups.get(key) ?? [];
      bucket.push(action);
      groups.set(key, bucket);
    }
    return groups;
  }, [filteredActions]);
  const selectedWorker = useMemo(
    () => (selectedWorkerId ? status.workers.find((worker) => worker.id === selectedWorkerId) ?? null : null),
    [selectedWorkerId, status.workers],
  );
  const selectedWorkerActions = useMemo(() => {
    if (!selectedWorker) return [];
    return status.recentActions
      .filter((action) => action.workerId === selectedWorker.id)
      .slice(0, 8);
  }, [selectedWorker, status.recentActions]);

  return (
    <div className="mx-2 mt-2 rounded-lg border border-forge-border bg-forge-card/60 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-forge-muted">Coordinator timeline</p>
          <p className="text-[11px] text-forge-muted">
            {status.activeRun ? `Run ${status.activeRun.id}` : 'No active run'} · {status.mode}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-muted hover:bg-forge-surface-overlay"
        >
          Refresh
        </button>
      </div>

      {replayNotice && (
        <div className="mb-2 rounded border border-forge-blue/30 bg-forge-blue/10 px-2 py-1 text-[11px] text-forge-blue">
          {replayNotice}
        </div>
      )}

      {status.activeRun && (
        <div className="mb-2 rounded border border-forge-border/70 bg-black/10 p-2 text-[11px]">
          <p className="text-forge-text">
            <span className="text-forge-muted">Goal:</span> {status.activeRun.goal}
          </p>
          <p className="text-forge-muted">
            brain={profileLabel(agentProfiles, status.activeRun.brainProfileId)} · coder={profileLabel(agentProfiles, status.activeRun.coderProfileId)}
          </p>
          {!!status.activeRun.lastError && (
            <p className="mt-1 text-forge-yellow">Planner fallback: {status.activeRun.lastError}</p>
          )}
          <p className="mt-1 text-forge-muted">
            planner={status.plannerAdapter ?? 'unknown'} · parse={status.plannerParseMode ?? 'unknown'} · fallback={status.plannerFallback ? 'yes' : 'no'}
          </p>
        </div>
      )}

      {status.workers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {status.workers.map((worker) => (
            <button
              type="button"
              key={worker.id}
              onClick={() => {
                setWorkerFilter((current) => (current === worker.id ? 'all' : worker.id));
                setSelectedWorkerId((current) => (current === worker.id ? null : worker.id));
              }}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                workerFilter === worker.id
                  ? 'border-forge-blue/40 bg-forge-blue/15 text-forge-blue'
                  : worker.status === 'running'
                  ? 'border-forge-green/30 bg-forge-green/10 text-forge-green'
                  : 'border-forge-border bg-black/10 text-forge-muted'
              }`}
              title={worker.lastPrompt ?? ''}
            >
              {worker.id} · {profileLabel(agentProfiles, worker.profileId)} · {worker.status}
            </button>
          ))}
          <span className="rounded border border-forge-border bg-black/10 px-1.5 py-0.5 text-[10px] text-forge-muted">
            active workers: {activeWorkers.length}
          </span>
        </div>
      )}

      {selectedWorker && (
        <div className="mb-2 rounded border border-forge-border/70 bg-black/10 p-2 text-[11px]">
          <p className="font-semibold text-forge-text">Worker {selectedWorker.id}</p>
          <p className="text-forge-muted">
            profile={profileLabel(agentProfiles, selectedWorker.profileId)} · status={selectedWorker.status}
          </p>
          {selectedWorker.lastSessionId && (
            <p className="text-forge-muted">session={selectedWorker.lastSessionId}</p>
          )}
          {selectedWorker.lastPrompt && (
            <p className="mt-1 line-clamp-2 text-forge-muted">{selectedWorker.lastPrompt}</p>
          )}
          {selectedWorkerActions.length > 0 && (
            <div className="mt-1 border-t border-forge-border/40 pt-1">
              <p className="text-[10px] uppercase tracking-widest text-forge-muted">Recent worker actions</p>
              <div className="mt-1 space-y-0.5">
                {selectedWorkerActions.map((action) => (
                  <p key={`worker-detail-${action.id}`} className="text-[10px] text-forge-muted">
                    {action.createdAt} · {action.actionKind}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="text-forge-muted">Filter:</span>
        {(['all', 'planner', 'worker', 'notify', 'lifecycle'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter(kind)}
            className={`rounded border px-1.5 py-0.5 ${
              kindFilter === kind
                ? 'border-forge-blue/40 bg-forge-blue/15 text-forge-blue'
                : 'border-forge-border bg-black/10 text-forge-muted'
            }`}
          >
            {kind}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setWorkerFilter('all')}
          className={`rounded border px-1.5 py-0.5 ${
            workerFilter === 'all'
              ? 'border-forge-blue/40 bg-forge-blue/15 text-forge-blue'
              : 'border-forge-border bg-black/10 text-forge-muted'
          }`}
        >
          worker: {workerFilter === 'all' ? 'all' : workerFilter}
        </button>
      </div>

      {groupedByWorker.size > 0 && (
        <div className="mb-2 grid gap-1 md:grid-cols-2">
          {Array.from(groupedByWorker.entries()).slice(0, 4).map(([workerId, actions]) => (
            <div key={`group-${workerId}`} className="rounded border border-forge-border/60 bg-black/10 p-1.5">
              <p className="text-[10px] font-semibold text-forge-text">
                {workerId === 'general' ? 'General' : workerId} · {actions.length} actions
              </p>
              <p className="line-clamp-1 text-[10px] text-forge-muted">
                {actions[0]?.actionKind ?? '—'} {actions[0]?.message ? `· ${actions[0].message}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-36 space-y-1 overflow-y-auto text-[11px]">
        {filteredActions.slice(0, 18).map((action) => (
          <div
            key={action.id}
            className={`rounded border p-1.5 ${
              action.actionKind === 'validation_error'
                ? 'border-forge-yellow/40 bg-forge-yellow/10'
                : action.actionKind.startsWith('replay_')
                ? 'border-forge-blue/35 bg-forge-blue/10'
                : 'border-forge-border/60 bg-black/10'
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedActionId((current) => (current === action.id ? null : action.id))}
              className="w-full text-left text-forge-text"
            >
              <span className="font-semibold">{action.actionKind}</span>
              {action.workerId ? ` · ${action.workerId}` : ''}
              <span className="ml-1 text-forge-muted">{action.createdAt}</span>
            </button>
            {action.message && <p className="text-forge-muted">{action.message}</p>}
            {(action.replayKind || action.replayedFromActionId) && (
              <p className="text-forge-dim">
                replay={action.replayKind ?? 'exact'}
                {action.replayedFromActionId ? ` · from ${action.replayedFromActionId}` : ''}
              </p>
            )}
            {action.prompt && <p className="line-clamp-2 text-forge-muted">{action.prompt}</p>}
            {expandedActionId === action.id && action.rawJson && (
              <pre className="mt-1 max-h-28 overflow-auto rounded border border-forge-border bg-black/30 p-1 text-[10px] text-forge-muted">
                {action.rawJson}
              </pre>
            )}
            {['planner', 'spawn_worker', 'message_worker', 'stop_worker'].includes(action.actionKind) && (
              <div className="mt-1">
                <button
                  type="button"
                  disabled={replayBusyActionId === action.id}
                  onClick={() => {
                    setReplayBusyActionId(action.id);
                    setReplayNotice(null);
                    const promptOverride = promptOverrides[action.id]?.trim();
                    void onReplayAction(action.id, promptOverride ? promptOverride : null)
                      .then(() => {
                        const timestamp = new Date().toLocaleTimeString();
                        setReplayedAtByActionId((current) => ({ ...current, [action.id]: timestamp }));
                        setReplayNotice(`Replayed ${action.actionKind} at ${timestamp}.`);
                        setEditingActionId((current) => (current === action.id ? null : current));
                      })
                      .catch((err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        setReplayNotice(`Replay failed: ${message}`);
                      })
                      .finally(() => setReplayBusyActionId(null));
                  }}
                  className="rounded border border-forge-blue/30 bg-forge-blue/10 px-1.5 py-0.5 text-[10px] text-forge-blue hover:bg-forge-blue/20"
                >
                  {replayBusyActionId === action.id ? 'Replaying…' : 'Replay action'}
                </button>
                {(action.prompt || action.actionKind === 'planner') && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingActionId((current) => (current === action.id ? null : action.id));
                      setPromptOverrides((current) => ({
                        ...current,
                        [action.id]: current[action.id] ?? action.prompt ?? '',
                      }));
                    }}
                    className="ml-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-forge-surface-overlay"
                  >
                    {editingActionId === action.id ? 'Hide edit' : 'Replay with edit'}
                  </button>
                )}
                {replayedAtByActionId[action.id] && (
                  <span className="ml-2 text-[10px] text-forge-muted">
                    replayed at {replayedAtByActionId[action.id]}
                  </span>
                )}
              </div>
            )}
            {editingActionId === action.id && (
              <div className="mt-1 rounded border border-forge-border/60 bg-black/20 p-1">
                <p className="mb-1 text-[10px] text-forge-muted">Prompt override</p>
                <textarea
                  value={promptOverrides[action.id] ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setPromptOverrides((current) => ({ ...current, [action.id]: nextValue }));
                  }}
                  rows={3}
                  className="w-full resize-y rounded border border-forge-border bg-forge-bg px-1.5 py-1 text-[10px] text-forge-text focus:border-forge-blue/40 focus:outline-none"
                />
              </div>
            )}
          </div>
        ))}
        {filteredActions.length === 0 && (
          <p className="text-forge-muted">No coordinator actions yet.</p>
        )}
      </div>
    </div>
  );
}
