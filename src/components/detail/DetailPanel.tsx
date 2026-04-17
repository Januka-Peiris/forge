import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  GitBranch, ArrowUp, ArrowDown, AlertTriangle,
  Clock, ExternalLink, Activity, CheckCircle2,
  Circle, AlertCircle, Link2, Plus, GitPullRequest, Loader2, GitMerge, ChevronDown
} from 'lucide-react';
import type {
  ActivityItem as ForgeActivityItem,
  DiscoveredRepository,
  LinkedWorktreeRef,
  Workspace,
} from '../../types';
import { listWorkspaceActivity } from '../../lib/tauri-api/activity';
import { setWorkspaceCostLimit } from '../../lib/tauri-api/workspaces';
import { StatusBadge, AgentBadge } from '../workspaces/StatusBadge';
import { ContextPreviewPanel } from '../context/ContextPreviewPanel';

interface DetailPanelProps {
  workspace: Workspace | null;
  isArchived?: boolean;
  onRefreshWorkspaceState?: () => void;
  onOpenInCursor?: () => void;
  onArchiveWorkspace?: () => void;
  onDeleteWorkspace?: () => void;
  onCreatePr?: () => Promise<{ prUrl: string; prNumber: number } | void>;
  activityItems?: ForgeActivityItem[];
  repositories?: DiscoveredRepository[];
  linkedWorktrees?: LinkedWorktreeRef[];
  onAttachLinkedWorktree?: (worktreeId: string) => void;
  onDetachLinkedWorktree?: (worktreeId: string) => void;
  onOpenLinkedWorktreeInCursor?: (path: string) => void;
  onCreateChildWorkspace?: () => void;
}

function TimelineRow({ icon: Icon, color, label, time }: { icon: ElementType; color: string; label: string; time: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
        <Icon className="w-2.5 h-2.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-forge-text leading-snug">{label}</p>
        <p className="text-xs text-forge-muted mt-0.5">{time}</p>
      </div>
    </div>
  );
}

