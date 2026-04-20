import { Search, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewItem, Workspace } from '../../types';
import { PendingReviews } from '../reviews/PendingReviews';
import { WorkspaceCard } from './WorkspaceCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';

interface WorkspacesViewProps {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewWorkspace: () => void;
  pendingReviews: ReviewItem[];
  showPendingReviews?: boolean;
}

export function WorkspacesView({
  workspaces,
  selectedId,
  onSelect,
  onNewWorkspace,
  pendingReviews,
  showPendingReviews = true,
}: WorkspacesViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('Recent');
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const query = search.trim();
  const searchLower = query.toLowerCase();
  const isNarrowed = query !== '' || filter !== 'All' || sort !== 'Recent';
  const resetView = useCallback(() => {
    setSearch('');
    setFilter('All');
    setSort('Recent');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && isNarrowed) {
        resetView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isNarrowed, resetView]);

  const filtered = useMemo(() => workspaces.filter((w) => {
    const matchSearch =
      searchLower === '' ||
      w.name.toLowerCase().includes(searchLower) ||
      w.repo.toLowerCase().includes(searchLower) ||
      w.branch.toLowerCase().includes(searchLower) ||
      w.currentTask.toLowerCase().includes(searchLower);
    const matchFilter =
      filter === 'All' ||
      w.status === filter ||
      (filter === 'Active' && (w.status === 'Running' || w.status === 'Waiting')) ||
      (filter === 'Needs action' && workspaceNeedsAction(w)) ||
      (filter === 'Review' && (w.status === 'Review Ready' || w.changedFiles.length > 0)) ||
      (filter === 'PRs' && Boolean(w.prStatus && w.prStatus !== 'Merged' && w.prStatus !== 'Closed'));
    return matchSearch && matchFilter;
  }), [filter, searchLower, workspaces]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sort === 'Repo') return `${a.repo}/${a.branch}`.localeCompare(`${b.repo}/${b.branch}`);
    if (sort === 'Agent') return a.agent.localeCompare(b.agent) || a.name.localeCompare(b.name);
    if (sort === 'Status') return statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name);
    return recentRank(a.lastUpdated) - recentRank(b.lastUpdated);
  }), [filtered, sort]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping || sorted.length === 0) return;
      const direction = event.key === 'j' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'k' || event.key === 'ArrowUp'
        ? -1
        : 0;
      if (direction === 0) return;
      event.preventDefault();
      const currentIndex = sorted.findIndex((workspace) => workspace.id === selectedId);
      const startIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
      const nextIndex = (startIndex + direction + sorted.length) % sorted.length;
      onSelect(sorted[nextIndex].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSelect, selectedId, sorted]);

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current[selectedId]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedId]);

  const statusCounts = useMemo(() => workspaces.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {}), [workspaces]);
  const attentionSummary = useMemo(() => deriveAttentionSummary(workspaces), [workspaces]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-forge-text tracking-tight leading-none">Workspaces</h1>
            <p className="text-sm text-forge-muted mt-1.5">Parallel AI coding workspaces tied to repos, branches, and worktrees</p>
          </div>
          <Button onClick={onNewWorkspace} size="sm">
            <Plus className="w-4 h-4" />
            New Workspace
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-forge-muted" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces… /"
              className="pl-8 bg-forge-card"
            />
          </div>

          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger compact className="w-auto min-w-[110px] bg-forge-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Needs action">Needs action</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="PRs">PRs</SelectItem>
              <SelectItem value="Running">Running</SelectItem>
              <SelectItem value="Review Ready">Review Ready</SelectItem>
              <SelectItem value="Blocked">Blocked</SelectItem>
              <SelectItem value="Merged">Merged</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger compact className="w-auto min-w-[100px] bg-forge-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Recent">Recent</SelectItem>
              <SelectItem value="Status">Status</SelectItem>
              <SelectItem value="Repo">Repo</SelectItem>
              <SelectItem value="Agent">Agent</SelectItem>
            </SelectContent>
          </Select>

          {isNarrowed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetView}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-sm text-forge-muted">
            Showing <span className="font-medium text-forge-text">{sorted.length}</span> of <span className="font-medium text-forge-text">{workspaces.length}</span>
          </span>
          <span className="text-forge-muted text-sm">·</span>
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className="text-sm text-forge-muted">
              <span className="text-forge-text font-medium">{count}</span> {status}
            </span>
          ))}
          <span className="hidden text-forge-muted text-sm lg:inline">·</span>
          <span className="hidden items-center gap-1 text-xs text-forge-muted lg:flex">
            <ShortcutKey>/</ShortcutKey> search
            <ShortcutKey>j</ShortcutKey>/<ShortcutKey>k</ShortcutKey> move
            <ShortcutKey>Esc</ShortcutKey> reset
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <AttentionCard
            label="Needs action"
            value={attentionSummary.needsAction}
            hint="waiting, blocked, or unread"
            tone={attentionSummary.needsAction > 0 ? 'yellow' : 'muted'}
            active={filter === 'Needs action'}
            onClick={() => setFilter('Needs action')}
          />
          <AttentionCard
            label="Running"
            value={attentionSummary.running}
            hint="agents in motion"
            tone={attentionSummary.running > 0 ? 'green' : 'muted'}
            active={filter === 'Running'}
            onClick={() => setFilter('Running')}
          />
          <AttentionCard
            label="Review"
            value={attentionSummary.review}
            hint="changed or review-ready"
            tone={attentionSummary.review > 0 ? 'blue' : 'muted'}
            active={filter === 'Review'}
            onClick={() => setFilter('Review')}
          />
          <AttentionCard
            label="PRs"
            value={attentionSummary.prs}
            hint="open/draft PRs"
            tone={attentionSummary.prs > 0 ? 'blue' : 'muted'}
            active={filter === 'PRs'}
            onClick={() => setFilter('PRs')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {sorted.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-forge-border bg-forge-card/60 text-center">
            <p className="text-forge-muted text-sm">No workspaces match your filter</p>
            <p className="text-forge-muted text-sm mt-1">Try adjusting your search or filter</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={resetView}
            >
              Reset view
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {sorted.map((ws) => (
              <div
                key={ws.id}
                ref={(node) => {
                  cardRefs.current[ws.id] = node;
                }}
              >
                <WorkspaceCard
                  workspace={ws}
                  isSelected={selectedId === ws.id}
                  onSelect={() => onSelect(ws.id)}
                />
              </div>
            ))}
          </div>
        )}

        {showPendingReviews && <PendingReviews reviews={pendingReviews} onOpenWorkspace={onSelect} />}
      </div>
    </div>
  );
}

