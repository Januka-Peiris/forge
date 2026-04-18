import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  GitBranch, ArrowUp, ArrowDown, AlertTriangle,
  Clock, ExternalLink, Activity, AlertCircle, CheckCircle2,
  Link2, Plus, GitPullRequest, Loader2, ChevronRight
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
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

interface DetailPanelProps {
  workspace: Workspace | null;
  isArchived?: boolean;
  onCollapse?: () => void;
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
  onCollapse,
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
  const [activeTab, setActiveTab] = useState<'status' | 'config'>('status');
  const [selectedLinkedWorktreeId, setSelectedLinkedWorktreeId] = useState('');
  const [prCreating, setPrCreating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<ForgeActivityItem[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
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
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-bold text-forge-text truncate flex-1">{workspace.name}</h2>
          <StatusBadge status={workspace.status} />
          {onCollapse && (
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onCollapse}
              title="Collapse detail panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
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

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'config')} className="flex flex-col flex-1 min-h-0">
        <TabsList className="px-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="status">
            {/* Current Task */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-1.5">Current Task</p>
              <p className="text-sm text-forge-text/90 leading-relaxed">{workspace.currentTask || <span className="text-forge-muted italic">No task set</span>}</p>
            </div>

            {/* Pull Request — prominent, dev-flow first */}
            <div className="px-4 pb-4">
              {workspace.prStatus && workspace.prNumber ? (
                <div className="flex items-center gap-2.5 rounded-lg bg-forge-green/10 border border-forge-green/20 px-3 py-2.5">
                  <GitPullRequest className="w-4 h-4 text-forge-green shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-forge-green">PR #{workspace.prNumber}</p>
                    <p className="text-xs text-forge-muted capitalize">{workspace.prStatus}</p>
                  </div>
                </div>
              ) : (
                <>
                  {prError && <p className="text-xs text-forge-red mb-2">{prError}</p>}
                  <button
                    disabled={prCreating || !onCreatePr}
                    onClick={async () => {
                      if (!onCreatePr) return;
                      setPrCreating(true);
                      setPrError(null);
                      try { await onCreatePr(); }
                      catch (err) { setPrError(String(err)); }
                      finally { setPrCreating(false); }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-forge-green/15 hover:bg-forge-green/25 disabled:opacity-50 text-sm font-semibold text-forge-green border border-forge-green/20 transition-colors"
                  >
                    {prCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                    {prCreating ? 'Creating PR…' : 'Create Pull Request'}
                  </button>
                </>
              )}
            </div>

            {/* Activity — collapsed by default */}
            <div className="px-4 pb-2">
              <button
                type="button"
                onClick={() => setActivityOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-xs font-semibold text-forge-muted hover:text-forge-text/80 uppercase tracking-widest"
              >
                <ChevronRight className={`w-3 h-3 transition-transform ${activityOpen ? 'rotate-90' : ''}`} />
                Activity
                {timelineLoading && <Loader2 className="ml-1 w-3 h-3 animate-spin" />}
              </button>
              {activityOpen && (() => {
                const allItems = timelineItems.length > 0 ? timelineItems : activityRows.map((r, i) => ({
                  id: String(i), event: r.label, level: 'info' as const, timestamp: r.time,
                  repo: '', workspaceId: workspace.id,
                }));
                const visibleItems = timelineExpanded ? allItems : allItems.slice(0, 8);
                return (
                  <div className="mt-1.5 space-y-0.5">
                    {visibleItems.length === 0 ? (
                      <p className="text-xs text-forge-muted">No activity yet.</p>
                    ) : visibleItems.map((item, i) => {
                      const label = 'details' in item && item.details ? `${item.event} · ${item.details}` : item.event;
                      const time = 'timestamp' in item ? String(item.timestamp) : '';
                      const levelColor = item.level === 'error' ? 'text-forge-red' : item.level === 'warning' ? 'text-forge-yellow' : item.level === 'success' ? 'text-forge-green' : 'text-forge-muted';
                      return (
                        <div key={i} className="flex items-baseline gap-2">
                          <span className={`shrink-0 text-xs font-mono ${levelColor}`}>›</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-forge-text/85" title={label}>{label}</span>
                          <span className="shrink-0 text-[10px] text-forge-muted/60">{time}</span>
                        </div>
                      );
                    })}
                    {allItems.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setTimelineExpanded((e) => !e)}
                        className="mt-1 text-xs text-forge-muted hover:text-forge-text"
                      >
                        {timelineExpanded ? '↑ Show less' : `↓ ${allItems.length - 8} more`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          <TabsContent value="config">
            {/* Branch Health */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-3">Branch Health</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-green mb-1">
                    <ArrowUp className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Ahead</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.aheadBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-yellow mb-1">
                    <ArrowDown className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Behind</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.behindBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-forge-muted" />
                    <span className="text-xs text-forge-muted">Risk</span>
                  </div>
                  <p className={`text-sm font-bold ${riskColor}`}>{workspace.mergeRisk}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-forge-muted">
                <Clock className="w-3 h-3 shrink-0" />
                <span>Last rebase: {workspace.lastRebase}</span>
              </div>
            </div>

            {/* Budget Cap */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Budget Cap</p>
              <div className="flex items-center gap-2">
                <Input
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
                  placeholder={workspace.costLimitUsd ? `$${workspace.costLimitUsd.toFixed(2)}` : 'No cap'}
                  className="flex-1"
                />
                <span className="text-xs text-forge-muted shrink-0">USD</span>
              </div>
            </div>

            {/* Context Preview */}
            <div className="mx-4 pb-4">
              <ContextPreviewPanel workspaceId={workspace.id} />
            </div>

            {/* Linked Worktrees */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Linked Worktrees</p>
              <Input
                value={linkedSearch}
                onChange={(event) => setLinkedSearch(event.target.value)}
                placeholder="Search repos/worktrees..."
                className="mb-2"
              />
              <div className="flex gap-2 mb-2">
                <Select value={selectedLinkedWorktreeId} onValueChange={setSelectedLinkedWorktreeId}>
                  <SelectTrigger compact className="flex-1 min-w-0">
                    <SelectValue placeholder="Select worktree to attach" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedAttachOptions.length === 0 && (
                      <SelectItem value="" disabled>No worktrees available</SelectItem>
                    )}
                    {groupedAttachOptions.map((group) => (
                      <SelectGroup key={group.repoId}>
                        <SelectLabel>{group.repoName}</SelectLabel>
                        {group.worktrees.map((wt) => (
                          <SelectItem key={wt.id} value={wt.id}>
                            {wt.branch ?? 'detached'} · {wt.path}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => selectedLinkedWorktreeId && onAttachLinkedWorktree?.(selectedLinkedWorktreeId)}
                >
                  Attach
                </Button>
              </div>
              {linkedWorktrees.length === 0 ? (
                <p className="text-xs text-forge-muted leading-relaxed">No linked worktrees. Attach a worktree from another repo for supporting context.</p>
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
                        <button onClick={() => onOpenLinkedWorktreeInCursor?.(linked.path)} className="text-xs text-forge-blue hover:underline">Open in Cursor</button>
                        <button onClick={() => onDetachLinkedWorktree?.(linked.worktreeId)} className="text-xs text-forge-red hover:underline">Detach</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lineage */}
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Lineage</p>
                <Button variant="secondary" size="xs" onClick={onCreateChildWorkspace}>
                  <Plus className="w-3 h-3" /> Branch From Here
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-forge-muted">Parent: <span className="font-mono text-forge-text">{workspace.parentWorkspaceId ?? 'none'}</span></p>
                <p className="text-xs text-forge-muted">Source: <span className="font-mono text-forge-text">{workspace.sourceWorkspaceId ?? 'self'}</span></p>
                <p className="text-xs text-forge-muted">Derived: <span className="font-mono text-forge-text">{workspace.derivedFromBranch ?? workspace.branch}</span></p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer — always visible */}
      <div className="px-4 py-3 shrink-0 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenInCursor}
          className="w-full text-forge-blue hover:bg-forge-blue/15 border border-forge-blue/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Cursor
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={onArchiveWorkspace}
            className="flex-1"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onDeleteWorkspace}
            className="flex-1 text-forge-red/70 hover:text-forge-red hover:bg-forge-red/10"
          >
            Delete
          </Button>
        </div>
      </div>
    </aside>
  );
}
