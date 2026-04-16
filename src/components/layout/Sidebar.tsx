import { useMemo, useRef, useState, type ElementType } from 'react';
import {
  ClipboardCheck,
  Filter,
  GitBranch,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  ArrowUpDown,
  Trash2,
} from 'lucide-react';
import type { DiscoveredRepository, Workspace, WorkspaceAttention } from '../../types';

export type NavView = 'workspaces' | 'reviews' | 'settings';

interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  repositories: DiscoveredRepository[];
  workspaces: Workspace[];
  workspaceAttention: Record<string, WorkspaceAttention>;
  archivedWorkspaceIds: string[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onRemoveRepository: (repositoryId: string) => void;
  onNewWorkspace: (repositoryId?: string) => void;
}

const navItems: { id: NavView; label: string; icon: ElementType }[] = [
  { id: 'workspaces', label: 'Workspaces', icon: LayoutGrid },
  { id: 'reviews', label: 'Reviews', icon: ClipboardCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeView,
  onNavigate,
  repositories,
  workspaces,
  workspaceAttention,
  archivedWorkspaceIds,
  selectedWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onRemoveRepository,
  onNewWorkspace,
}: SidebarProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'status'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  /** Track which workspace row the mouse is hovering over so we can show the trash icon. */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredRepoId, setHoveredRepoId] = useState<string | null>(null);
  const repoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const archivedSet = useMemo(() => new Set(archivedWorkspaceIds), [archivedWorkspaceIds]);

  const workspacesByRepoId = useMemo(() => {
    const map = new Map<string, Workspace[]>();
    const q = searchQuery.trim().toLowerCase();
    const isVisible = (workspace: Workspace) => {
      const isArchived = archivedSet.has(workspace.id);
      if (filter === 'archived') return isArchived;
      if (filter === 'active') return !isArchived && workspace.status !== 'Merged';
      return true;
    };
    const matchesSearch = (workspace: Workspace) => {
      if (!q) return true;
      return (
        workspace.name.toLowerCase().includes(q)
        || (workspace.branch ?? '').toLowerCase().includes(q)
        || workspace.repo.toLowerCase().includes(q)
      );
    };

    for (const workspace of workspaces) {
      if (!isVisible(workspace)) continue;
      if (!matchesSearch(workspace)) continue;
      const repoId = workspace.repositoryId ?? `name:${workspace.repo}`;
      const bucket = map.get(repoId) ?? [];
      bucket.push(workspace);
      map.set(repoId, bucket);
    }
    return map;
  }, [archivedSet, filter, searchQuery, workspaces]);

  const repoGroups = useMemo(() => {
    const sorter = (left: Workspace, right: Workspace) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'status') return left.status.localeCompare(right.status);
      return 0;
    };
    const fromDiscovered = repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      workspaces: workspacesByRepoId.get(repo.id) ?? [],
    }));
    const known = new Set(fromDiscovered.map((row) => row.id));
    const fallbackRows = Array.from(workspacesByRepoId.entries())
      .filter(([id]) => !known.has(id))
      .map(([id, grouped]) => ({
        id,
        name: grouped[0]?.repo ?? id,
        workspaces: grouped,
      }));
    return [...fromDiscovered, ...fallbackRows]
      .map((group) => ({
        ...group,
        workspaces: [...group.workspaces].sort(sorter),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [repositories, sort, workspacesByRepoId]);

  return (
    <aside className="w-full shrink-0 flex flex-col h-full bg-forge-surface border-r border-forge-border">
      <div className="border-b border-forge-border px-4 py-5 sm:px-5">
        <div className="flex min-w-0 items-center">
          <img
            src="/brand/logo-word.png"
            alt="Forge"
            width={2048}
            height={1048}
            decoding="async"
            draggable={false}
            className="block h-[52px] w-auto max-w-full object-contain object-left"
          />
        </div>
      </div>

      <div className="px-3 py-3 border-b border-forge-border flex items-center gap-1.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                isActive ? 'bg-white/10 text-forge-text' : 'text-forge-muted hover:text-forge-text hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between px-2">
          <p className="text-[10px] font-semibold text-forge-muted uppercase tracking-widest">Workspaces</p>
          <button
            onClick={() => onNewWorkspace()}
            className="inline-flex items-center gap-1 text-[10px] text-forge-orange hover:text-forge-text"
          >
            <Plus className="w-3 h-3" />
            New Branch Workspace
          </button>
        </div>

        <div className="mt-2 px-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-forge-muted pointer-events-none" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as 'all' | 'active' | 'archived')}
              className="w-full appearance-none bg-forge-card border border-forge-border rounded-md pl-6 pr-2 py-1 text-[10px] text-forge-text/90"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="relative flex-1">
            <ArrowUpDown className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-forge-muted pointer-events-none" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as 'recent' | 'name' | 'status')}
              className="w-full appearance-none bg-forge-card border border-forge-border rounded-md pl-6 pr-2 py-1 text-[10px] text-forge-text/90"
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="mt-2 px-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-forge-muted pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter workspaces…"
              className="w-full bg-forge-card border border-forge-border rounded-md pl-7 pr-3 py-1 text-[10px] text-forge-text/90 placeholder:text-forge-muted/70 focus:outline-none focus:border-forge-orange/40"
            />
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {repositories.length === 0 && workspaces.length === 0 && (
            <div className="rounded-md border border-dashed border-forge-border px-3 py-2 text-[10px] text-forge-muted leading-relaxed">
              No repositories discovered yet. Add repo roots and run <span className="font-semibold">Settings → Scan</span>, then create a branch workspace.
            </div>
          )}
          {repoGroups.map((repo) => (
            <div key={repo.id}>
              <div
                className="flex items-center gap-2 px-2 mb-1.5"
                onMouseEnter={() => {
                  if (repoHoverTimeoutRef.current) clearTimeout(repoHoverTimeoutRef.current);
                  setHoveredRepoId(repo.id);
                }}
                onMouseLeave={() => {
                  repoHoverTimeoutRef.current = setTimeout(() => setHoveredRepoId(null), 150);
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-forge-text/88 truncate">{repo.name}</p>
                <span className="text-[10px] text-forge-muted">({repo.workspaces.length})</span>
                {hoveredRepoId === repo.id && !repo.id.startsWith('name:') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRepository(repo.id);
                    }}
                    className="p-1 rounded hover:bg-forge-red/15 text-forge-muted hover:text-forge-red"
                    title={`Remove repository "${repo.name}" from Forge`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => onNewWorkspace(repo.id.startsWith('name:') ? undefined : repo.id)}
                  className="ml-auto p-1 rounded hover:bg-white/6 text-forge-muted hover:text-forge-orange"
                  title="New branch workspace in repository"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1">
                {repo.workspaces.length === 0 ? (
                  <p className="px-2 py-1 text-[10px] text-forge-muted leading-relaxed">No workspaces in this repo yet. Use + to create one.</p>
                ) : (
                  repo.workspaces.map((workspace) => {
                    const isSelected = workspace.id === selectedWorkspaceId;
                    const isHovered = hoveredId === workspace.id;
                    const isArchived = archivedSet.has(workspace.id);
                    const attention = workspaceAttention[workspace.id];
                    const statusTone =
                      attention?.status === 'running' || workspace.status === 'Running'
                        ? 'bg-forge-green/20 text-forge-green/95'
                        : attention?.status === 'error' || workspace.status === 'Blocked'
                        ? 'bg-forge-red/20 text-forge-red/95'
                        : attention?.status === 'complete' || workspace.status === 'Review Ready'
                        ? 'bg-forge-blue/20 text-forge-blue/95'
                        : attention?.status === 'waiting'
                        ? 'bg-forge-yellow/20 text-forge-yellow/95'
                        : 'bg-white/10 text-forge-text/88';
                    const attentionDot =
                      attention?.status === 'running'
                        ? 'bg-forge-green'
                        : attention?.status === 'error'
                        ? 'bg-forge-red'
                        : attention?.status === 'complete'
                        ? 'bg-forge-blue'
                        : attention?.status === 'waiting'
                        ? 'bg-forge-yellow'
                        : 'bg-forge-dim';
                    return (
                      <div
                        key={workspace.id}
                        className="relative group"
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                          setHoveredId(workspace.id);
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => setHoveredId(null), 150);
                        }}
                      >
                        <button
                          onClick={() => {
                            onNavigate('workspaces');
                            onSelectWorkspace(workspace.id);
                          }}
                          className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-forge-orange/12 border border-forge-orange/30'
                              : 'border border-transparent hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="relative mt-0.5">
                              <GitBranch className={`w-3.5 h-3.5 ${isSelected ? 'text-forge-orange' : 'text-forge-muted'}`} />
                              <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-forge-surface ${attentionDot}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className={`truncate text-[12px] font-semibold ${isSelected ? 'text-forge-text' : 'text-forge-text/90'}`}>
                                  {workspace.name}
                                </p>
                                {!!attention?.unreadCount && (
                                  <span className="shrink-0 rounded-full bg-forge-orange px-1.5 py-0.5 text-[9px] font-bold text-white">
                                    {attention.unreadCount > 99 ? '99+' : attention.unreadCount}
                                  </span>
                                )}
                                {!!attention?.queuedCount && (
                                  <span className="shrink-0 rounded-full border border-forge-yellow/30 bg-forge-yellow/15 px-1.5 py-0.5 text-[9px] font-semibold text-forge-yellow" title="Queued messages">
                                    {attention.queuedCount} queued
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate text-[10px] font-mono text-forge-text/85">{workspace.branch || '(no branch)'}</span>
                                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full ${statusTone}`}>
                                  {attention?.status ?? workspace.status}
                                </span>
                                {isArchived && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-forge-text/85">Archived</span>}
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Delete button — shown on hover */}
                        {isHovered && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteWorkspace(workspace.id);
                            }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                            title={`Delete workspace "${workspace.name}"`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
