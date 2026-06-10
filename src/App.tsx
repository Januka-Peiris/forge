import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { WorkspaceInspectorRail } from './components/inspector/WorkspaceInspectorRail';
import { Sidebar, type NavView } from './components/layout/Sidebar';
import { AppFrame } from './components/layout/AppFrame';
import { WorkspaceTerminal } from './components/terminal/WorkspaceTerminal';
import { listActivity } from './lib/tauri-api/activity';
import { openDeepLink } from './lib/tauri-api/deep-links';
import { getSettings } from './lib/tauri-api/settings';
import { mnWarn } from './lib/mn-log';
import { measureAsync, perfMark, perfMeasure } from './lib/perf';
import { listWorkspaces, openInCursor as openWorkspaceInCursorById } from './lib/tauri-api/workspaces';
import { runWorkspaceSetup } from './lib/tauri-api/workspace-scripts';
import { syncWorkspacePrThreads } from './lib/tauri-api/review-cockpit';
import { listRepositoryRelationships } from './lib/tauri-api/repository-relationships';
import type { CreateManyWorkspacesResult, CreateWorkspaceInput } from './types';
import type { RepositoryRelationship } from './types/repository-relationship';
import { LoadingView, ErrorView } from './components/views/LoadingView';
import { EnvironmentSetupModal } from './components/modals/EnvironmentSetupModal';
import { SettingsView } from './components/settings/SettingsView';
import { MemoryView } from './components/memory/MemoryView';
import { FederatedTasksView } from './components/federation/FederatedTasksView';
import { KeyboardShortcutsModal } from './components/shortcuts/KeyboardShortcutsModal';
import { useAppKeyboardShortcuts } from './lib/hooks/useAppKeyboardShortcuts';
import { useEnvironmentCheck } from './lib/hooks/useEnvironmentCheck';
import { useAppLayoutState } from './lib/hooks/useAppLayoutState';
import { useAppNotifications } from './lib/hooks/useAppNotifications';
import { useMnemonicWorkspaces } from './lib/hooks/useMnemonicWorkspaces';
import { useAppRepositories } from './lib/hooks/useAppRepositories';
import { useWorkspaceAttentionState } from './lib/hooks/useWorkspaceAttentionState';


const APP_BOOT_MARK = 'mn:app-boot';
perfMark(APP_BOOT_MARK);

