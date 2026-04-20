import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './components/ui/button';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { DetailPanel } from './components/detail/DetailPanel';
import { Sidebar, type NavView } from './components/layout/Sidebar';
import { ContextHeader } from './components/layout/ContextHeader';
import { WorkspaceTerminal } from './components/terminal/WorkspaceTerminal';
import { listRepositories, removeRepository, addRepository } from './lib/tauri-api/repositories';
import { createWorkspacePr } from './lib/tauri-api/pr-draft';
import { getSettings, saveHasCompletedEnvCheck, resolveGitRepositoryPath } from './lib/tauri-api/settings';
import { listActivity } from './lib/tauri-api/activity';
import { openDeepLink } from './lib/tauri-api/deep-links';
import { checkEnvironment } from './lib/tauri-api/environment';
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
import type { ActivityItem, AppSettings, CreateWorkspaceInput, EnvironmentCheckItem, TerminalOutputEvent, Workspace, WorkspaceAttention } from './types';
import { LoadingView, ErrorView } from './components/views/LoadingView';
import { EnvironmentSetupModal } from './components/modals/EnvironmentSetupModal';
import { SettingsView } from './components/settings/SettingsView';
import { MemoryView } from './components/memory/MemoryView';


const APP_BOOT_MARK = 'forge:app-boot';
perfMark(APP_BOOT_MARK);