function statusRank(status: string): number {
  switch (status) {
    case 'Blocked':
      return 0;
    case 'Waiting':
      return 1;
    case 'Running':
      return 2;
    case 'Review Ready':
      return 3;
    case 'Merged':
      return 5;
    default:
      return 4;
  }
}

function recentRank(value: string): number {
  const lower = value.toLowerCase();
  if (lower.includes('just') || lower.includes('now')) return 0;
  const match = lower.match(/(\d+)/);
  const amount = match ? Number(match[1]) : 9999;
  if (lower.includes('min')) return amount;
  if (lower.includes('hour')) return amount * 60;
  if (lower.includes('day')) return amount * 60 * 24;
  return amount;
}

function deriveAttentionSummary(workspaces: Workspace[]) {
  return workspaces.reduce(
    (summary, workspace) => {
      if (workspaceNeedsAction(workspace)) {
        summary.needsAction += 1;
      }
      if (workspace.status === 'Running') summary.running += 1;
      if (workspace.status === 'Review Ready' || workspace.changedFiles.length > 0) summary.review += 1;
      if (workspace.prStatus && workspace.prStatus !== 'Merged' && workspace.prStatus !== 'Closed') summary.prs += 1;
      return summary;
    },
    { needsAction: 0, running: 0, review: 0, prs: 0 },
  );
}

function workspaceNeedsAction(workspace: Workspace): boolean {
  const cockpit = deriveWorkspaceCockpit(workspace);
  return (
    workspace.status === 'Waiting'
    || workspace.status === 'Blocked'
    || cockpit.nextAction === 'Respond to agent'
    || cockpit.nextAction === 'Inspect blocker'
  );
}

function AttentionCard({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone: 'green' | 'blue' | 'yellow' | 'muted';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    green: 'border-forge-green/20 bg-forge-green/10 text-forge-green',
    blue: 'border-forge-blue/20 bg-forge-blue/10 text-forge-blue',
    yellow: 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow',
    muted: 'border-forge-border bg-forge-card text-forge-muted',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left transition-colors hover:bg-white/10 ${toneClass} ${active ? 'ring-1 ring-forge-orange/40' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest opacity-80">{label}</span>
        <span className="text-lg font-bold leading-none">{value}</span>
      </div>
      <p className="mt-1 truncate text-xs opacity-75">{hint}</p>
    </button>
  );
}

function ShortcutKey({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-forge-border bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-forge-text/80">
      {children}
    </kbd>
  );
}
