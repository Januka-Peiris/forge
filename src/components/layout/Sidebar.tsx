import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import {
  ChevronLeft,
  ClipboardCheck,
  Filter,
  GitBranch,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  ArrowUpDown,
  Trash2,
  CheckSquare,
  Square as SquareIcon,
  Send,
  X as XIcon,
  Brain,
} from 'lucide-react';
import type { DiscoveredRepository, Workspace, WorkspaceAttention } from '../../types';
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

export type NavView = 'workspaces' | 'reviews' | 'settings' | 'memory';

interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  repositories: DiscoveredRepository[];
  workspaces: Workspace[];
  workspaceAttention: Record<string, WorkspaceAttention>;
  conflictingWorkspaceIds: Set<string>;
  archivedWorkspaceIds: string[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onRemoveRepository: (repositoryId: string) => void;
  onNewWorkspace: (repositoryId?: string) => void;
  onCollapse?: () => void;
  onFilteredWorkspacesChange?: (workspaces: Workspace[]) => void;
}

const primaryNav: { id: NavView; label: string; icon: ElementType }[] = [
  { id: 'workspaces', label: 'Workspaces', icon: LayoutGrid },
  { id: 'reviews', label: 'Reviews', icon: ClipboardCheck },
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
  selectedWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onRemoveRepository,
  onNewWorkspace,
  onCollapse,
  onFilteredWorkspacesChange,
}: SidebarProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'status'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  /** Track which workspace row the mouse is hovering over so we can show the trash icon. */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredRepoId, setHoveredRepoId] = useState<string | null>(null);
  const repoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Batch multi-select state */
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchSending, setBatchSending] = useState(false);
  const batchMode = batchSelected.size > 0;
  const [orchestrator, setOrchestrator] = useState<OrchestratorStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrchestratorStatus()
      .then((s) => { if (!cancelled) setOrchestrator(s); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const handleOrchestratorToggle = async (enabled: boolean) => {
    setOrchestrator((prev) => prev ? { ...prev, enabled } : prev);
    await setOrchestratorEnabled(enabled);
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
      <Button
        key={id}
        variant="ghost"
        size="icon-sm"
        onClick={() => onNavigate(id)}
        title={label}
        className={isActive ? 'bg-white/10 text-forge-text' : 'text-forge-muted/60 hover:text-forge-text hover:bg-white/5'}
      >
        <Icon className="w-4 h-4" />
      </Button>
    );
  };

  return (
    <aside className="w-full shrink-0 flex flex-col h-full bg-forge-surface">
      {/* Top: primary nav + collapse */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-forge-border/40">
        <div className="flex items-center gap-0.5">
          {primaryNav.map(renderNavBtn)}
        </div>
        <div className="flex items-center gap-1">
          {totalSpend && (
            <span className="text-[10px] font-mono text-forge-muted/50 shrink-0" title="Total estimated agent spend">
              {totalSpend}
            </span>
          )}
          {onCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onCollapse}
              className="shrink-0 text-forge-muted/50 hover:text-forge-text hover:bg-white/5"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Workspaces</p>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onNewWorkspace()}
            className="text-forge-orange hover:text-forge-text"
            title="New branch workspace"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        <div className="mt-2 px-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-forge-muted pointer-events-none z-10" />
            <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'active' | 'archived')}>
              <SelectTrigger className="w-full pl-6 pr-2 py-1 text-xs bg-forge-card border-forge-border rounded-md h-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <ArrowUpDown className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-forge-muted pointer-events-none z-10" />
            <Select value={sort} onValueChange={(v) => setSort(v as 'recent' | 'name' | 'status')}>
              <SelectTrigger className="w-full pl-6 pr-2 py-1 text-xs bg-forge-card border-forge-border rounded-md h-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search input */}
        <div className="mt-2 px-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-forge-muted pointer-events-none z-10" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter workspaces… ⌘K"
              className="pl-7 pr-3 py-1 text-xs h-auto bg-forge-card border-forge-border placeholder:text-forge-muted/50"
            />
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {repositories.length === 0 && workspaces.length === 0 && (
            <div className="rounded-md border border-dashed border-forge-border px-3 py-2 text-xs text-forge-muted leading-relaxed">
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
                <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted/50 truncate">{repo.name}</p>
                <span className="text-[10px] text-forge-muted/35">({repo.workspaces.length})</span>
                {hoveredRepoId === repo.id && !repo.id.startsWith('name:') && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRepository(repo.id);
                    }}
                    className="text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                    title={`Remove repository "${repo.name}" from Forge`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onNewWorkspace(repo.id.startsWith('name:') ? undefined : repo.id)}
                  className="ml-auto text-forge-muted hover:bg-white/6 hover:text-forge-orange"
                  title="New branch workspace in repository"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              <div className="space-y-1">
                {repo.workspaces.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-forge-muted leading-relaxed">No workspaces in this repo yet. Use + to create one.</p>
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
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            onNavigate('workspaces');
                            onSelectWorkspace(workspace.id);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onNavigate('workspaces'); onSelectWorkspace(workspace.id); } }}
                          className={`w-full cursor-pointer rounded-md px-2.5 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-forge-orange/12 border border-forge-orange/30'
                              : 'border border-transparent hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleBatchSelect(workspace.id); }}
                              className={`mt-0.5 shrink-0 transition-opacity ${batchMode || isHovered ? 'opacity-100' : 'opacity-0'}`}
                              title="Select for batch send"
                            >
                              {batchSelected.has(workspace.id)
                                ? <CheckSquare className="w-3.5 h-3.5 text-forge-orange" />
                                : <SquareIcon className="w-3.5 h-3.5 text-forge-muted" />}
                            </button>
                            <div className="relative mt-0.5">
                              <GitBranch className={`w-3.5 h-3.5 ${isSelected ? 'text-forge-orange' : 'text-forge-muted'}`} />
                              <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-forge-surface ${attentionDot}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className={`truncate text-sm font-semibold ${isSelected ? 'text-forge-text' : 'text-forge-text/90'}`}>
                                  {workspace.name}
                                </p>
                                {!!attention?.unreadCount && (
                                  <span className="shrink-0 rounded-full bg-forge-orange px-1.5 py-0.5 text-xs font-bold text-white">
                                    {attention.unreadCount > 99 ? '99+' : attention.unreadCount}
                                  </span>
                                )}
                                {!!attention?.queuedCount && (
                                  <span className="shrink-0 rounded-full border border-forge-yellow/30 bg-forge-yellow/15 px-1.5 py-0.5 text-xs font-semibold text-forge-yellow" title="Queued messages">
                                    {attention.queuedCount} queued
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate text-xs font-mono text-forge-muted">{workspace.branch || '(no branch)'}</span>
                                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${statusTone}`}>
                                  {attention?.status ?? workspace.status}
                                </span>
                                {isArchived && <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-forge-muted">Archived</span>}
                                {conflictingWorkspaceIds.has(workspace.id) && (
                                  <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25" title="This workspace shares modified files with another active workspace">
                                    conflict
                                  </span>
                                )}
                                {workspace.agentSession?.estimatedCost && workspace.agentSession.estimatedCost !== '$0.00' && (
                                  <span className="shrink-0 text-xs font-mono text-forge-muted/70" title="Estimated agent cost">
                                    {workspace.agentSession.estimatedCost}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Delete button — shown on hover */}
                        {isHovered && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteWorkspace(workspace.id);
                            }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                            title={`Delete workspace "${workspace.name}"`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Orchestrator panel */}
      {orchestrator !== null && (
        <div className="shrink-0 border-t border-forge-border/60 bg-forge-surface/80 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Brain className={`h-3.5 w-3.5 ${orchestrator.enabled ? 'text-forge-orange animate-pulse' : 'text-forge-muted'}`} />
              <span className="text-sm font-semibold text-forge-text">Orchestrator</span>
              {orchestrator.enabled && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-forge-orange/15 text-forge-orange border border-forge-orange/20">
                  Opus
                </span>
              )}
            </div>
            <button
              onClick={() => void handleOrchestratorToggle(!orchestrator.enabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${orchestrator.enabled ? 'bg-forge-orange' : 'bg-forge-border'}`}
              title={orchestrator.enabled ? 'Disable orchestrator' : 'Enable orchestrator'}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${orchestrator.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
          {orchestrator.enabled && (
            <div className="space-y-1">
              <p className="text-xs text-forge-muted">
                Brain: <span className="text-forge-text font-mono">{orchestrator.model}</span> · change in Settings → AI Models
              </p>
              {orchestrator.lastRunAt && (
                <p className="text-xs text-forge-muted">
                  Last run: {orchestrator.lastRunAt} · {orchestrator.lastActions.length} action(s)
                </p>
              )}
              {orchestrator.lastActions.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {orchestrator.lastActions.slice(0, 3).map((a, i) => (
                    <p key={i} className="text-xs text-forge-muted truncate">
                      → {a.action} {a.workspaceId ?? ''}{a.prompt ? `: ${a.prompt.slice(0, 40)}…` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {!orchestrator.enabled && (
            <p className="text-xs text-forge-muted">Monitors agents every 5 min · configure model in Settings</p>
          )}
        </div>
      )}

      {batchMode && (
        <div className="shrink-0 border-t border-forge-border bg-forge-surface px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-forge-orange">
              {batchSelected.size} workspace{batchSelected.size === 1 ? '' : 's'} selected
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearBatch}
              className="text-forge-muted hover:text-forge-text"
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
            className="border-forge-border bg-black/30 px-2.5 py-2 text-sm placeholder:text-forge-muted/60 focus:border-forge-orange/40"
          />
          <Button
            variant="default"
            onClick={() => void sendBatch()}
            disabled={batchSending || !batchPrompt.trim()}
            className="mt-2 w-full bg-forge-orange/90 text-white hover:bg-forge-orange"
          >
            <Send className="h-3 w-3" />
            {batchSending ? 'Sending…' : `Send to ${batchSelected.size}`}
          </Button>
        </div>
      )}

      {/* Bottom: secondary nav */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 border-t border-forge-border/40">
        {secondaryNav.map(renderNavBtn)}
      </div>
    </aside>
  );
}