const ReviewCockpit = lazy(() => import('./components/reviews/ReviewCockpit').then((module) => ({ default: module.ReviewCockpit })));
const CommandPalette = lazy(() => import('./components/command/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const NewWorkspaceModal = lazy(() => import('./components/modals/NewWorkspaceModal').then((module) => ({ default: module.NewWorkspaceModal })));

const SELECTED_WORKSPACE_KEY = 'forge:selected-workspace-id';
const ARCHIVED_WORKSPACES_KEY = 'forge:archived-workspace-ids';
const SIDEBAR_WIDTH_KEY = 'forge:sidebar-width';
const DETAIL_PANEL_WIDTH_KEY = 'forge:detail-panel-width';
const DETAIL_PANEL_COLLAPSED_KEY = 'forge:detail-panel-collapsed';

interface AttentionToast {
  id: string;
  workspaceId: string;
  workspaceName: string;
  text: string;
}


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
  const [attentionToasts, setAttentionToasts] = useState<AttentionToast[]>([]);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [reviewTargetCommentId, setReviewTargetCommentId] = useState<string | null>(null);
  const [settingsState, setSettingsState] = useState<AppSettings | null>(null);
  const [environmentItems, setEnvironmentItems] = useState<EnvironmentCheckItem[]>([]);
  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [environmentCheckBusy, setEnvironmentCheckBusy] = useState(false);
  const [linkedWorktreesByWorkspaceId, setLinkedWorktreesByWorkspaceId] = useState<Record<string, { worktreeId: string; repoId: string; repoName: string; path: string; branch?: string; head?: string }[]>>({});
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(520, Math.max(220, parsed)) : 300;
  });
  const [detailPanelWidth, setDetailPanelWidth] = useState<number>(() => {
    const raw = window.localStorage.getItem(DETAIL_PANEL_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(520, Math.max(240, parsed)) : 280;
  });
  const COLLAPSED_RAIL_WIDTH = 44;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState<boolean>(() =>
    window.localStorage.getItem(DETAIL_PANEL_COLLAPSED_KEY) === 'true',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const attentionRefreshTimerRef = useRef<number | null>(null);
  const markReadTimerRef = useRef<Record<string, number>>({});
  const workspaceSwitchMarkRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const workspacesRef = useRef<Workspace[]>([]);
  const firstRunEnvCheckStartedRef = useRef(false);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);

  const sendForgeNotification = useCallback(async (title: string, body: string) => {
    try {
      const notificationsEnabled = window.localStorage.getItem('forge:notifications-enabled');
      if (notificationsEnabled === 'false') return;
      const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      if (granted) sendNotification({ title, body });
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      // Cmd+1..9 — jump to workspace by position in sidebar list
      if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '9' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const idx = parseInt(event.key) - 1;
        const ws = displayedWorkspaces[idx];
        if (ws) { setSelectedId(ws.id); setView('workspaces'); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [displayedWorkspaces]);

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

  const runEnvironmentCheck = useCallback(async (showModal = true) => {
    setEnvironmentCheckBusy(true);
    try {
      const items = await checkEnvironment();
      setEnvironmentItems(items);
      if (showModal) setEnvironmentModalOpen(true);
      return items;
    } catch (err) {
      forgeWarn('environment', 'check failed', { err });
      const unknownItems: EnvironmentCheckItem[] = ['git', 'tmux', 'codex', 'claude', 'gh'].map((binary) => ({
        name: binary === 'codex' ? 'codex CLI' : binary === 'claude' ? 'claude CLI' : binary === 'gh' ? 'GitHub CLI' : binary,
        binary,
        status: 'unknown',
        fix: `brew install ${binary}`,
        optional: binary === 'gh',
        path: null,
      }));
      setEnvironmentItems(unknownItems);
      if (showModal) setEnvironmentModalOpen(true);
      return unknownItems;
    } finally {
      setEnvironmentCheckBusy(false);
    }
  }, []);

  const completeFirstRunEnvironmentCheck = useCallback(async () => {
    setEnvironmentModalOpen(false);
    try {
      const nextSettings = await saveHasCompletedEnvCheck(true);
      setSettingsState(nextSettings);
    } catch (err) {
      forgeWarn('environment', 'failed to persist completion flag', { err });
    }
  }, []);

  useEffect(() => () => {
    if (attentionRefreshTimerRef.current !== null) window.clearTimeout(attentionRefreshTimerRef.current);
    for (const timer of Object.values(markReadTimerRef.current)) window.clearTimeout(timer);
  }, []);

  const loadBackendState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await measureAsync('app:backend-load', async () => {
        const workspaceData = await withLoadTimeout('list_workspaces', listWorkspaces());
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

  useEffect(() => {
    if (!settingsState || settingsState.hasCompletedEnvCheck || firstRunEnvCheckStartedRef.current) return;
    firstRunEnvCheckStartedRef.current = true;
    void runEnvironmentCheck(true).finally(() => {
      void saveHasCompletedEnvCheck(true)
        .then((nextSettings) => setSettingsState(nextSettings))
        .catch((err) => forgeWarn('environment', 'failed to persist first-run completion', { err }));
    });
  }, [runEnvironmentCheck, settingsState]);

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
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; message: string }>(
      'forge://orchestrator-notify',
      (event) => {
        if (disposed) return;
        const { workspaceId, message } = event.payload;
        const ws = workspacesRef.current.find((w) => w.id === workspaceId);
        const id = `orch-notify-${workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId, workspaceName: ws?.name ?? workspaceId, text: `Orchestrator: ${message}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => setAttentionToasts((current) => current.filter((t) => t.id !== id)), 8000);
        void sendForgeNotification('Orchestrator', message);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; })
      .catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [sendForgeNotification]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; branch: string; baseBranch: string }>(
      'forge://workspace-rebase-conflict',
      (event) => {
        if (disposed) return;
        const { workspaceId, workspaceName, branch, baseBranch } = event.payload;
        const id = `rebase-conflict-${workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId, workspaceName, text: `Rebase conflict: ${branch} → origin/${baseBranch}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => setAttentionToasts((current) => current.filter((t) => t.id !== id)), 8000);
        void sendForgeNotification('Rebase Conflict', `Conflict in ${branch} (${workspaceName})`);
      },
    ).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [sendForgeNotification]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<TerminalOutputEvent>('forge://terminal-output', (event) => {
      if (disposed) return;
      const workspaceId = event.payload.workspaceId;
      if (workspaceId === selectedIdRef.current && view === 'workspaces') {
        scheduleMarkAttentionRead(workspaceId);
        return;
      }
      const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
      const text = event.payload.chunk.data.replace(/\s+/g, ' ').trim();
      if (!workspace || !text || event.payload.chunk.streamType === 'pty_snapshot') {
        scheduleAttentionLoad();
        return;
      }
      const id = `${workspaceId}-${event.payload.chunk.sessionId}-${event.payload.chunk.seq}`;
      setAttentionToasts((current) => [
        { id, workspaceId, workspaceName: workspace.name, text: text.slice(0, 120) },
        ...current.filter((toast) => toast.workspaceId !== workspaceId).slice(0, 2),
      ]);
      window.setTimeout(() => {
        setAttentionToasts((current) => current.filter((toast) => toast.id !== id));
      }, 5000);
      scheduleAttentionLoad();
    }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch((err) => forgeWarn('attention', 'event listener failed', { err }));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [scheduleAttentionLoad, scheduleMarkAttentionRead, view]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; stuckFor: number }>(
      'forge://terminal-stuck',
      (event) => {
        if (disposed) return;
        const { workspaceName, stuckFor } = event.payload;
        void sendForgeNotification('Agent Stuck', `${workspaceName} has been stuck for ${stuckFor}min`);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [sendForgeNotification]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; command: string }>(
      'forge://command-approval-required',
      (event) => {
        if (disposed) return;
        const ws = workspacesRef.current.find((w) => w.id === event.payload.workspaceId);
        const workspaceName = ws?.name ?? event.payload.workspaceId;
        void sendForgeNotification('Approval Needed', `Agent wants to run a command in ${workspaceName}`);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [sendForgeNotification]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; cost: string; limit: number }>(
      'forge://workspace-budget-exceeded',
      (event) => {
        if (disposed) return;
        const { cost } = event.payload;
        void sendForgeNotification('Budget exceeded', `Workspace spend reached $${cost}`);
        const ws = workspacesRef.current.find((w) => w.id === event.payload.workspaceId);
        const id = `budget-${event.payload.workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId: event.payload.workspaceId, workspaceName: ws?.name ?? event.payload.workspaceId, text: `Budget cap reached: $${cost}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => setAttentionToasts((current) => current.filter((t) => t.id !== id)), 8000);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [sendForgeNotification]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ARCHIVED_WORKSPACES_KEY, JSON.stringify(archivedWorkspaceIds));
  }, [archivedWorkspaceIds]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(detailPanelWidth));
  }, [detailPanelWidth]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DETAIL_PANEL_COLLAPSED_KEY, String(detailPanelCollapsed));
  }, [detailPanelCollapsed]);

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
    setWorkspaces((current) => [workspace, ...current]);
    setSelectedId(workspace.id);
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

  const startResize = (
    event: React.MouseEvent<HTMLDivElement>,
    panel: 'left' | 'right',
  ) => {
    if (panel === 'left' && sidebarCollapsed) return;
    if (panel === 'right' && detailPanelCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === 'left' ? sidebarWidth : detailPanelWidth;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (panel === 'left') {
        setSidebarWidth(Math.min(520, Math.max(220, startWidth + delta)));
      } else {
        setDetailPanelWidth(Math.min(520, Math.max(240, startWidth - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
  const effectiveSidebarWidth = sidebarCollapsed ? COLLAPSED_RAIL_WIDTH : sidebarWidth;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-forge-bg text-forge-text antialiased selection:bg-forge-green/25">
      <div className="flex flex-1 min-h-0">
        {!isReviewView && (
          sidebarCollapsed ? (
            <div
              className="shrink-0 h-full flex flex-col items-center justify-start bg-forge-surface"
              style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
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
            <ContextHeader workspace={selected} />
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
                  style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
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
          />
        </Suspense>
      )}

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
                setAttentionToasts((current) => current.filter((item) => item.id !== toast.id));
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
