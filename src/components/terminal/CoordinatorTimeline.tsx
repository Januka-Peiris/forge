import { useMemo, useState } from 'react';
import type { AgentProfile } from '../../types';
import type {
  CoordinatorActionLog,
  CoordinatorResultPayload,
  WorkspaceCoordinatorStatus,
} from '../../types/coordinator';

interface CoordinatorTimelineProps {
  workspaceId: string;
  status: WorkspaceCoordinatorStatus | null;
  agentProfiles: AgentProfile[];
  onRefresh: () => void;
  onReplayAction: (actionId: string, promptOverride?: string | null) => Promise<void>;
  onOpenReviewCockpit?: (path?: string | null) => void;
  onReviewDiff?: () => void;
  onRunTests?: () => void;
  onAskReviewer?: () => void;
  onCreatePr?: () => void;
  canReviewDiff?: boolean;
  canRunTests?: boolean;
  canAskReviewer?: boolean;
  canCreatePr?: boolean;
  hasExistingPr?: boolean;
}

function profileLabel(agentProfiles: AgentProfile[], profileId: string): string {
  const known = agentProfiles.find((profile) => profile.id === profileId)?.label;
  if (known) return known;
  if (profileId.startsWith('builtin-brain-')) {
    return `${profileId.replace('builtin-brain-', '').replace(/-/g, ' ')} brain`;
  }
  if (profileId.startsWith('builtin-coder-')) {
    return `${profileId.replace('builtin-coder-', '').replace(/-/g, ' ')} coder`;
  }
  return profileId;
}

type TimelineViewState = 'expanded' | 'collapsed' | 'hidden';

interface CoordinatorResultCard {
  action: CoordinatorActionLog;
  result: CoordinatorResultPayload;
  structured: boolean;
}

function stateKey(workspaceId: string) {
  return `forge:coordinator-timeline:${workspaceId}`;
}

function isScale(value: string | null | undefined): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}

function normalizeScale(value: string | null | undefined): 'low' | 'medium' | 'high' {
  if (isScale(value)) return value;
  return 'medium';
}

function parseResultFromRawJson(rawJson?: string | null): CoordinatorResultPayload | null {
  if (!rawJson || !rawJson.trim()) return null;
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const candidate = (parsed && typeof parsed === 'object' && parsed.result && typeof parsed.result === 'object')
      ? parsed.result as Record<string, unknown>
      : parsed;
    const goal = typeof candidate.goal === 'string' ? candidate.goal : null;
    const decision = typeof candidate.decision === 'string' ? candidate.decision : null;
    if (!goal || !decision) return null;
    const evidence = Array.isArray(candidate.evidence) ? candidate.evidence.filter((item): item is string => typeof item === 'string') : [];
    const risks = Array.isArray(candidate.risks) ? candidate.risks.filter((item): item is string => typeof item === 'string') : [];
    const artifacts = Array.isArray(candidate.artifacts)
      ? candidate.artifacts
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          kind: typeof item.kind === 'string' ? item.kind : 'note',
          label: typeof item.label === 'string' ? item.label : null,
          path: typeof item.path === 'string' ? item.path : null,
          value: typeof item.value === 'string' ? item.value : null,
        }))
      : [];
    return {
      goal,
      decision,
      evidence,
      risks,
      nextAction: typeof candidate.nextAction === 'string' ? candidate.nextAction : null,
      confidence: normalizeScale(typeof candidate.confidence === 'string' ? candidate.confidence : null),
      impact: normalizeScale(typeof candidate.impact === 'string' ? candidate.impact : null),
      status: typeof candidate.status === 'string' ? candidate.status : 'needs_review',
      artifacts,
    };
  } catch {
    return null;
  }
}

function fallbackResultForAction(action: CoordinatorActionLog, goal: string): CoordinatorResultPayload | null {
  if (!['planner', 'notify_user', 'complete', 'validation_error'].includes(action.actionKind)) {
    return null;
  }
  const decision = (action.message ?? action.prompt ?? '').trim()
    || (action.actionKind === 'complete'
      ? 'Coordinator marked this run complete.'
      : action.actionKind === 'notify_user'
        ? 'Coordinator requested a user-facing review.'
        : action.actionKind === 'validation_error'
          ? 'Coordinator produced invalid actions and requires intervention.'
          : 'Planner generated coordinator actions.');
  return {
    goal: goal.trim() || 'Coordinator run',
    decision,
    evidence: [
      `${action.actionKind} · ${action.createdAt}`,
    ],
    risks: action.actionKind === 'validation_error' ? ['Planner action validation failed.'] : [],
    nextAction: action.actionKind === 'complete' ? 'review_diff' : null,
    confidence: action.actionKind === 'validation_error' ? 'low' : 'medium',
    impact: action.actionKind === 'complete' ? 'high' : 'medium',
    status: action.actionKind === 'complete'
      ? 'completed'
      : action.actionKind === 'validation_error'
        ? 'failed'
        : 'needs_review',
    artifacts: [],
  };
}

