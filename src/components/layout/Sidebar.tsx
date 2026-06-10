import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderPlus,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  CheckSquare,
  Square as SquareIcon,
  Send,
  X as XIcon,
  Brain,
  Network,
} from 'lucide-react';
import type { DiscoveredRepository, Workspace, WorkspaceAttention } from '../../types';
import type { RepositoryRelationship } from '../../types/repository-relationship';
import type { OrchestratorStatus } from '../../types/orchestrator';
import { batchDispatchWorkspaceAgentPrompt } from '../../lib/tauri-api/terminal';
import { getOrchestratorStatus, setOrchestratorEnabled } from '../../lib/tauri-api/orchestrator';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui/select';
import { Tooltip } from '../ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { WorkspaceListItem } from '../workspaces/WorkspaceListItem';
import { deriveCompanionWarnings } from '../../lib/federation';

export type NavView = 'workspaces' | 'files' | 'reviews' | 'federation' | 'settings' | 'memory';

type WorkspaceFilter = 'all' | 'active' | 'archived';

const WORKSPACE_FILTER_KEY = 'mn:workspace-sidebar-filter';

function readWorkspaceFilter(): WorkspaceFilter {
  const raw = window.localStorage.getItem(WORKSPACE_FILTER_KEY);
  return raw === 'all' || raw === 'active' || raw === 'archived' ? raw : 'active';
}

interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  repositories: DiscoveredRepository[];
  workspaces: Workspace[];
  workspaceAttention: Record<string, WorkspaceAttention>;
  conflictingWorkspaceIds: Set<string>;
  archivedWorkspaceIds: string[];
  repositoryRelationships?: RepositoryRelationship[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onArchiveWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceInCursor?: (workspaceId: string) => void;
  onRunWorkspaceSetup?: (workspaceId: string) => Promise<void> | void;
  onRefreshWorkspaceThreads?: (workspaceId: string) => Promise<void> | void;
  onCreateWorkspacePr?: (workspaceId: string) => void;
  onRemoveRepository: (repositoryId: string) => void;
  onNewWorkspace: (repositoryId?: string) => void;
  onAddRepository?: () => void;
  onCollapse?: () => void;
  onFilteredWorkspacesChange?: (workspaces: Workspace[]) => void;
}

