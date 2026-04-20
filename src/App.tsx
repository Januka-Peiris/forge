import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './components/ui/button';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { DetailPanel } from './components/detail/DetailPanel';
import { Sidebar, type NavView } from './components/layout/Sidebar';
import { WorkspaceTerminal } from './components/terminal/WorkspaceTerminal';
import { listRepositories, removeRepository, addRepository } from './lib/tauri-api/repositories';
import { createWorkspacePr } from './lib/tauri-api/pr-draft';
import { getSettings, resolveGitRepositoryPath } from './lib/tauri-api/settings';
import { listActivity } from './lib/tauri-api/activity';
import { openDeepLink } from './lib/tauri-api/deep-links';
import { listWorkspaceAttention, markWorkspaceAttentionRead } from './lib/tauri-api/workspace-attention';
import { getWorkspaceConflicts } from './lib/tauri-api/workspace-health';
import { formatCursorOpenError } from './lib/ui-errors';
import { forgeLog, forgeWarn } from './lib/forge-log';
import { measureAsync, perfMark, perfMeasure } from './lib/perf';
import {
  attachWorkspaceLinkedWorktree,
  createChildWorkspace,
  createWorkspace,
  deleteWorkspace,
  detachWorkspaceLinkedWorktree,
  listWorkspaces,
  listWorkspaceLinkedWorktrees,
  openInCursor,
  openWorktreeInCursor,
} from './lib/tauri-api/workspaces';
import type { ActivityItem, AppSettings, CreateWorkspaceInput, Workspace, WorkspaceAttention } from './types';
import { LoadingView, ErrorView } from './components/views/LoadingView';
import { EnvironmentSetupModal } from './components/modals/EnvironmentSetupModal';
import { SettingsView } from './components/settings/SettingsView';
import { MemoryView } from './components/memory/MemoryView';
import { sanitizeWorkspaceForDisplay, sanitizeWorkspacesForDisplay } from './lib/workspace-display';
import { KeyboardShortcutsModal } from './components/shortcuts/KeyboardShortcutsModal';
import { useAppKeyboardShortcuts } from './lib/hooks/useAppKeyboardShortcuts';
import { useEnvironmentCheck } from './lib/hooks/useEnvironmentCheck';
import { useAppLayoutState } from './lib/hooks/useAppLayoutState';
import { useAppNotifications } from './lib/hooks/useAppNotifications';


const APP_BOOT_MARK = 'forge:app-boot';
perfMark(APP_BOOT_MARK);