const ReviewCockpit = lazy(() => import('./components/reviews/ReviewCockpit').then((module) => ({ default: module.ReviewCockpit })));
const CommandPalette = lazy(() => import('./components/command/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const NewWorkspaceModal = lazy(() => import('./components/modals/NewWorkspaceModal').then((module) => ({ default: module.NewWorkspaceModal })));


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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRepositoryId, setModalRepositoryId] = useState<string | undefined>(undefined);
  const [branchFromWorkspaceId, setBranchFromWorkspaceId] = useState<string | null>(null);
  const [modalFederatedParentWorkspaceId, setModalFederatedParentWorkspaceId] = useState<string | null>(null);
  const [modalFederatedSourceWorkspaceId, setModalFederatedSourceWorkspaceId] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [, setActivityItems] = useState<unknown[]>([]);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reviewTargetCommentId, setReviewTargetCommentId] = useState<string | null>(null);
  const [requestedEditorFilePath, setRequestedEditorFilePath] = useState<string | null>(null);
  const [repositoryRelationships, setRepositoryRelationships] = useState<RepositoryRelationship[]>([]);

  const {
    addRepositoryToSettings,
    refreshRepositories,
    removeRepositoryFromSettings,
    setSettingsState,
    settingsState,
  } = useAppRepositories();

  const {
    collapsedRailWidth,
    inspectorCollapsed,
    inspectorTab,
    inspectorWidth,
    setInspectorCollapsed,
    setInspectorTab,
    setInspectorWidth,
    setSidebarCollapsed,
    setSidebarWidth,
    sidebarCollapsed,
    sidebarWidth,
    startResize,
  } = useAppLayoutState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    completeFirstRunEnvironmentCheck,
    environmentCheckBusy,
    environmentItems,
    environmentModalOpen,
    runEnvironmentCheck,
  } = useEnvironmentCheck({ settingsState, setSettingsState });

  const {
    archivedWorkspaceIds,
    archiveWorkspace,
    createWorkspaceFromInput,
    displayedWorkspaces,
    markPrCreated,
    openWorkspaceInCursor,
    replaceWorkspaces,
    selected,
    selectedId,
    setDisplayedWorkspaces,
    setSelectedId,
    workspaces,
  } = useMnemonicWorkspaces({
    onActivityItems: setActivityItems,
    onError: setError,
    onViewWorkspaces: () => setView('workspaces'),
  });

  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const openReviewsFromShortcut = useCallback(() => {
    setSelectedReviewPath(null);
    setReviewTargetCommentId(null);
    setView('reviews');
  }, []);
  const setWorkspacesView = useCallback(() => setView('workspaces'), []);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((open) => !open), []);
  const toggleInspector = useCallback(() => setInspectorCollapsed((collapsed) => !collapsed), [setInspectorCollapsed]);
  const openNewWorkspaceModal = useCallback((repositoryId?: string, parentWorkspaceId?: string, sourceWorkspaceId?: string) => {
    setModalRepositoryId(repositoryId);
    setBranchFromWorkspaceId(null);
    setModalFederatedParentWorkspaceId(parentWorkspaceId ?? null);
    setModalFederatedSourceWorkspaceId(sourceWorkspaceId ?? parentWorkspaceId ?? null);
    setModalOpen(true);
  }, []);

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
    onToggleInspector: toggleInspector,
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
    if (modalOpen) void refreshRepositories();
  }, [modalOpen, refreshRepositories]);

  const {
    conflictingWorkspaceIds,
    scheduleAttentionLoad,
    scheduleMarkAttentionRead,
    workspaceAttention,
  } = useWorkspaceAttentionState(selectedId, view);


  const { attentionToasts, dismissAttentionToast } = useAppNotifications({
    selectedWorkspaceId: selectedId,
    view,
    workspaces,
    onScheduleAttentionLoad: scheduleAttentionLoad,
    onScheduleMarkAttentionRead: scheduleMarkAttentionRead,
  });


  const loadBackendState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await measureAsync('app:backend-load', async () => {
        replaceWorkspaces(await withLoadTimeout('list_workspaces', listWorkspaces()));

        const [settingsResult, activityResult, relationshipsResult] = await Promise.allSettled([
          withLoadTimeout('get_settings', getSettings()),
          withLoadTimeout('list_activity', listActivity()),
          withLoadTimeout('list_repository_relationships', listRepositoryRelationships()),
        ]);
        if (settingsResult.status === 'fulfilled') {
          setSettingsState(settingsResult.value);
        } else {
          mnWarn('startup', 'settings load failed', { err: settingsResult.reason });
        }
        if (activityResult.status === 'fulfilled') {
          setActivityItems(activityResult.value);
        } else {
          mnWarn('startup', 'activity load failed', { err: activityResult.reason });
        }
        if (relationshipsResult.status === 'fulfilled') {
          setRepositoryRelationships(relationshipsResult.value.relationships);
        } else {
          mnWarn('startup', 'repository relationship load failed', { err: relationshipsResult.reason });
        }
        scheduleAttentionLoad();
      });
      perfMeasure('app:boot-to-backend-ready', APP_BOOT_MARK);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [replaceWorkspaces, scheduleAttentionLoad, setSettingsState]);

  useEffect(() => {
    void loadBackendState();
  }, [loadBackendState]);

  /** Quiet workspace-summary refresh (no loading state): keeps sidebar diff counters fresh. */
  const refreshWorkspaceSummaries = useCallback(async () => {
    try {
      replaceWorkspaces(await listWorkspaces());
    } catch (err) {
      mnWarn('workspaces', 'summary refresh failed', { err });
    }
  }, [replaceWorkspaces]);

  // The backend recomputes changed files in the background on each
  // list_workspaces call, so polling here converges sidebar +/- counters
  // after commits/pushes/PRs. Window focus and the explicit
  // mn:refresh-workspaces event (e.g. after Create PR) refresh immediately.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refreshWorkspaceSummaries();
    }, 15000);
    const onFocus = () => void refreshWorkspaceSummaries();
    const onRefreshEvent = () => void refreshWorkspaceSummaries();
    window.addEventListener('focus', onFocus);
    window.addEventListener('mn:refresh-workspaces', onRefreshEvent);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('mn:refresh-workspaces', onRefreshEvent);
    };
  }, [refreshWorkspaceSummaries]);



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
      mnWarn('deep-link', 'open failed', { url, err: message });
      setDeepLinkNotice(`Deep link failed: ${message}`);
    }
  }, [loadBackendState, setSelectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('mnDeepLink');
    if (encoded) {
      void handleDeepLinkUrl(encoded);
    }
    const hash = window.location.hash.startsWith('#mnDeepLink=')
      ? window.location.hash.slice('#mnDeepLink='.length)
      : null;
    if (hash) {
      void handleDeepLinkUrl(decodeURIComponent(hash));
    }
  }, [handleDeepLinkUrl]);

  const handleCreateWorkspace = async (input: CreateWorkspaceInput) => {
    await createWorkspaceFromInput(input, branchFromWorkspaceId);
    setModalOpen(false);
    setModalRepositoryId(undefined);
    setBranchFromWorkspaceId(null);
    setModalFederatedParentWorkspaceId(null);
    setModalFederatedSourceWorkspaceId(null);
  };

  const handleCreateWorkspaces = async (inputs: CreateWorkspaceInput[]): Promise<CreateManyWorkspacesResult> => {
    const result: CreateManyWorkspacesResult = { created: [], failed: [] };
    let parentWorkspaceId: string | null = inputs[0]?.parentWorkspaceId ?? null;
    const retryingRelatedWorkspaces = Boolean(parentWorkspaceId);

    for (const [index, input] of inputs.entries()) {
      if (!retryingRelatedWorkspaces && index > 0 && !parentWorkspaceId) {
        result.failed.push({
          input,
          name: input.name,
          repo: input.repo,
          error: 'Skipped because the parent workspace was not created.',
        });
        continue;
      }

      const effectiveInput = retryingRelatedWorkspaces || index === 0
        ? input
        : {
            ...input,
            parentWorkspaceId: parentWorkspaceId ?? undefined,
            sourceWorkspaceId: parentWorkspaceId ?? undefined,
          };

      try {
        const workspace = await createWorkspaceFromInput(
          effectiveInput,
          retryingRelatedWorkspaces || index > 0 ? null : branchFromWorkspaceId,
        );
        result.created.push({ workspaceId: workspace.id, name: workspace.name, repo: workspace.repo });
        if (!parentWorkspaceId) {
          parentWorkspaceId = workspace.id;
          result.parentWorkspaceId = workspace.id;
        }
      } catch (err) {
        result.failed.push({
          input: effectiveInput,
          name: effectiveInput.name,
          repo: effectiveInput.repo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (result.failed.length === 0) {
      setModalOpen(false);
      setModalRepositoryId(undefined);
      setBranchFromWorkspaceId(null);
      setModalFederatedParentWorkspaceId(null);
      setModalFederatedSourceWorkspaceId(null);
    }
    return result;
  };

  const mainContent = () => {
    if (loading) return <LoadingView />;
    if (error) return <ErrorView message={error} onRetry={loadBackendState} />;

    if (view === 'workspaces' || view === 'files') {
      return (
        <WorkspaceTerminal
          workspace={selected}
          workspaces={workspaces}
          repositories={settingsState?.discoveredRepositories ?? []}
          repositoryRelationships={repositoryRelationships}
          requestedFilePath={requestedEditorFilePath}
          onRequestedFilePathHandled={() => setRequestedEditorFilePath(null)}
          onOpenInCursor={() => void openWorkspaceInCursor()}
          onOpenReviewCockpit={(path) => {
            setSelectedReviewPath(path ?? null);
            setView('reviews');
          }}
          onSelectWorkspace={setSelectedId}
          onCreateWorkspaceForRepo={openNewWorkspaceModal}
        />
      );
    }

    if (view === 'reviews') {
      return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-ui-label text-mn-muted">Loading Review Cockpit…</div>}>
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

    if (view === 'federation') {
      return (
        <FederatedTasksView
          workspaces={workspaces}
          repositories={settingsState?.discoveredRepositories ?? []}
          relationships={repositoryRelationships}
          onSelectWorkspace={setSelectedId}
          onOpenWorkspace={() => setView('workspaces')}
          onCreateWorkspaceForRepo={openNewWorkspaceModal}
        />
      );
    }

    if (view === 'memory') return <MemoryView />;

    return <SettingsView settings={settingsState} onSettingsChange={setSettingsState} onRemoveRepository={(repositoryId) => void removeRepositoryFromSettings(repositoryId)} />;
  };

  const isReviewView = view === 'reviews';
  const showInspector = view === 'workspaces' || view === 'files';
  const effectiveSidebarWidth = sidebarCollapsed ? collapsedRailWidth : sidebarWidth;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-mn-bg text-mn-text antialiased selection:bg-mn-cyan/25">
      <AppFrame
        collapsedRailWidth={collapsedRailWidth}
        inspector={(
          <WorkspaceInspectorRail
            workspace={selected}
            isOpen={!inspectorCollapsed}
            width={inspectorWidth}
            activeTab={inspectorTab}
            onTabChange={setInspectorTab}
            onClose={() => setInspectorCollapsed(true)}
            onOpenReviewFile={(path) => {
              setSelectedReviewPath(path ?? null);
              setView('reviews');
            }}
            onOpenFile={(path) => {
              setView('files');
              setRequestedEditorFilePath(path);
            }}
          />
        )}
        inspectorCollapsed={inspectorCollapsed}
        inspectorWidth={inspectorWidth}
        isReviewView={isReviewView}
        showInspector={showInspector}
        onCollapseInspector={() => setInspectorCollapsed(true)}
        onExpandInspector={() => setInspectorCollapsed(false)}
        onExpandSidebar={() => setSidebarCollapsed(false)}
        onResetInspectorWidth={() => setInspectorWidth(340)}
        onResizeInspector={(event) => startResize(event, 'right')}
        onResizeSidebar={(event) => startResize(event, 'left')}
        onResetSidebarWidth={() => setSidebarWidth(300)}
        sidebar={(
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
          onArchiveWorkspace={(workspaceId) => archiveWorkspace(workspaceId)}
          onOpenWorkspaceInCursor={(workspaceId) => { void openWorkspaceInCursorById(workspaceId); }}
          onRunWorkspaceSetup={(workspaceId) => runWorkspaceSetup(workspaceId).then(() => undefined)}
          onRefreshWorkspaceThreads={(workspaceId) => syncWorkspacePrThreads(workspaceId).then(() => undefined)}
          onCreateWorkspacePr={(workspaceId) => markPrCreated(workspaceId)}
          onRemoveRepository={(repositoryId) => void removeRepositoryFromSettings(repositoryId)}
          onNewWorkspace={(repositoryId) => openNewWorkspaceModal(repositoryId)}
          onAddRepository={() => void addRepositoryToSettings()}
          onCollapse={() => setSidebarCollapsed(true)}
          repositoryRelationships={repositoryRelationships}
          onFilteredWorkspacesChange={setDisplayedWorkspaces}
        />
        )}
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
      >
        {mainContent()}
      </AppFrame>

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
              setModalFederatedParentWorkspaceId(null);
              setModalFederatedSourceWorkspaceId(null);
            }}
            onCreate={handleCreateWorkspace}
            onCreateMany={handleCreateWorkspaces}
            repositories={settingsState?.discoveredRepositories ?? []}
            initialRepositoryId={modalRepositoryId}
            initialParentWorkspaceId={modalFederatedParentWorkspaceId ?? undefined}
            initialSourceWorkspaceId={modalFederatedSourceWorkspaceId ?? undefined}
            initialFederatedTaskName={workspaces.find((workspace) => workspace.id === modalFederatedParentWorkspaceId)?.name}
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
              className="pointer-events-auto rounded-xl border border-mn-blue/25 bg-mn-bg/95 px-3 py-2 text-left shadow-xl shadow-black/30 backdrop-blur hover:bg-mn-surface"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-ui-label font-bold text-mn-blue">New workspace output</span>
                <span className="text-ui-caption text-mn-muted">Open</span>
              </div>
              <p className="mt-1 truncate text-ui-label font-semibold text-mn-text">{toast.workspaceName}</p>
              <p className="mt-0.5 truncate text-ui-label text-mn-muted">{toast.text}</p>
            </button>
          ))}
        </div>
      )}

      {deepLinkNotice && (
        <div className="fixed right-4 top-4 z-50 max-w-[420px] rounded-xl border border-mn-blue/25 bg-mn-bg/95 px-4 py-3 text-ui-label font-semibold text-mn-text shadow-xl shadow-black/30 backdrop-blur">
          {deepLinkNotice}
        </div>
      )}
    </div>
  );
}