const primaryNav: { id: NavView; label: string; icon: ElementType }[] = [
  { id: 'workspaces', label: 'Workspaces', icon: LayoutGrid },
  { id: 'reviews', label: 'Reviews', icon: ClipboardCheck },
  { id: 'federation', label: 'Federation', icon: Network },
];
const secondaryNav: { id: NavView; label: string; icon: ElementType }[] = [
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeView,
  onNavigate,
  repositories,
  workspaces,
  workspaceAttention,
  conflictingWorkspaceIds,
  archivedWorkspaceIds,
  repositoryRelationships = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  onArchiveWorkspace,
  onOpenWorkspaceInCursor,
  onRunWorkspaceSetup,
  onRefreshWorkspaceThreads,
  onCreateWorkspacePr,
  onRemoveRepository,
  onNewWorkspace,
  onAddRepository,
  onCollapse,
  onFilteredWorkspacesChange,
}: SidebarProps) {
  const [filter, setFilter] = useState<WorkspaceFilter>(readWorkspaceFilter);
  const [sort, setSort] = useState<'recent' | 'name' | 'status'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  /** Track which workspace row the mouse is hovering over so we can show quick lifecycle actions. */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredRepoId, setHoveredRepoId] = useState<string | null>(null);
  const repoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Track which repository groups are collapsed. */
  const [collapsedRepoIds, setCollapsedRepoIds] = useState<Set<string>>(new Set());
  /** Batch multi-select state */
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchSending, setBatchSending] = useState(false);
  const batchMode = batchSelected.size > 0;
  const [orchestrator, setOrchestrator] = useState<OrchestratorStatus | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<{
    x: number;
    y: number;
    workspace: Workspace;
  } | null>(null);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_FILTER_KEY, filter);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    getOrchestratorStatus()
      .then((s) => { if (!cancelled) setOrchestrator(s); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceContextMenu) return;
    const close = () => setWorkspaceContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [workspaceContextMenu]);

  const handleOrchestratorToggle = async (enabled: boolean) => {
    setOrchestrator((prev) => prev ? { ...prev, enabled } : prev);
    await setOrchestratorEnabled(enabled);
  };

  const toggleRepoCollapse = (repoId: string) => {
    setCollapsedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId); else next.add(repoId);
      return next;
    });
  };

  const toggleBatchSelect = (id: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearBatch = () => {
    setBatchSelected(new Set());
    setBatchPrompt('');
  };

  const sendBatch = async () => {
    if (!batchPrompt.trim() || batchSelected.size === 0) return;
    setBatchSending(true);
    try {
      await batchDispatchWorkspaceAgentPrompt({
        workspaceIds: Array.from(batchSelected),
        prompt: batchPrompt.trim(),
      });
      clearBatch();
    } catch {
      // errors are non-fatal; individual workspace failures are logged server-side
    } finally {
      setBatchSending(false);
    }
  };

  const archivedSet = useMemo(() => new Set(archivedWorkspaceIds), [archivedWorkspaceIds]);
  const workspaceChangeTotals = useMemo(() => Object.fromEntries(
    workspaces.map((workspace) => [workspace.id, {
      additions: workspace.changedFiles.reduce((sum, file) => sum + file.additions, 0),
      deletions: workspace.changedFiles.reduce((sum, file) => sum + file.deletions, 0),
    }]),
  ), [workspaces]);

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
        || (workspace.currentTask ?? '').toLowerCase().includes(q)
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
      const leftTs = Date.parse(left.lastUpdated ?? '') || 0;
      const rightTs = Date.parse(right.lastUpdated ?? '') || 0;
      if (rightTs !== leftTs) return rightTs - leftTs;
      const leftIdTs = Number((left.id.match(/(\d+)$/)?.[1]) ?? 0);
      const rightIdTs = Number((right.id.match(/(\d+)$/)?.[1]) ?? 0);
      return rightIdTs - leftIdTs;
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

  const federatedGroups = useMemo(() => {
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const visibleIds = new Set(repoGroups.flatMap((group) => group.workspaces.map((workspace) => workspace.id)));
    const groups = new Map<string, Workspace[]>();
    for (const workspace of workspaces) {
      const parentId = workspace.parentWorkspaceId ?? null;
      if (!parentId) continue;
      const parent = workspaceById.get(parentId);
      if (!parent) continue;
      const members = groups.get(parentId) ?? [parent];
      if (!members.some((member) => member.id === workspace.id)) {
        members.push(workspace);
      }
      groups.set(parentId, members);
    }
    return Array.from(groups.entries())
      .map(([parentId, members]) => ({
        parentId,
        parent: workspaceById.get(parentId),
        members: members.filter((member) => visibleIds.has(member.id)),
        totalMembers: members.length,
        warnings: deriveCompanionWarnings({ parentId, parent: workspaceById.get(parentId)!, members }, repositoryRelationships, repositories),
      }))
      .filter((group) => group.parent && group.members.length > 1)
      .slice(0, 3);
  }, [repoGroups, workspaces, repositoryRelationships, repositories]);

  useEffect(() => {
    if (!onFilteredWorkspacesChange) return;
    const flat = repoGroups.flatMap((group) => group.workspaces);
    onFilteredWorkspacesChange(flat);
  }, [repoGroups, onFilteredWorkspacesChange]);

  const totalSpend = useMemo(() => {
    let cents = 0;
    for (const ws of workspaces) {
      const cost = ws.agentSession?.estimatedCost;
      if (!cost) continue;
      const match = cost.match(/\$([0-9]+\.[0-9]+)/);
      if (match) cents += Math.round(parseFloat(match[1]) * 100);
    }
    return cents > 0 ? `$${(cents / 100).toFixed(2)}` : null;
  }, [workspaces]);
  const renderNavBtn = ({ id, label, icon: Icon }: { id: NavView; label: string; icon: ElementType }) => {
    const isActive = activeView === id;
    return (
      <Tooltip key={id} content={label} side="right">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onNavigate(id)}
          className={isActive ? 'bg-mn-surface-overlay-high text-mn-text' : 'text-mn-muted/60 hover:text-mn-text hover:bg-mn-surface-overlay'}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </Tooltip>
    );
  };

  return (
    <aside className="w-full shrink-0 flex flex-col h-full bg-mn-surface">
      {/* Top: primary nav + collapse */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-mn-border/40">
        <div className="flex items-center gap-0.5">
          {primaryNav.map(renderNavBtn)}
        </div>
        <div className="flex items-center gap-1">
          {totalSpend && (
            <span className="text-ui-caption font-mono text-mn-muted/50 shrink-0" title="Total estimated agent spend">
              {totalSpend}
            </span>
          )}
          {onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onCollapse}
              className="shrink-0 text-mn-muted/50 hover:text-mn-text hover:bg-mn-surface-overlay"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <>
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-semibold text-mn-muted uppercase tracking-widest">Workspaces</p>
          <div className="flex items-center gap-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-mn-muted/60 hover:text-mn-text hover:bg-mn-surface-overlay"
                  title="Filter and sort"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-mn-muted">Filter</span>
                  <Select value={filter} onValueChange={(v) => setFilter(v as WorkspaceFilter)}>
                    <SelectTrigger className="w-28 px-2 py-1 text-xs bg-mn-card border-mn-border rounded-md h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-mn-muted">Sort by</span>
                  <Select value={sort} onValueChange={(v) => setSort(v as 'recent' | 'name' | 'status')}>
                    <SelectTrigger className="w-28 px-2 py-1 text-xs bg-mn-card border-mn-border rounded-md h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recent</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            {onAddRepository && (
              <Tooltip content="Add Repository" side="bottom">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onAddRepository}
                  className="text-mn-muted/60 hover:text-mn-text hover:bg-mn-surface-overlay"
                >
                  <FolderPlus className="w-3 h-3" />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="mt-2 px-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-mn-muted pointer-events-none z-10" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter workspaces… ⌘K"
              className="pl-7 pr-3 py-1 text-xs h-auto bg-mn-card border-mn-border placeholder:text-mn-muted/50"
            />
          </div>
        </div>

        {federatedGroups.length > 0 && (
          <div className="mt-3 space-y-1.5 px-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mn-muted/60">Federated tasks</p>
            {federatedGroups.map((group) => {
              const running = group.members.filter((workspace) => workspace.status === 'Running').length;
              const review = group.members.filter((workspace) => workspace.status === 'Review Ready').length;
              const blocked = group.members.filter((workspace) => workspace.status === 'Blocked').length;
              const warnings = group.warnings.length;
              return (
                <button
                  key={group.parentId}
                  type="button"
                  onClick={() => {
                    if (group.parent) {
                      onNavigate('workspaces');
                      onSelectWorkspace(group.parent.id);
                    }
                  }}
                  className="w-full rounded-lg border border-mn-border/60 bg-mn-card/60 px-2 py-1.5 text-left hover:border-mn-orange/30 hover:bg-mn-orange/5"
                >
                  <div className="flex items-center gap-1.5">
                    <Network className="h-3 w-3 shrink-0 text-mn-orange" />
                    <span className="truncate text-[11px] font-semibold text-mn-text">{group.parent?.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-mn-muted">{group.totalMembers} repos</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-mn-muted">
                    {running > 0 && <span>{running} running</span>}
                    {review > 0 && <span>{review} review</span>}
                    {blocked > 0 && <span className="text-mn-red">{blocked} blocked</span>}
                    {warnings > 0 && <span className="text-mn-yellow">{warnings} warning{warnings === 1 ? '' : 's'}</span>}
                    {running === 0 && review === 0 && blocked === 0 && warnings === 0 && <span>{group.members.length} waiting/active</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 space-y-4">
          {repositories.length === 0 && workspaces.length === 0 && (
            <div className="rounded-xl bg-mn-orange/5 border border-dashed border-mn-orange/20 px-4 py-5 text-center">
              <FolderPlus className="mx-auto mb-2 h-6 w-6 text-mn-orange opacity-60" />
              <p className="text-ui-label font-bold text-mn-text">No repositories</p>
              <p className="mt-1 text-ui-caption text-mn-muted leading-relaxed">
                Add repo roots and scan in <span className="text-mn-text font-semibold">Settings</span> to start creating workspaces.
              </p>
              <Button 
                variant="outline" 
                size="xs" 
                className="mt-3 w-full border-mn-orange/30 text-mn-orange hover:bg-mn-orange/10"
                onClick={onAddRepository}
              >
                Add Root Path
              </Button>
            </div>
          )}
          {repoGroups.map((repo) => {
            const isCollapsed = collapsedRepoIds.has(repo.id);
            return (
              <div key={repo.id}>
                <div
                  className="group flex items-center gap-1.5 px-2 mb-1.5 cursor-pointer"
                  onClick={() => toggleRepoCollapse(repo.id)}
                  onMouseEnter={() => {
                    if (repoHoverTimeoutRef.current) clearTimeout(repoHoverTimeoutRef.current);
                    setHoveredRepoId(repo.id);
                  }}
                  onMouseLeave={() => {
                    repoHoverTimeoutRef.current = setTimeout(() => setHoveredRepoId(null), 150);
                  }}
                >
                  <div className="shrink-0 text-mn-muted/40 group-hover:text-mn-muted/70 transition-colors">
                    {isCollapsed ? <ChevronRight className="w-3 h-3" strokeWidth={2.5} /> : <ChevronDown className="w-3 h-3" strokeWidth={2.5} />}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-mn-muted/50 truncate group-hover:text-mn-muted/80 transition-colors">
                    {repo.name}
                  </p>
                  <span className="text-ui-caption text-mn-muted/35">({repo.workspaces.length})</span>
                  {hoveredRepoId === repo.id && !repo.id.startsWith('name:') && (
                    <Tooltip content="Remove Repository" side="top">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveRepository(repo.id);
                        }}
                        className="text-mn-muted hover:bg-mn-red/15 hover:text-mn-red"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip content="New Workspace" side="top">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        const id = repo.id.startsWith('name:')
                          ? repo.workspaces.find((w) => w.repositoryId)?.repositoryId
                          : repo.id;
                        onNewWorkspace(id);
                      }}
                      className="ml-auto text-mn-muted hover:bg-mn-surface-overlay hover:text-mn-orange"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </Tooltip>                </div>

                {!isCollapsed && (
                  <div className="space-y-1">
                    {repo.workspaces.map((workspace) => {
                        const isSelected = workspace.id === selectedWorkspaceId;
                        const isHovered = hoveredId === workspace.id;
                        const attention = workspaceAttention[workspace.id];
                        const hasConflict = conflictingWorkspaceIds.has(workspace.id);
                        const isArchived = archivedSet.has(workspace.id);
                        const totals = workspaceChangeTotals[workspace.id] ?? { additions: 0, deletions: 0 };

                        return (
                          <WorkspaceListItem
                            key={workspace.id}
                            workspace={workspace}
                            isSelected={isSelected}
                            isHovered={isHovered}
                            showRepo={false}
                            totalAdds={totals.additions}
                            totalDels={totals.deletions}
                            onMouseEnter={() => {
                              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                              setHoveredId(workspace.id);
                            }}
                            onMouseLeave={() => {
                              hoverTimeoutRef.current = setTimeout(() => setHoveredId(null), 150);
                            }}
                            onClick={() => {
                              onNavigate('workspaces');
                              onSelectWorkspace(workspace.id);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setWorkspaceContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                workspace,
                              });
                            }}
                            prefix={
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBatchSelect(workspace.id); }}
                                className={`mt-0.5 shrink-0 transition-opacity ${batchMode || isHovered ? 'opacity-100' : 'opacity-0'}`}
                                title="Select for batch send"
                              >
                                {batchSelected.has(workspace.id)
                                  ? <CheckSquare className="w-3.5 h-3.5 text-mn-cyan" />
                                  : <SquareIcon className="w-3.5 h-3.5 text-mn-muted" />}
                              </button>
                            }
                            suffix={
                              (attention?.unreadCount || hasConflict) ? (
                                <div className="flex items-center gap-1">
                                  {!!attention?.unreadCount && (
                                    <span className="shrink-0 rounded-full bg-mn-orange px-1.5 py-0.5 text-[10px] font-bold text-white shadow-amber-glow">
                                      {attention.unreadCount > 99 ? '99+' : attention.unreadCount}
                                    </span>
                                  )}
                                  {hasConflict && (
                                    <span className="shrink-0 rounded-full border border-mn-red/30 bg-mn-red/15 px-1.5 py-0.5 text-[10px] font-bold text-mn-red">
                                      conflict
                                    </span>
                                  )}
                                </div>
                              ) : null
                            }
                            actions={
                              <Tooltip content={isArchived ? 'Restore Workspace' : 'Archive Workspace'} side="left">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onArchiveWorkspace(workspace.id);
                                  }}
                                  className="text-mn-muted hover:bg-mn-cyan/15 hover:text-mn-cyan"
                                >
                                  {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                </Button>
                              </Tooltip>
                            }
                          />
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      </div>
      {workspaceContextMenu && (
        <div
          className="fixed z-50 min-w-[220px] rounded-panel border border-mn-border bg-mn-surface p-1 shadow-mn-panel"
          style={{ left: workspaceContextMenu.x, top: workspaceContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {onOpenWorkspaceInCursor && (
            <SidebarContextAction onClick={() => {
              onSelectWorkspace(workspaceContextMenu.workspace.id);
              onNavigate('workspaces');
              setWorkspaceContextMenu(null);
              onOpenWorkspaceInCursor(workspaceContextMenu.workspace.id);
            }}
            >
              Open in Cursor
            </SidebarContextAction>
          )}
          {onRunWorkspaceSetup && (
            <SidebarContextAction onClick={() => {
              onSelectWorkspace(workspaceContextMenu.workspace.id);
              onNavigate('workspaces');
              setWorkspaceContextMenu(null);
              void onRunWorkspaceSetup(workspaceContextMenu.workspace.id);
            }}
            >
              Run setup checks
            </SidebarContextAction>
          )}
          {onRefreshWorkspaceThreads && (
            <SidebarContextAction onClick={() => {
              onSelectWorkspace(workspaceContextMenu.workspace.id);
              onNavigate('workspaces');
              setWorkspaceContextMenu(null);
              void onRefreshWorkspaceThreads(workspaceContextMenu.workspace.id);
            }}
            >
              Refresh PR threads
            </SidebarContextAction>
          )}
          {onCreateWorkspacePr && (
            <SidebarContextAction onClick={() => {
              onSelectWorkspace(workspaceContextMenu.workspace.id);
              setWorkspaceContextMenu(null);
              onCreateWorkspacePr(workspaceContextMenu.workspace.id);
            }}
            >
              Mark PR created
            </SidebarContextAction>
          )}
          <SidebarContextAction onClick={() => {
            const id = workspaceContextMenu.workspace.id;
            setWorkspaceContextMenu(null);
            onArchiveWorkspace(id);
          }}
          >
            {archivedSet.has(workspaceContextMenu.workspace.id) ? 'Restore workspace' : 'Archive workspace'}
          </SidebarContextAction>
        </div>
      )}

      {/* Orchestrator panel */}
      {orchestrator !== null && (
        <div className="shrink-0 border-t border-mn-border/60 bg-mn-surface/80 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Brain className={`h-3.5 w-3.5 ${orchestrator.enabled ? 'text-mn-orange animate-pulse' : 'text-mn-muted'}`} />
              <span className="text-sm font-semibold text-mn-text" title="Background automation: monitors agents every 5 min and can trigger follow-up checks. Model is configured in Settings.">Orchestrator</span>
              {orchestrator.enabled && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-mn-orange/15 text-mn-orange border border-mn-orange/20">
                  Opus
                </span>
              )}
            </div>
            <button
              onClick={() => void handleOrchestratorToggle(!orchestrator.enabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${orchestrator.enabled ? 'bg-mn-orange' : 'bg-mn-border'}`}
              title={orchestrator.enabled ? 'Disable orchestrator' : 'Enable orchestrator'}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${orchestrator.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
          {orchestrator.enabled && (
            <div className="space-y-1">
              <p className="text-xs text-mn-muted">
                Brain: <span className="text-mn-text font-mono">{orchestrator.model}</span> · change in Settings → AI Models
              </p>
              {orchestrator.lastRunAt && (
                <p className="text-xs text-mn-muted">
                  Last run: {orchestrator.lastRunAt} · {orchestrator.lastActions.length} action(s)
                </p>
              )}
              {orchestrator.lastActions.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {orchestrator.lastActions.slice(0, 3).map((a, i) => (
                    <p key={i} className="text-xs text-mn-muted truncate">
                      → {a.action} {a.workspaceId ?? ''}{a.prompt ? `: ${a.prompt.slice(0, 40)}…` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {batchMode && (
        <div className="shrink-0 border-t border-mn-border bg-mn-surface px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-mn-cyan">
              {batchSelected.size} workspace{batchSelected.size === 1 ? '' : 's'} selected
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearBatch}
              className="text-mn-muted hover:text-mn-text"
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={batchPrompt}
            onChange={(e) => setBatchPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendBatch(); }}
            placeholder="Send prompt to all selected agents…"
            rows={3}
            className="border-mn-border bg-black/30 px-2.5 py-2 text-sm placeholder:text-mn-muted/60 focus:border-mn-cyan/40"
          />
          <Button
            variant="default"
            onClick={() => void sendBatch()}
            disabled={batchSending || !batchPrompt.trim()}
            className="mt-2 w-full bg-mn-cyan/90 text-white hover:bg-mn-cyan"
          >
            <Send className="h-3 w-3" />
            {batchSending ? 'Sending…' : `Send to ${batchSelected.size}`}
          </Button>
        </div>
      )}

      {/* Bottom: secondary nav */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 border-t border-mn-border/40">
        {secondaryNav.map(renderNavBtn)}
      </div>
    </aside>
  );
}

function SidebarContextAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded-btn px-2.5 py-1.5 text-left text-xs text-mn-text hover:bg-mn-surface-overlay"
    >
      {children}
    </button>
  );
}