const ReviewCockpit = lazy(() => import('./components/reviews/ReviewCockpit').then((module) => ({ default: module.ReviewCockpit })));
const CommandPalette = lazy(() => import('./components/command/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const NewWorkspaceModal = lazy(() => import('./components/modals/NewWorkspaceModal').then((module) => ({ default: module.NewWorkspaceModal })));

const SELECTED_WORKSPACE_KEY = 'forge:selected-workspace-id';
const ARCHIVED_WORKSPACES_KEY = 'forge:archived-workspace-ids';

async function withLoadTimeout<T>(label: string, task: Promise<T>, timeoutMs = 8000): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export default function App() {
  const [view, setView] = useState<NavView>('workspaces');
  const [selectedId, setSelectedId] = useState<string | null>(() => window.localStorage.getItem(SELECTED_WORKSPACE_KEY));
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRepositoryId, setModalRepositoryId] = useState<string | undefined>(undefined);
  const [branchFromWorkspaceId, setBranchFromWorkspaceId] = useState<string | null>(null);
  const [archivedWorkspaceIds, setArchivedWorkspaceIds] = useState<string[]>(() => {
    const raw = window.localStorage.getItem(ARCHIVED_WORKSPACES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [displayedWorkspaces, setDisplayedWorkspaces] = useState<Workspace[]>([]);
  const [workspaceAttention, setWorkspaceAttention] = useState<Record<string, WorkspaceAttention>>({});
  const [conflictingWorkspaceIds, setConflictingWorkspaceIds] = useState<Set<string>>(new Set());
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reviewTargetCommentId, setReviewTargetCommentId] = useState<string | null>(null);
  const [settingsState, setSettingsState] = useState<AppSettings | null>(null);
  const [linkedWorktreesByWorkspaceId, setLinkedWorktreesByWorkspaceId] = useState<Record<string, { worktreeId: string; repoId: string; repoName: string; path: string; branch?: string; head?: string }[]>>({});
  const {
    collapsedRailWidth,
    detailPanelCollapsed,
    detailPanelWidth,
    setDetailPanelCollapsed,
    setDetailPanelWidth,
    setSidebarCollapsed,
    setSidebarWidth,
    sidebarCollapsed,
    sidebarWidth,
    startResize,
  } = useAppLayoutState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const attentionRefreshTimerRef = useRef<number | null>(null);
  const markReadTimerRef = useRef<Record<string, number>>({});
  const workspaceSwitchMarkRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const {
    completeFirstRunEnvironmentCheck,
    environmentCheckBusy,
    environmentItems,
    environmentModalOpen,
    runEnvironmentCheck,
  } = useEnvironmentCheck({ settingsState, setSettingsState });

  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const openReviewsFromShortcut = useCallback(() => {
    setSelectedReviewPath(null);
    setReviewTargetCommentId(null);
    setView('reviews');
  }, []);
  const setWorkspacesView = useCallback(() => setView('workspaces'), []);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((open) => !open), []);
  const toggleDetailPanel = useCallback(() => setDetailPanelCollapsed((collapsed) => !collapsed), [setDetailPanelCollapsed]);

  useAppKeyboardShortcuts({
    commandPaletteOpen,
    displayedWorkspaces,
    environmentModalOpen,
    modalOpen,
    selectedWorkspaceId: selectedId,
    shortcutsOpen,
    onCloseShortcuts: closeShortcuts,
    onOpenReviews: openReviewsFromShortcut,
    onSelectWorkspace: setSelectedId,
    onSetWorkspacesView: setWorkspacesView,
    onToggleCommandPalette: toggleCommandPalette,
    onToggleDetailPanel: toggleDetailPanel,
  });

  useEffect(() => {
    if (view !== 'reviews') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setView('workspaces');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view]);

  /** Fresh repo list whenever the new-workspace modal opens (avoids stale worktrees; does not create workspaces). */
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const repos = await listRepositories();
        if (cancelled) return;
        setSettingsState((current) =>
          current
            ? {
                ...current,
                repoRoots: repos.map((r) => r.path),
                discoveredRepositories: repos,
              }
            : current,
        );
      } catch (err) {
        forgeWarn('repositories', 'list on new workspace modal failed', { err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const loadAttention = useCallback(async () => {
    try {
      const rows = await listWorkspaceAttention();
      setWorkspaceAttention(Object.fromEntries(rows.map((row) => [row.workspaceId, row])));
    } catch (err) {
      forgeWarn('attention', 'load failed', { err });
    }
    try {
      const result = await getWorkspaceConflicts();
      setConflictingWorkspaceIds(new Set(result.conflictingWorkspaceIds));
    } catch {
      // non-fatal
    }
  }, []);

  const scheduleAttentionLoad = useCallback((delay = 300) => {
    if (attentionRefreshTimerRef.current !== null) return;
    attentionRefreshTimerRef.current = window.setTimeout(() => {
      attentionRefreshTimerRef.current = null;
      void loadAttention();
    }, delay);
  }, [loadAttention]);

  const scheduleMarkAttentionRead = useCallback((workspaceId: string) => {
    if (markReadTimerRef.current[workspaceId] !== undefined) return;
    markReadTimerRef.current[workspaceId] = window.setTimeout(() => {
      delete markReadTimerRef.current[workspaceId];
      void markWorkspaceAttentionRead(workspaceId)
        .then(() => scheduleAttentionLoad(50))
        .catch((err) => forgeWarn('attention', 'mark read failed', { err, workspaceId }));
    }, 300);
  }, [scheduleAttentionLoad]);

  const { attentionToasts, dismissAttentionToast } = useAppNotifications({
    selectedWorkspaceId: selectedId,
    view,
    workspaces,
    onScheduleAttentionLoad: scheduleAttentionLoad,
    onScheduleMarkAttentionRead: scheduleMarkAttentionRead,
  });

  useEffect(() => () => {
    if (attentionRefreshTimerRef.current !== null) window.clearTimeout(attentionRefreshTimerRef.current);
    for (const timer of Object.values(markReadTimerRef.current)) window.clearTimeout(timer);
  }, []);

  const loadBackendState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await measureAsync('app:backend-load', async () => {
        const workspaceData = sanitizeWorkspacesForDisplay(await withLoadTimeout('list_workspaces', listWorkspaces()));
        setWorkspaces(workspaceData);
        setSelectedId((current) => {
          const persisted = typeof window !== 'undefined'
            ? window.localStorage.getItem(SELECTED_WORKSPACE_KEY)
            : null;
          const preferred = current ?? persisted;
          if (preferred && workspaceData.some((workspace) => workspace.id === preferred)) {
            return preferred;
          }
          return workspaceData[0]?.id ?? null;
        });

        const [settingsResult, activityResult] = await Promise.allSettled([
          withLoadTimeout('get_settings', getSettings()),
          withLoadTimeout('list_activity', listActivity()),
        ]);
        if (settingsResult.status === 'fulfilled') {
          setSettingsState(settingsResult.value);
        } else {
          forgeWarn('startup', 'settings load failed', { err: settingsResult.reason });
        }
        if (activityResult.status === 'fulfilled') {
          setActivityItems(activityResult.value);
        } else {
          forgeWarn('startup', 'activity load failed', { err: activityResult.reason });
        }
        scheduleAttentionLoad();
      });
      perfMeasure('app:boot-to-backend-ready', APP_BOOT_MARK);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [scheduleAttentionLoad]);

  useEffect(() => {
    void loadBackendState();
  }, [loadBackendState]);



  const handleDeepLinkUrl = useCallback(async (url: string) => {
    setDeepLinkNotice(null);
    try {
      const result = await openDeepLink({ url });
      await loadBackendState();
      setSelectedId(result.workspaceId);
      setView('workspaces');
      setDeepLinkNotice(result.created ? 'Workspace created from deep link.' : 'Workspace opened from deep link.');
      window.setTimeout(() => setDeepLinkNotice(null), 4000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      forgeWarn('deep-link', 'open failed', { url, err: message });
      setDeepLinkNotice(`Deep link failed: ${message}`);
    }
  }, [loadBackendState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('forgeDeepLink');
    if (encoded) {
      void handleDeepLinkUrl(encoded);
    }
    const hash = window.location.hash.startsWith('#forgeDeepLink=')
      ? window.location.hash.slice('#forgeDeepLink='.length)
      : null;
    if (hash) {
      void handleDeepLinkUrl(decodeURIComponent(hash));
    }
  }, [handleDeepLinkUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedId) {
      window.localStorage.setItem(SELECTED_WORKSPACE_KEY, selectedId);
    } else {
      window.localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    }
  }, [selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadAttention();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadAttention]);

  useEffect(() => {
    if (!selectedId || view !== 'workspaces') return;
    scheduleMarkAttentionRead(selectedId);
  }, [scheduleMarkAttentionRead, selectedId, view]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ARCHIVED_WORKSPACES_KEY, JSON.stringify(archivedWorkspaceIds));
  }, [archivedWorkspaceIds]);
  const selected = useMemo(
    () => workspaces.find((w) => w.id === selectedId) ?? null,
    [selectedId, workspaces],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (workspaceSwitchMarkRef.current) {
      perfMeasure('workspace:switch', workspaceSwitchMarkRef.current);
    }
    const mark = `forge:workspace-switch:${selectedId}:${Date.now()}`;
    workspaceSwitchMarkRef.current = mark;
    perfMark(mark);
  }, [selectedId]);

  const handleOpenInCursor = async (workspaceId?: string) => {
    const targetId = workspaceId ?? selectedId;
    if (!targetId) return;
    try {
      await openInCursor(targetId);
    } catch (err) {
      window.alert(formatCursorOpenError(err));
    }
  };

  const handleCreateWorkspace = async (input: CreateWorkspaceInput) => {
    const workspace = branchFromWorkspaceId
      ? await createChildWorkspace({
          parentWorkspaceId: branchFromWorkspaceId,
          name: input.name,
          branch: input.branch,
          agent: input.agent,
          taskPrompt: input.taskPrompt,
          openInCursor: input.openInCursor,
          runTests: input.runTests,
          createPr: input.createPr,
        })
      : await createWorkspace(input);
    // Workspace created — update state before any non-critical async work
    const displayWorkspace = sanitizeWorkspaceForDisplay(workspace);
    setWorkspaces((current) => [displayWorkspace, ...current]);
    setSelectedId(displayWorkspace.id);
    setView('workspaces');
    setModalOpen(false);
    setModalRepositoryId(undefined);
    setBranchFromWorkspaceId(null);
    // Non-fatal: refresh activity feed; failure here must not surface as a creation error
    listActivity().then(setActivityItems).catch(() => undefined);
    if (input.openInCursor) {
      await handleOpenInCursor(workspace.id);
    }
  };

  const loadLinkedWorktrees = useCallback(async (workspaceId: string) => {
    const linked = await listWorkspaceLinkedWorktrees(workspaceId);
    setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [workspaceId]: linked }));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadLinkedWorktrees(selectedId);
  }, [loadLinkedWorktrees, selectedId]);

  const handleArchiveWorkspace = (workspaceId = selectedId) => {
    if (!workspaceId) return;
    setArchivedWorkspaceIds((current) => (
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    ));
  };

  const handleRemoveRepository = async (repositoryId: string) => {
    const repo = settingsState?.discoveredRepositories.find((r) => r.id === repositoryId);
    const label = repo?.name ?? repositoryId;
    if (!window.confirm(`Remove repository "${label}" from Forge? This only removes it from the list — it won't delete files on disk.`)) return;
    try {
      await removeRepository(repositoryId);
      setSettingsState((current) =>
        current
          ? {
              ...current,
              discoveredRepositories: current.discoveredRepositories.filter((r) => r.id !== repositoryId),
            }
          : current,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to remove repository: ${message}`);
    }
  };

  const handleAddRepository = async () => {
    const picked = await openFilePicker({ directory: true, multiple: false, title: 'Choose a Git repository' });
    if (!picked) return;
    try {
      const toplevel = await resolveGitRepositoryPath(picked as string);
      const repos = await addRepository(toplevel);
      setSettingsState((current) => current ? { ...current, discoveredRepositories: repos } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to add repository: ${message}`);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const candidate = workspaces.find((workspace) => workspace.id === workspaceId);
    const label = candidate?.name ?? workspaceId;
    if (!window.confirm([
      `Forget workspace "${label}" from Forge?`,
      '',
      'This removes only the Forge workspace record from the app.',
      'It will not delete the branch, Git worktree, checkout folder, or files on disk.',
      'Prefer Archive if you may want to reopen it from Forge later.',
    ].join('\n'))) return;
    forgeLog('deleteWorkspace', 'user confirmed; invoking delete_workspace', { workspaceId, label });
    setError(null);
    try {
      await deleteWorkspace(workspaceId);
      forgeLog('deleteWorkspace', 'invoke returned ok', { workspaceId });
      setWorkspaces((current) => {
        const next = current.filter((workspace) => workspace.id !== workspaceId);
        setSelectedId((prev) => {
          if (prev !== workspaceId) return prev;
          return next[0]?.id ?? null;
        });
        return next;
      });
      setArchivedWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      setLinkedWorktreesByWorkspaceId((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });
      setActivityItems(await listActivity());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      forgeWarn('deleteWorkspace', 'invoke failed', { workspaceId, err, message });
      setError(message);
      window.alert(`Failed to delete workspace: ${message}`);
    }
  };

  const mainContent = () => {
    if (loading) return <LoadingView />;
    if (error) return <ErrorView message={error} onRetry={loadBackendState} />;

    if (view === 'workspaces') {
      return (
        <WorkspaceTerminal workspace={selected} onOpenInCursor={() => void handleOpenInCursor()} />
      );
    }

    if (view === 'reviews') {
      return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-ui-label text-forge-muted">Loading Review Cockpit…</div>}>
          <ReviewCockpit
            workspace={selected}
            selectedPath={selectedReviewPath}
            onSelectedPathChange={setSelectedReviewPath}
            targetCommentId={reviewTargetCommentId}
            onTargetCommentHandled={() => setReviewTargetCommentId(null)}
            onBackToWorkspaces={() => setView('workspaces')}
          />
        </Suspense>
      );
    }

    if (view === 'memory') return <MemoryView />;

    return <SettingsView settings={settingsState} onSettingsChange={setSettingsState} onRemoveRepository={(repositoryId) => void handleRemoveRepository(repositoryId)} />;
  };

  const isReviewView = view === 'reviews';
  const showDetailPanel = view === 'workspaces';
  const effectiveSidebarWidth = sidebarCollapsed ? collapsedRailWidth : sidebarWidth;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-forge-bg text-forge-text antialiased selection:bg-forge-green/25">
      <div className="flex flex-1 min-h-0">
        {!isReviewView && (
          sidebarCollapsed ? (
            <div
              className="shrink-0 h-full flex flex-col items-center justify-start bg-forge-surface"
              style={{ width: `${collapsedRailWidth}px` }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setSidebarCollapsed(false)}
                title="Expand sidebar"
                className="mt-2.5 shadow-md ring-1 ring-black/20"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
              </Button>
            </div>
          ) : (
            <>
              <div className="shrink-0 h-full" style={{ width: `${sidebarWidth}px` }}>
                <Sidebar
                  activeView={view}
                  onNavigate={setView}
                  repositories={settingsState?.discoveredRepositories ?? []}
                  workspaces={workspaces}
                  archivedWorkspaceIds={archivedWorkspaceIds}
                  workspaceAttention={workspaceAttention}
                  conflictingWorkspaceIds={conflictingWorkspaceIds}
                  selectedWorkspaceId={selectedId}
                  onSelectWorkspace={setSelectedId}
                  onArchiveWorkspace={(workspaceId) => handleArchiveWorkspace(workspaceId)}
                  onRemoveRepository={(repositoryId) => void handleRemoveRepository(repositoryId)}
                  onNewWorkspace={(repositoryId) => {
                    setModalRepositoryId(repositoryId);
                    setBranchFromWorkspaceId(null);
                    setModalOpen(true);
                  }}
                  onAddRepository={() => void handleAddRepository()}
                  onCollapse={() => setSidebarCollapsed(true)}
                  onFilteredWorkspacesChange={setDisplayedWorkspaces}
                />
              </div>
              <div
                role="separator"
                aria-label="Resize sidebar"
                onMouseDown={(event) => startResize(event, 'left')}
                onDoubleClick={() => setSidebarWidth(300)}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
                title="Double-click to reset width"
              />            </>
          )
        )}

        <div className="flex flex-1 min-w-0 min-h-0">
          <div className="relative flex flex-col flex-1 min-w-0 min-h-0 bg-forge-bg">
            <div className="relative flex flex-1 flex-col min-h-0">
              {mainContent()}
            </div>
          </div>

          {showDetailPanel && (
            <>
              {!detailPanelCollapsed ? (
                <>
                  <div
                    role="separator"
                    aria-label="Resize detail panel"
                    onMouseDown={(event) => startResize(event, 'right')}
                    onDoubleClick={() => setDetailPanelWidth(280)}
                    className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
                    title="Double-click to reset width"
                  />
                  <div
                    className="relative z-[2] shrink-0 h-full shadow-forge-panel"
                    style={{ width: `${detailPanelWidth}px` }}
                  >
                    <DetailPanel
                      workspace={selected}
                      onCollapse={() => setDetailPanelCollapsed(true)}
                      onOpenInCursor={() => void handleOpenInCursor()}
                      isArchived={selected ? archivedWorkspaceIds.includes(selected.id) : false}
                      onArchiveWorkspace={handleArchiveWorkspace}
                      onDeleteWorkspace={selected ? () => void handleDeleteWorkspace(selected.id) : undefined}
                      onOpenReviewFile={(path) => {
                        setSelectedReviewPath(path ?? null);
                        setView('reviews');
                      }}
                      activityItems={selected ? activityItems.filter((item) => item.workspaceId === selected.id) : []}
                      repositories={settingsState?.discoveredRepositories ?? []}
                      linkedWorktrees={selected ? linkedWorktreesByWorkspaceId[selected.id] ?? [] : []}
                      onAttachLinkedWorktree={(worktreeId) => {
                        if (!selectedId) return;
                        void attachWorkspaceLinkedWorktree(selectedId, worktreeId).then((linked) => {
                          setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [selectedId]: linked }));
                        }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                      }}
                      onDetachLinkedWorktree={(worktreeId) => {
                        if (!selectedId) return;
                        void detachWorkspaceLinkedWorktree(selectedId, worktreeId).then((linked) => {
                          setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [selectedId]: linked }));
                        }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                      }}
                      onOpenLinkedWorktreeInCursor={(path) => {
                        void openWorktreeInCursor(path).catch((err) => window.alert(formatCursorOpenError(err)));
                      }}
                      onCreateChildWorkspace={() => {
                        if (!selected) return;
                        setModalRepositoryId(selected.repositoryId);
                        setBranchFromWorkspaceId(selected.id);
                        setModalOpen(true);
                      }}
                      onCreatePr={selected ? async () => {
                        const result = await createWorkspacePr(selected.id);
                        setWorkspaces((current) =>
                          current.map((w) =>
                            w.id === selected.id ? { ...w, prStatus: 'Open', prNumber: result.prNumber } : w,
                          ),
                        );
                        return result;
                      } : undefined}
                    />
                  </div>
                </>
              ) : (
                <div
                  className="shrink-0 h-full flex items-start justify-center bg-forge-surface"
                  style={{ width: `${collapsedRailWidth}px` }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    onClick={() => setDetailPanelCollapsed(false)}
                    title="Expand detail panel"
                    className="mt-2.5"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPaletteOpen}
            workspaces={workspaces}
            selectedWorkspace={selected}
            changedFiles={[]}
            onClose={() => setCommandPaletteOpen(false)}
            onSelectWorkspace={setSelectedId}
            onOpenWorkspace={() => setView('workspaces')}
            onOpenReviewFile={(path) => {
              setSelectedReviewPath(path);
              setView('reviews');
            }}
            onOpenReviewComment={(commentId, path) => {
              if (path) setSelectedReviewPath(path);
              setReviewTargetCommentId(commentId);
              setView('reviews');
            }}
            onCheckEnvironment={() => void runEnvironmentCheck(true)}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />
        </Suspense>
      )}

      {shortcutsOpen && <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {environmentModalOpen && (
        <EnvironmentSetupModal
          items={environmentItems}
          busy={environmentCheckBusy}
          onContinue={() => void completeFirstRunEnvironmentCheck()}
          onRerun={() => void runEnvironmentCheck(true)}
        />
      )}

      {modalOpen && (
        <Suspense fallback={null}>
          <NewWorkspaceModal
            onClose={() => {
              setModalOpen(false);
              setModalRepositoryId(undefined);
              setBranchFromWorkspaceId(null);
            }}
            onCreate={handleCreateWorkspace}
            repositories={settingsState?.discoveredRepositories ?? []}
            initialRepositoryId={modalRepositoryId}
          />
        </Suspense>
      )}

      {attentionToasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 z-50 flex w-[360px] flex-col gap-2" style={{ left: `${effectiveSidebarWidth + 16}px` }}>
          {attentionToasts.map((toast) => (
            <button
              key={toast.id}
              onClick={() => {
                setView('workspaces');
                setSelectedId(toast.workspaceId);
                dismissAttentionToast(toast.id);
              }}
              className="pointer-events-auto rounded-xl border border-forge-blue/25 bg-forge-bg/95 px-3 py-2 text-left shadow-xl shadow-black/30 backdrop-blur hover:bg-forge-surface"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-ui-label font-bold text-forge-blue">New workspace output</span>
                <span className="text-ui-caption text-forge-muted">Open</span>
              </div>
              <p className="mt-1 truncate text-ui-label font-semibold text-forge-text">{toast.workspaceName}</p>
              <p className="mt-0.5 truncate text-ui-label text-forge-muted">{toast.text}</p>
            </button>
          ))}
        </div>
      )}

      {deepLinkNotice && (
        <div className="fixed right-4 top-4 z-50 max-w-[420px] rounded-xl border border-forge-blue/25 bg-forge-bg/95 px-4 py-3 text-ui-label font-semibold text-forge-text shadow-xl shadow-black/30 backdrop-blur">
          {deepLinkNotice}
        </div>
      )}
    </div>
  );
}
