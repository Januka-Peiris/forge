import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';
import { buildWorkspaceRepoContext, getContextStatus, refreshWorkspaceRepoContext } from '../../lib/tauri-api/context';
import { useContextPreview } from '../../hooks/useContextPreview';
import type { ContextSegment, ContextStatus } from '../../types/context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface Props {
  workspaceId: string;
}

export function ContextPreviewPanel({ workspaceId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<ContextStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const { preview, loading, error, refresh } = useContextPreview(expanded ? workspaceId : null);

  const loadStatus = useCallback(async () => {
    if (!workspaceId) return;
    setStatusLoading(true);
    try {
      setStatus(await getContextStatus(workspaceId));
    } finally {
      setStatusLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!expanded) return;
    void loadStatus();
  }, [expanded, loadStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshWorkspaceRepoContext(workspaceId);
      await Promise.all([refresh(), loadStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await buildWorkspaceRepoContext(workspaceId, true);
      await Promise.all([refresh(), loadStatus()]);
    } finally {
      setBuilding(false);
    }
  };

  const budget = 4000;
  const usedTokens = preview?.estimatedTokensContext ?? 0;
  const pressure = Math.max(0, Math.min(1, usedTokens / budget));
  const pressureLabel = pressure >= 0.9 ? 'high' : pressure >= 0.65 ? 'moderate' : 'healthy';
  const pressureClass = pressure >= 0.9
    ? 'bg-forge-red'
    : pressure >= 0.65
      ? 'bg-forge-yellow'
      : 'bg-forge-green';

  const topContributors = useMemo(
    () => [...(preview?.included ?? [])].sort((a, b) => b.estimatedTokens - a.estimatedTokens).slice(0, 5),
    [preview],
  );
  const mandatoryCount = preview?.included.filter((segment) => segment.tier === 'mandatory').length ?? 0;
  const relatedCount = preview?.included.filter((segment) => segment.tier !== 'mandatory').length ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-white/5">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">Context Health</span>
          {preview && (
            <span className="text-xs text-white/40">
              ~{usedTokens.toLocaleString()} / {budget.toLocaleString()} tokens
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {preview && (
            <>
              <StatusChip stale={preview.staleMap} lowSignal={preview.lowSignal} signalScore={preview.signalScore} />
              <Badge variant={pressure >= 0.9 ? 'destructive' : pressure >= 0.65 ? 'warning' : 'success'}>
                {pressureLabel} pressure
              </Badge>
            </>
          )}
          <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/5 px-4 pb-4 pt-3">
          {(preview?.warning || error) && (
            <div className="rounded bg-amber-500/10 p-2 text-xs text-amber-400">
              {preview?.warning ?? error}
            </div>
          )}

          {(loading || statusLoading) && <p className="text-xs text-white/40">Loading context health…</p>}

          {preview && !loading && (
            <>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <MetricCard label="Signal" value={`${Math.round(preview.signalScore * 100)}%`} detail={preview.lowSignal ? 'low-signal fallback active' : 'repo map contributing'} />
                <MetricCard label="Included" value={`${preview.included.length}`} detail={`${mandatoryCount} mandatory · ${relatedCount} related`} />
                <MetricCard label="Excluded" value={`${preview.excluded.length}`} detail={preview.excluded.length > 0 ? 'trimmed for budget' : 'nothing trimmed'} />
                <MetricCard
                  label="Map status"
                  value={preview.staleMap ? 'Stale' : 'Fresh'}
                  detail={status?.engine ? `${status.engine} · ${status.filesIndexed ?? 0} files indexed` : 'context status unavailable'}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/40">
                  <span>Context pressure</span>
                  <span>{usedTokens.toLocaleString()} / {budget.toLocaleString()} tokens</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full ${pressureClass}`} style={{ width: `${Math.max(6, pressure * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-white/40">
                  {preview.lowSignal
                    ? 'Low-signal mode means Forge fell back toward changed-file diffs instead of a rich repo map.'
                    : preview.staleMap
                      ? 'Stale context can miss default-branch changes until you refresh or rebuild.'
                      : preview.excluded.length > 0
                        ? 'Some files were excluded to stay inside the soft context budget.'
                        : 'Context currently fits within budget without trimming.'}
                </p>
              </div>

              {status && (
                <div className="rounded border border-white/5 bg-white/5 p-3">
                  <p className="text-xs font-semibold text-white/70">Repo map health</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/50 md:grid-cols-4">
                    <span>Engine: <span className="text-white/70">{status.engine}</span></span>
                    <span>Files: <span className="text-white/70">{status.filesIndexed ?? 0}</span></span>
                    <span>Symbols: <span className="text-white/70">{status.symbolCount ?? 0}</span></span>
                    <span>Coverage: <span className="text-white/70">{Math.round((status.symbolCoverage ?? 0) * 100)}%</span></span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded border border-white/5 bg-white/5 p-3">
                  <p className="text-xs font-semibold text-white/70">Top token contributors</p>
                  <div className="mt-2 space-y-1">
                    {topContributors.length === 0 ? (
                      <p className="text-xs text-white/40">No included context segments yet.</p>
                    ) : topContributors.map((segment) => (
                      <SegmentRow key={`${segment.path}-${segment.renderMode}`} seg={segment} />
                    ))}
                  </div>
                </div>

                <div className="rounded border border-white/5 bg-white/5 p-3">
                  <p className="text-xs font-semibold text-white/70">Excluded or trimmed files</p>
                  <div className="mt-2 space-y-1">
                    {preview.excluded.length === 0 ? (
                      <p className="text-xs text-white/40">Nothing excluded right now.</p>
                    ) : preview.excluded.slice(0, 6).map((path) => (
                      <div key={path} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                        <div className="min-w-0">
                          <p className="truncate text-white/70">{path}</p>
                          <p className="text-[11px] text-white/40">Excluded to stay inside the soft token budget.</p>
                        </div>
                      </div>
                    ))}
                    {preview.excluded.length > 6 && (
                      <p className="text-xs text-white/40">+{preview.excluded.length - 6} more excluded file(s)</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded border border-white/5 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white/70">Included context segments</p>
                  <span className="text-[11px] text-white/40">{preview.included.length} segment(s)</span>
                </div>
                <div className="space-y-1">
                  {preview.included.length === 0 ? (
                    <p className="text-xs italic text-white/40">No context entries yet — build or refresh the repo map.</p>
                  ) : preview.included.map((segment) => (
                    <SegmentRow key={`${segment.path}-${segment.renderMode}-${segment.tier}`} seg={segment} />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-white/5 pt-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRefresh}
              disabled={loading || building || refreshing}
              className="text-white/40 hover:text-white/70"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh context'}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleBuild}
              disabled={loading || building || refreshing}
              className="text-white/40 hover:text-white/70"
            >
              {building ? 'Rebuilding…' : 'Rebuild repo map'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-white/5 bg-white/5 px-2.5 py-2">
      <p className="text-[11px] text-white/40">{label}</p>
      <p className="text-sm font-semibold text-white/80">{value}</p>
      <p className="mt-0.5 text-[11px] text-white/40">{detail}</p>
    </div>
  );
}

function SegmentRow({ seg }: { seg: ContextSegment }) {
  const kindColour = {
    mandatory: 'bg-blue-500/20 text-blue-400',
    related: 'bg-purple-500/20 text-purple-400',
  }[seg.tier] ?? 'bg-white/10 text-white/50';

  const modeLabel: Record<string, string> = {
    full: 'full',
    diff_hunks: 'diff',
    symbol_card: 'symbols',
    summary_line: 'summary',
  };

  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${kindColour}`}>
          {modeLabel[seg.renderMode] ?? seg.renderMode}
        </span>
        <span className="truncate text-white/60">{seg.path}</span>
      </div>
      <span className="ml-2 shrink-0 text-white/30">~{seg.estimatedTokens}t</span>
    </div>
  );
}

function StatusChip({ stale, lowSignal, signalScore }: { stale: boolean; lowSignal: boolean; signalScore: number }) {
  if (lowSignal) return <Badge variant="destructive">low signal</Badge>;
  if (stale) return <Badge variant="warning">stale</Badge>;
  return <Badge variant="success">fresh {Math.round(signalScore * 100)}%</Badge>;
}
