import { Search, SlidersHorizontal, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import type { ReviewItem, Workspace } from '../../types';
import { PendingReviews } from '../reviews/PendingReviews';
import { WorkspaceCard } from './WorkspaceCard';

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

  const filtered = workspaces.filter((w) => {
    const matchSearch =
      search === '' ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.repo.toLowerCase().includes(search.toLowerCase()) ||
      w.branch.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'All' ||
      w.status === filter ||
      (filter === 'Active' && (w.status === 'Running' || w.status === 'Waiting'));
    return matchSearch && matchFilter;
  });

  const statusCounts = workspaces.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-forge-text tracking-tight leading-none">Workspaces</h1>
            <p className="text-sm text-forge-muted mt-1.5">Parallel AI coding workspaces tied to repos, branches, and worktrees</p>
          </div>
          <button
            onClick={onNewWorkspace}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-forge-orange hover:bg-orange-500 text-sm font-semibold text-white transition-colors shadow-lg shadow-orange-900/30"
          >
            <Plus className="w-4 h-4" />
            New Workspace
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-forge-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces..."
              className="w-full pl-8 pr-3 py-2 bg-forge-card border border-forge-border rounded-lg text-sm text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50 transition-colors"
            />
          </div>

          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 bg-forge-card border border-forge-border rounded-lg text-sm text-forge-text focus:outline-none focus:border-forge-blue/50 cursor-pointer transition-colors"
            >
              <option>All</option>
              <option>Active</option>
              <option>Running</option>
              <option>Review Ready</option>
              <option>Blocked</option>
              <option>Merged</option>
            </select>
            <SlidersHorizontal className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-forge-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 bg-forge-card border border-forge-border rounded-lg text-sm text-forge-text focus:outline-none focus:border-forge-blue/50 cursor-pointer transition-colors"
            >
              <option>Recent</option>
              <option>Status</option>
              <option>Repo</option>
              <option>Agent</option>
            </select>
            <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-forge-muted pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className="text-sm text-forge-muted">
              <span className="text-forge-text font-medium">{count}</span> {status}
            </span>
          ))}
          <span className="text-forge-muted text-sm">·</span>
          <span className="text-sm text-forge-muted">
            <span className="text-forge-text font-medium">{workspaces.length}</span> total
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-forge-muted text-sm">No workspaces match your filter</p>
            <p className="text-forge-muted text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                isSelected={selectedId === ws.id}
                onSelect={() => onSelect(ws.id)}
              />
            ))}
          </div>
        )}

        {showPendingReviews && <PendingReviews reviews={pendingReviews} />}
      </div>
    </div>
  );
}