function artifactReviewPath(result: CoordinatorResultPayload): string | null {
  const fileArtifact = result.artifacts.find((artifact) => artifact.path && (artifact.kind === 'file' || artifact.kind === 'path'));
  return fileArtifact?.path ?? null;
}

function triadChipTone(value: string): string {
  if (value === 'high') return 'border-forge-red/40 bg-forge-red/10 text-forge-red';
  if (value === 'low') return 'border-forge-green/40 bg-forge-green/10 text-forge-green';
  return 'border-forge-yellow/35 bg-forge-yellow/10 text-forge-yellow';
}

function derivedRisk(result: CoordinatorResultPayload): 'low' | 'medium' | 'high' {
  if (result.risks.length >= 2) return 'high';
  if (result.risks.length === 1) return 'medium';
  return 'low';
}

export function CoordinatorTimeline({
  workspaceId,
  status,
  agentProfiles,
  onRefresh,
  onReplayAction,
  onOpenReviewCockpit,
  onReviewDiff,
  onRunTests,
  onAskReviewer,
  onCreatePr,
  canReviewDiff = false,
  canRunTests = false,
  canAskReviewer = false,
  canCreatePr = false,
  hasExistingPr = false,
}: CoordinatorTimelineProps) {
  const [kindFilter, setKindFilter] = useState<'all' | 'planner' | 'worker' | 'notify' | 'lifecycle'>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [replayBusyActionId, setReplayBusyActionId] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [replayedAtByActionId, setReplayedAtByActionId] = useState<Record<string, string>>({});
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [visibleResultCount, setVisibleResultCount] = useState(10);
  const [viewState, setViewState] = useState<TimelineViewState>(() => {
    const raw = window.localStorage.getItem(stateKey(workspaceId));
    return raw === 'expanded' || raw === 'collapsed' || raw === 'hidden' ? raw : 'collapsed';
  });
  const workers = useMemo(() => status?.workers ?? [], [status]);
  const recentActions = useMemo(() => status?.recentActions ?? [], [status]);
  const activeWorkers = useMemo(
    () => workers.filter((worker) => worker.status === 'running'),
    [workers],
  );

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
    return recentActions
      .filter((action) => byKind(action.actionKind))
      .filter((action) => byWorker(action.workerId));
  }, [kindFilter, recentActions, workerFilter]);

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
    () => (selectedWorkerId ? workers.find((worker) => worker.id === selectedWorkerId) ?? null : null),
    [selectedWorkerId, workers],
  );
  const selectedWorkerActions = useMemo(() => {
    if (!selectedWorker) return [];
    return recentActions
      .filter((action) => action.workerId === selectedWorker.id)
      .slice(0, 8);
  }, [recentActions, selectedWorker]);
  const resultCards = useMemo<CoordinatorResultCard[]>(() => {
    const goal = status?.activeRun?.goal ?? 'Coordinator run';
    return recentActions
      .map((action) => {
        const structured = action.result ?? parseResultFromRawJson(action.rawJson);
        const result = structured ?? fallbackResultForAction(action, goal);
        if (!result) return null;
        return { action, result, structured: !!structured };
      })
      .filter((item): item is CoordinatorResultCard => !!item);
  }, [recentActions, status?.activeRun?.goal]);
  const visibleResultCards = resultCards.slice(0, visibleResultCount);
  const newestResultCard = resultCards[0] ?? null;

  const hasData = !!status?.activeRun || (status?.recentActions.length ?? 0) > 0;
  if (!status) return null;
  if (!hasData && viewState === 'hidden') return null;

  const runningWorkers = status.workers.filter((worker) => worker.status === 'running').length;
  const statusText = status.activeRun ? `running (${runningWorkers} workers)` : 'idle';

  const setPersistedViewState = (next: TimelineViewState) => {
    setViewState(next);
    window.localStorage.setItem(stateKey(workspaceId), next);
  };

  if (viewState === 'hidden') {
    return (
      <div className="mx-2 mt-2 flex items-center justify-between rounded border border-forge-border/70 bg-forge-card/40 px-2 py-1 text-[11px]">
        <span className="text-forge-muted">Coordinator · {statusText}</span>
        <button
          type="button"
          onClick={() => setPersistedViewState('collapsed')}
          className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-forge-surface-overlay"
        >
          Show timeline
        </button>
      </div>
    );
  }

  return (
    <div className="mx-2 mt-2 rounded-lg border border-forge-border bg-forge-card/60 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-forge-muted">Coordinator timeline</p>
          <p className="text-[11px] text-forge-muted">
            {status.activeRun ? `Run ${status.activeRun.id}` : 'No active run'} · {status.mode}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPersistedViewState(viewState === 'expanded' ? 'collapsed' : 'expanded')}
            className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-muted hover:bg-forge-surface-overlay"
          >
            {viewState === 'expanded' ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            onClick={() => setPersistedViewState('hidden')}
            className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-muted hover:bg-forge-surface-overlay"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-muted hover:bg-forge-surface-overlay"
          >
            Refresh
          </button>
        </div>
      </div>

      {viewState === 'collapsed' && (
        <div className="flex items-center justify-between rounded border border-forge-border/70 bg-black/10 px-2 py-1 text-[11px]">
          <span className={status.activeRun ? 'text-forge-orange' : 'text-forge-muted'}>
            {statusText}
          </span>
          {newestResultCard ? (
            <span className="flex max-w-[68%] items-center gap-1 overflow-hidden">
              <span className="truncate text-forge-muted" title={newestResultCard.result.decision}>
                {newestResultCard.result.decision}
              </span>
              <span className={`rounded border px-1 py-0 text-[10px] ${triadChipTone(newestResultCard.result.confidence)}`}>
                C {newestResultCard.result.confidence}
              </span>
              <span className={`rounded border px-1 py-0 text-[10px] ${triadChipTone(newestResultCard.result.impact)}`}>
                I {newestResultCard.result.impact}
              </span>
            </span>
          ) : status.plannerLastMessage ? (
            <span className="max-w-[65%] truncate text-forge-muted" title={status.plannerLastMessage}>
              {status.plannerLastMessage}
            </span>
          ) : null}
        </div>
      )}

      {viewState === 'expanded' && (
        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
      <div className="rounded border border-forge-border/70 bg-black/10 p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-forge-text">Coordinator result cards</p>
          <span className="text-[10px] text-forge-muted">
            {visibleResultCards.length}/{resultCards.length || 0}
          </span>
        </div>
        {visibleResultCards.length > 0 ? (
          <div className="space-y-2">
            {visibleResultCards.map((card) => {
              const expanded = !!expandedResultIds[card.action.id];
              const reviewPath = artifactReviewPath(card.result);
              return (
                <div key={`result-${card.action.id}`} className="rounded border border-forge-border/60 bg-black/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-forge-text">
                        {card.result.status} · {card.action.actionKind}
                        {!card.structured && <span className="ml-1 text-[10px] text-forge-yellow">(fallback)</span>}
                      </p>
                      <p className="truncate text-[10px] text-forge-muted">{card.action.createdAt} · {card.action.workerId ?? 'general'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedResultIds((current) => ({ ...current, [card.action.id]: !current[card.action.id] }))}
                      className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-forge-surface-overlay"
                    >
                      {expanded ? 'Less' : 'More'}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-forge-text">{card.result.decision}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${triadChipTone(derivedRisk(card.result))}`}>
                      Risk {derivedRisk(card.result)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${triadChipTone(card.result.confidence)}`}>
                      Confidence {normalizeScale(card.result.confidence)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${triadChipTone(card.result.impact)}`}>
                      Impact {normalizeScale(card.result.impact)}
                    </span>
                  </div>
                  {expanded && (
                    <div className="mt-2 space-y-1 text-[10px]">
                      <p className="text-forge-dim">Goal: {card.result.goal}</p>
                      {card.result.evidence.length > 0 && (
                        <div>
                          <p className="font-semibold text-forge-muted">Evidence</p>
                          <ul className="list-disc pl-4 text-forge-dim">
                            {card.result.evidence.map((item, index) => <li key={`ev-${card.action.id}-${index}`}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {card.result.risks.length > 0 && (
                        <div>
                          <p className="font-semibold text-forge-muted">Risks</p>
                          <ul className="list-disc pl-4 text-forge-yellow">
                            {card.result.risks.map((item, index) => <li key={`rk-${card.action.id}-${index}`}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={!canReviewDiff}
                      onClick={onReviewDiff}
                      className="rounded border border-forge-blue/30 bg-forge-blue/10 px-1.5 py-0.5 text-[10px] text-forge-blue disabled:opacity-50"
                    >
                      Review diff
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTests}
                      onClick={onRunTests}
                      className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted disabled:opacity-50"
                    >
                      Run tests
                    </button>
                    <button
                      type="button"
                      disabled={!canAskReviewer}
                      onClick={onAskReviewer}
                      className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted disabled:opacity-50"
                    >
                      Ask reviewer
                    </button>
                    <button
                      type="button"
                      disabled={!canCreatePr || hasExistingPr}
                      onClick={onCreatePr}
                      className="rounded border border-forge-green/30 bg-forge-green/10 px-1.5 py-0.5 text-[10px] text-forge-green disabled:opacity-50"
                    >
                      {hasExistingPr ? 'PR exists' : 'Create PR'}
                    </button>
                    <button
                      type="button"
                      disabled={!onOpenReviewCockpit}
                      onClick={() => onOpenReviewCockpit?.(reviewPath)}
                      className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-muted disabled:opacity-50"
                    >
                      Open review cockpit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-forge-muted">No structured coordinator results yet.</p>
        )}
        {resultCards.length > visibleResultCount && (
          <button
            type="button"
            onClick={() => setVisibleResultCount((current) => current + 10)}
            className="mt-2 rounded border border-forge-border px-2 py-0.5 text-[10px] text-forge-muted hover:bg-forge-surface-overlay"
          >
            Load more
          </button>
        )}
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
      )}
    </div>
  );
}