export function DetailPanel({
  workspace,
  isArchived = false,
  onOpenInCursor,
  onArchiveWorkspace,
  onDeleteWorkspace,
  onCreatePr,
  activityItems = [],
  repositories = [],
  linkedWorktrees = [],
  onAttachLinkedWorktree,
  onDetachLinkedWorktree,
  onOpenLinkedWorktreeInCursor,
  onCreateChildWorkspace,
}: DetailPanelProps) {
  const [selectedLinkedWorktreeId, setSelectedLinkedWorktreeId] = useState('');
  const [prCreating, setPrCreating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<ForgeActivityItem[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setTimelineLoading(true);
    listWorkspaceActivity(workspace.id, 50)
      .then((items) => { if (!cancelled) setTimelineItems(items); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [workspace?.id]);

  const workspaceRepositoryId = workspace?.repositoryId;
  const linkedById = useMemo(
    () => new Set(linkedWorktrees.map((item) => item.worktreeId)),
    [linkedWorktrees],
  );
  const primaryPath = workspace?.workspaceRootPath ?? workspace?.selectedWorktreePath;
  const groupedAttachOptions = useMemo(() => {
    const search = linkedSearch.trim().toLowerCase();
    return repositories.map((repo) => ({
      repoId: repo.id,
      repoName: repo.name,
      worktrees: repo.worktrees.filter((wt) => {
        if (workspaceRepositoryId && repo.id === workspaceRepositoryId) return false;
        if (linkedById.has(wt.id)) return false;
        if (primaryPath && wt.path === primaryPath) return false;
        if (!search) return true;
        return (
          repo.name.toLowerCase().includes(search)
          || wt.path.toLowerCase().includes(search)
          || (wt.branch ?? '').toLowerCase().includes(search)
        );
      }),
    })).filter((group) => group.worktrees.length > 0);
  }, [linkedById, linkedSearch, primaryPath, repositories, workspaceRepositoryId]);

  if (!workspace) {
    return (
      <aside className="w-[300px] shrink-0 h-full bg-forge-surface flex flex-col items-center justify-center">
        <div className="text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-forge-card border border-forge-border flex items-center justify-center mx-auto mb-3">
            <Activity className="w-5 h-5 text-forge-muted" />
          </div>
          <p className="text-sm font-medium text-forge-muted">No workspace selected</p>
          <p className="text-sm text-forge-muted mt-1">Select a workspace to inspect it</p>
        </div>
      </aside>
    );
  }

  const riskColor = {
    Low: 'text-forge-green',
    Medium: 'text-forge-yellow',
    High: 'text-forge-red',
  }[workspace.mergeRisk];

  const sessionStatus = workspace.agentSession?.status ?? 'idle';
  const sessionModel = workspace.agentSession?.model ?? 'not started';
  const activityRows = activityItems.slice(0, 8).map((item) => {
    const tone = item.level === 'error'
      ? { icon: AlertCircle, color: 'bg-forge-red/70' }
      : item.level === 'warning'
      ? { icon: AlertTriangle, color: 'bg-forge-yellow/70' }
      : item.level === 'success'
      ? { icon: CheckCircle2, color: 'bg-forge-green/70' }
      : { icon: Circle, color: 'bg-forge-muted/60' };
    return {
      icon: tone.icon,
      color: tone.color,
      label: item.details ? `${item.event} · ${item.details}` : item.event,
      time: item.timestamp,
    };
  });

  return (
    <aside className="w-full shrink-0 h-full bg-forge-surface flex flex-col overflow-hidden">
      {/* Header — always visible */}
      <div className="px-4 py-4 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-forge-text truncate">{workspace.name}</h2>
          <StatusBadge status={workspace.status} />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-forge-muted mt-1">
          <span className="text-forge-text/90 font-medium">{workspace.repo}</span>
          <span className="text-forge-muted">/</span>
          <GitBranch className="w-3 h-3 shrink-0 text-forge-muted" />
          <span className="font-mono truncate text-forge-text/90">{workspace.branch}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <AgentBadge agent={workspace.agent} />
          <span className="text-xs text-forge-muted">{sessionStatus} · {sessionModel}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <>
            {/* Current Task */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-1.5">Current Task</p>
              <p className="text-sm text-forge-text/92 leading-relaxed">{workspace.currentTask}</p>
            </div>

            {/* Branch Health */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Branch Health</p>
              <p className="text-xs leading-snug text-forge-muted/90 mb-2">
                Saved workspace row (not live git). For current ahead/behind vs base, use Readiness in the workspace view.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border">
                  <div className="flex items-center gap-1 text-forge-green mb-0.5">
                    <ArrowUp className="w-3 h-3" />
                    <span className="text-xs font-semibold">Ahead</span>
                  </div>
                  <p className="text-[18px] font-bold text-forge-text">{workspace.aheadBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border">
                  <div className="flex items-center gap-1 text-forge-yellow mb-0.5">
                    <ArrowDown className="w-3 h-3" />
                    <span className="text-xs font-semibold">Behind</span>
                  </div>
                  <p className="text-[18px] font-bold text-forge-text">{workspace.behindBy}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-forge-muted">
                  <AlertTriangle className="w-3 h-3" />
                  Merge risk:
                  <span className={`font-semibold ${riskColor}`}>{workspace.mergeRisk}</span>
                </span>
                <span className="flex items-center gap-1 text-forge-text/85">
                  <Clock className="w-3 h-3 text-forge-muted shrink-0" />
                  {workspace.lastRebase}
                </span>
              </div>
            </div>

            {/* Pull Request */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Pull Request</p>
              {workspace.prStatus && workspace.prNumber ? (
                <div className="flex items-center gap-2 mb-2">
                  <GitPullRequest className="w-3.5 h-3.5 text-forge-green shrink-0" />
                  <span className="text-sm text-forge-text font-medium">PR #{workspace.prNumber}</span>
                  <span className="text-xs text-forge-muted capitalize">{workspace.prStatus}</span>
                </div>
              ) : (
                <p className="text-xs text-forge-muted mb-2">No PR open yet.</p>
              )}
              {prError && <p className="text-xs text-forge-red mb-1">{prError}</p>}
              {!workspace.prStatus && (
                <button
                  disabled={prCreating}
                  onClick={async () => {
                    if (!onCreatePr) return;
                    setPrCreating(true);
                    setPrError(null);
                    try {
                      await onCreatePr();
                    } catch (err) {
                      setPrError(String(err));
                    } finally {
                      setPrCreating(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forge-green/15 hover:bg-forge-green/25 disabled:opacity-50 text-sm font-semibold text-forge-green border border-forge-green/20 transition-colors"
                >
                  {prCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitPullRequest className="w-3 h-3" />}
                  {prCreating ? 'Creating PR…' : 'Create PR'}
                </button>
              )}
            </div>

            {/* Budget Cap */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Budget Cap</p>
              <p className="text-xs text-forge-muted mb-2">
                {workspace.costLimitUsd ? `Current cap: $${workspace.costLimitUsd.toFixed(2)}` : 'No cap set'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(budgetInput);
                    void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat(budgetInput);
                      void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                    }
                  }}
                  placeholder="e.g. 5.00"
                  className="flex-1 bg-forge-card border border-forge-border rounded px-2 py-1 text-sm text-forge-text placeholder:text-forge-muted/70 focus:outline-none focus:border-forge-orange/40"
                />
                <span className="text-xs text-forge-muted">USD</span>
              </div>
            </div>

            {/* Context Preview */}
            <div className="mx-4 my-3">
              <ContextPreviewPanel workspaceId={workspace.id} />
            </div>

            {/* Timeline */}
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Timeline</p>
                {timelineLoading && <Loader2 className="w-3 h-3 animate-spin text-forge-muted" />}
              </div>
              {(() => {
                const allItems = timelineItems.length > 0 ? timelineItems : activityRows.map((r, i) => ({
                  id: String(i), event: r.label, level: 'info' as const, timestamp: r.time,
                  repo: '', workspaceId: workspace.id,
                }));
                const visibleItems = timelineExpanded ? allItems : allItems.slice(0, 8);
                const eventIcon = (event: string, level: string) => {
                  if (event.toLowerCase().includes('pr') || event.toLowerCase().includes('pull')) return { icon: GitPullRequest, color: level === 'success' ? 'bg-forge-green/70' : 'bg-forge-blue/70' };
                  if (event.toLowerCase().includes('rebase') || event.toLowerCase().includes('merge')) return { icon: GitMerge, color: level === 'warning' ? 'bg-forge-yellow/70' : 'bg-forge-green/70' };
                  if (level === 'error') return { icon: AlertCircle, color: 'bg-forge-red/70' };
                  if (level === 'warning') return { icon: AlertTriangle, color: 'bg-forge-yellow/70' };
                  if (level === 'success') return { icon: CheckCircle2, color: 'bg-forge-green/70' };
                  return { icon: Circle, color: 'bg-forge-muted/60' };
                };
                return (
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 bottom-2 w-px bg-forge-border" />
                    <div className="pl-1">
                      {visibleItems.length === 0 ? (
                        <p className="text-xs text-forge-muted">No activity recorded yet.</p>
                      ) : visibleItems.map((item, i) => {
                        const { icon, color } = eventIcon(item.event, item.level ?? 'info');
                        const label = 'details' in item && item.details ? `${item.event} · ${item.details}` : item.event;
                        const time = 'timestamp' in item ? String(item.timestamp) : '';
                        return <TimelineRow key={i} icon={icon} color={color} label={label} time={time} />;
                      })}
                    </div>
                    {allItems.length > 8 && (
                      <button
                        onClick={() => setTimelineExpanded((e) => !e)}
                        className="mt-1 flex items-center gap-1 text-xs text-forge-muted hover:text-forge-text"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${timelineExpanded ? 'rotate-180' : ''}`} />
                        {timelineExpanded ? 'Show less' : `Show all ${allItems.length}`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Linked Worktrees */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Linked Worktrees</p>
              <input
                value={linkedSearch}
                onChange={(event) => setLinkedSearch(event.target.value)}
                placeholder="Search repos/worktrees..."
                className="mb-2 w-full bg-forge-card border border-forge-border rounded px-2 py-1 text-xs text-forge-text placeholder:text-forge-muted/80"
              />
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedLinkedWorktreeId}
                  onChange={(event) => setSelectedLinkedWorktreeId(event.target.value)}
                  className="flex-1 bg-forge-card border border-forge-border rounded px-2 py-1 text-xs text-forge-text"
                >
                  <option value="">Select worktree to attach</option>
                  {groupedAttachOptions.map((group) => (
                    <optgroup key={group.repoId} label={group.repoName}>
                      {group.worktrees.map((wt) => (
                        <option key={wt.id} value={wt.id}>
                          {wt.branch ?? 'detached'} · {wt.path}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => selectedLinkedWorktreeId && onAttachLinkedWorktree?.(selectedLinkedWorktreeId)}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-forge-text/80 border border-forge-border"
                >
                  Attach
                </button>
              </div>
              {linkedWorktrees.length === 0 ? (
                <p className="text-xs text-forge-muted leading-relaxed">No linked worktrees yet. Attach a worktree from another repo for supporting context.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedWorktrees.map((linked) => (
                    <div key={linked.worktreeId} className="rounded border border-forge-border/60 bg-forge-card/60 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-forge-text">
                        <Link2 className="w-3 h-3 text-forge-blue" />
                        <span className="font-semibold">{linked.repoName}</span>
                        <span className="font-mono text-forge-text/85">{linked.branch ?? 'detached'}</span>
                      </div>
                      <p className="mt-1 text-xs font-mono text-forge-muted truncate">{linked.path}</p>
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => onOpenLinkedWorktreeInCursor?.(linked.path)} className="text-xs text-forge-blue hover:underline">
                          Open in Cursor
                        </button>
                        <button onClick={() => onDetachLinkedWorktree?.(linked.worktreeId)} className="text-xs text-forge-red hover:underline">
                          Detach
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lineage */}
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Lineage</p>
                <button onClick={onCreateChildWorkspace} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs bg-white/5 hover:bg-white/10 text-forge-text/80">
                  <Plus className="w-3 h-3" /> Branch From Here
                </button>
              </div>
              <p className="text-xs text-forge-muted">
                Parent: <span className="font-mono text-forge-text">{workspace.parentWorkspaceId ?? 'none'}</span>
              </p>
              <p className="text-xs text-forge-muted mt-1">
                Source: <span className="font-mono text-forge-text">{workspace.sourceWorkspaceId ?? 'self'}</span>
              </p>
              <p className="text-xs text-forge-muted mt-1">
                Derived:{' '}
                <span className="font-mono text-forge-text">{workspace.derivedFromBranch ?? workspace.branch}</span>
              </p>
            </div>
          </>
      </div>

      {/* Footer — always visible */}
      <div className="px-4 py-3 border-t border-forge-border shrink-0 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={onArchiveWorkspace}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-sm font-medium text-forge-text/85 transition-colors border border-forge-border"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            onClick={onDeleteWorkspace}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-forge-red/10 hover:bg-forge-red/20 text-sm font-semibold text-forge-red transition-colors border border-forge-red/20"
          >
            Delete
          </button>
        </div>
        <button onClick={onOpenInCursor} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-forge-blue/15 hover:bg-forge-blue/25 text-sm font-semibold text-forge-blue transition-colors border border-forge-blue/20">
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Cursor
        </button>
      </div>
    </aside>
  );
}
