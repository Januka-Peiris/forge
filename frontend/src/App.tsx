import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, GitBranch, RefreshCw, Save, Trash2 } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { DetailPanel } from './components/detail/DetailPanel';
import { Sidebar, type NavView } from './components/layout/Sidebar';
import { WorkspaceTerminal } from './components/terminal/WorkspaceTerminal';
import { getWorkspaceChangedFiles, getWorkspaceFileDiff } from './lib/tauri-api/git-review';
import { getWorkspaceReviewSummary, refreshWorkspaceReviewSummary } from './lib/tauri-api/review-summary';
import { getWorkspaceMergeReadiness, refreshWorkspaceMergeReadiness } from './lib/tauri-api/merge-readiness';
import { removeRepository, scanRepositories } from './lib/tauri-api/repositories';
import { getSettings, resolveGitRepositoryPath, saveRepoRoots } from './lib/tauri-api/settings';
import { listActivity } from './lib/tauri-api/activity';
import { openDeepLink } from './lib/tauri-api/deep-links';
import { listWorkspaceAttention, markWorkspaceAttentionRead } from './lib/tauri-api/workspace-attention';
import { listWorkspaceAgentPrompts } from './lib/tauri-api/terminal';
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
import type { ActivityItem, AppSettings, CreateWorkspaceInput, DiscoveredRepository, TerminalOutputEvent, Workspace, WorkspaceAttention, WorkspaceChangedFile, WorkspaceFileDiff, WorkspaceMergeReadiness, WorkspaceReviewSummary } from './types';


const APP_BOOT_MARK = 'forge:app-boot';
perfMark(APP_BOOT_MARK);

const ReviewCockpit = lazy(() => import('./components/reviews/ReviewCockpit').then((module) => ({ default: module.ReviewCockpit })));
const CommandPalette = lazy(() => import('./components/command/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const NewWorkspaceModal = lazy(() => import('./components/modals/NewWorkspaceModal').then((module) => ({ default: module.NewWorkspaceModal })));

const SELECTED_WORKSPACE_KEY = 'forge:selected-workspace-id';
const ARCHIVED_WORKSPACES_KEY = 'forge:archived-workspace-ids';
const SIDEBAR_WIDTH_KEY = 'forge:sidebar-width';
const DETAIL_PANEL_WIDTH_KEY = 'forge:detail-panel-width';

interface AttentionToast {
  id: string;
  workspaceId: string;
  workspaceName: string;
  text: string;
}

function LoadingView() {
  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div>
        <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-forge-border border-t-forge-orange animate-spin" />
        <p className="text-[13px] font-medium text-forge-muted">Loading Forge backend state…</p>
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md rounded-2xl border border-forge-red/25 bg-forge-red/5 p-5">
        <p className="text-[13px] font-semibold text-forge-red">Could not load Tauri backend data</p>
        <p className="mt-2 text-[12px] leading-relaxed text-forge-muted">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-[12px] font-semibold text-forge-text hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    </div>
  );
}


function SettingsView({
  settings,
  onSettingsChange,
  onRemoveRepository,
}: {
  settings: AppSettings | null;
  onSettingsChange: (settings: AppSettings) => void;
  onRemoveRepository: (repositoryId: string) => void;
}) {
  const [repoRootsText, setRepoRootsText] = useState(settings?.repoRoots.join('\n') ?? '');
  const [repositories, setRepositories] = useState<DiscoveredRepository[]>(settings?.discoveredRepositories ?? []);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRepoRootsText(settings?.repoRoots.join('\n') ?? '');
    setRepositories(settings?.discoveredRepositories ?? []);
  }, [settings]);

  const repoRoots = () => repoRootsText.split('\n').map((root) => root.trim()).filter(Boolean);

  const mergeUniqueRoots = (lines: string[], extra: string): string[] => {
    const next = new Set([...lines.map((l) => l.trim()).filter(Boolean), extra.trim()].filter(Boolean));
    return Array.from(next).sort();
  };

  const isTauriShell = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const handleAddSingleRepositoryFolder = async () => {
    setMessage(null);
    setWarnings([]);
    if (!isTauriShell()) {
      setMessage('Folder picker is only available in the Forge desktop app (not the standalone browser dev server).');
      return;
    }
    setBusy(true);
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Choose a Git repository folder',
      });
      if (picked === null) return;

      const toplevel = await resolveGitRepositoryPath(picked);
      const merged = mergeUniqueRoots(repoRoots(), toplevel);
      setRepoRootsText(merged.join('\n'));

      const saved = await saveRepoRoots({ repoRoots: merged });
      onSettingsChange(saved);
      const result = await scanRepositories();
      setRepositories(result.repositories);
      setWarnings(result.warnings);
      onSettingsChange({ repoRoots: result.repoRoots, discoveredRepositories: result.repositories });
      setMessage(`Added repository root: ${toplevel}. Scan complete: ${result.repositories.length} repositories.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const next = await saveRepoRoots({ repoRoots: repoRoots() });
      onSettingsChange(next);
      setRepositories(next.discoveredRepositories);
      setMessage('Repo roots saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async () => {
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const saved = await saveRepoRoots({ repoRoots: repoRoots() });
      onSettingsChange(saved);
      const result = await scanRepositories();
      setRepositories(result.repositories);
      setWarnings(result.warnings);
      onSettingsChange({ repoRoots: result.repoRoots, discoveredRepositories: result.repositories });
      setMessage(`Scan complete: ${result.repositories.length} repositories discovered.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <h1 className="text-[22px] font-bold text-forge-text tracking-tight">Settings</h1>
        <p className="text-[12px] text-forge-muted mt-1.5">Local repo roots and Git worktree discovery</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-bold text-forge-text">Repositories on disk</h2>
              <p className="text-[11px] text-forge-muted mt-0.5 max-w-xl">
                Add one checkout with the folder picker (only that Git repo is registered), or list bulk scan roots below to discover many repos under a tree.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleAddSingleRepositoryFolder()}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-forge-blue/15 hover:bg-forge-blue/25 disabled:opacity-60 text-[12px] font-semibold text-forge-blue border border-forge-blue/30"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Add single repository…
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-60 text-[12px] font-semibold text-forge-text border border-forge-border"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={handleScan}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-forge-orange hover:bg-orange-500 disabled:opacity-60 text-[12px] font-semibold text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                Scan
              </button>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">Bulk scan roots (optional)</p>
          <p className="text-[11px] text-forge-muted mb-2">One directory per line. Forge searches each tree for Git repositories (depth limited).</p>
          <textarea
            value={repoRootsText}
            onChange={(event) => setRepoRootsText(event.target.value)}
            rows={5}
            placeholder="/Users/jay/dev\n/Users/jay/work"
            className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-[12px] font-mono text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50 resize-none"
          />

          {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}
          {warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-forge-yellow/20 bg-forge-yellow/5 p-3">
              <p className="text-[11px] font-semibold text-forge-yellow mb-1">Scan warnings</p>
              <ul className="space-y-1 text-[11px] text-forge-muted">
                {warnings.map((warning) => <li key={warning}>· {warning}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-bold text-forge-text">Discovered repositories</h2>
              <p className="text-[11px] text-forge-muted mt-0.5">Persisted in local SQLite after each scan</p>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forge-blue/15 text-forge-blue border border-forge-blue/20">
              {repositories.length} repos
            </span>
          </div>

          {repositories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <p className="text-[13px] text-forge-muted">No repositories discovered yet</p>
              <p className="text-[12px] text-forge-muted mt-1">Add a repo root and run Scan.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {repositories.map((repo) => (
                <div key={repo.id} className="rounded-lg border border-forge-border/80 bg-forge-surface/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-forge-orange" />
                        <h3 className="text-[13px] font-semibold text-forge-text truncate">{repo.name}</h3>
                        {repo.isDirty && <span className="text-[10px] text-forge-yellow">dirty</span>}
                      </div>
                      <p className="text-[11px] font-mono text-forge-muted mt-1 truncate">{repo.path}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-forge-text font-mono">{repo.currentBranch ?? 'detached'}</p>
                        <p className="text-[10px] text-forge-muted font-mono">{repo.head ?? 'no HEAD'}</p>
                      </div>
                      <button
                        onClick={() => onRemoveRepository(repo.id)}
                        className="p-1 rounded text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                        title={`Remove repository "${repo.name}" from Forge`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-forge-border/60 pt-2">
                    <p className="text-[10px] font-semibold text-forge-muted uppercase tracking-widest mb-2">
                      Worktrees · {repo.worktrees.length}
                    </p>
                    <div className="space-y-1">
                      {repo.worktrees.map((worktree) => (
                        <div key={worktree.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`h-1.5 w-1.5 rounded-full ${worktree.isDirty ? 'bg-forge-yellow' : 'bg-forge-green'}`} />
                          <span className="font-mono text-forge-text">{worktree.branch ?? 'detached'}</span>
                          <span className="text-forge-muted font-mono truncate">{worktree.path}</span>
                          <span className="ml-auto text-forge-muted font-mono">{worktree.head ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  const [workspaceAttention, setWorkspaceAttention] = useState<Record<string, WorkspaceAttention>>({});
  const [attentionToasts, setAttentionToasts] = useState<AttentionToast[]>([]);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [reviewFiles, setReviewFiles] = useState<WorkspaceChangedFile[]>([]);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<WorkspaceFileDiff | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [reviewLastRefreshedAt, setReviewLastRefreshedAt] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<WorkspaceReviewSummary | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [reviewTargetCommentId, setReviewTargetCommentId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [mergeReadiness, setMergeReadiness] = useState<WorkspaceMergeReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [settingsState, setSettingsState] = useState<AppSettings | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const diffRequestRef = useRef(0);
  const attentionRefreshTimerRef = useRef<number | null>(null);
  const markReadTimerRef = useRef<Record<string, number>>({});
  const workspaceSwitchMarkRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const workspacesRef = useRef<Workspace[]>([]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Fresh repo list whenever the new-workspace modal opens (avoids stale worktrees; does not create workspaces). */
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await scanRepositories();
        if (cancelled) return;
        setSettingsState((current) =>
          current
            ? { ...current, repoRoots: result.repoRoots, discoveredRepositories: result.repositories }
            : current,
        );
      } catch (err) {
        forgeWarn('repositories', 'scan on new workspace modal failed', { err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const loadAttention = useCallback(async () => {
    try {
      const rows = await listWorkspaceAttention();
      const attentionMap = Object.fromEntries(rows.map((row) => [row.workspaceId, row]));
      const workspaceIds = workspacesRef.current.map((ws) => ws.id);
      const queueCounts = await Promise.allSettled(
        workspaceIds.map(async (id) => {
          const entries = await listWorkspaceAgentPrompts(id, 20);
          return { id, count: entries.filter((e) => e.status === 'queued').length };
        }),
      );
      for (const result of queueCounts) {
        if (result.status === 'fulfilled' && result.value.count > 0) {
          const existing = attentionMap[result.value.id];
          if (existing) {
            attentionMap[result.value.id] = { ...existing, queuedCount: result.value.count };
          }
        }
      }
      setWorkspaceAttention(attentionMap);
    } catch (err) {
      forgeWarn('attention', 'load failed', { err });
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

  useEffect(() => () => {
    if (attentionRefreshTimerRef.current !== null) window.clearTimeout(attentionRefreshTimerRef.current);
    for (const timer of Object.values(markReadTimerRef.current)) window.clearTimeout(timer);
  }, []);

  const loadBackendState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await measureAsync('app:backend-load', async () => {
        const [workspaceData, settingsData, activityData] = await Promise.all([
          listWorkspaces(),
          getSettings(),
          listActivity(),
        ]);
        setWorkspaces(workspaceData);
        setSettingsState(settingsData);
        setActivityItems(activityData);
        scheduleAttentionLoad();
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

  const loadDiffForWorkspace = useCallback(async (workspaceId: string, path: string) => {
    const requestId = ++diffRequestRef.current;
    setDiffLoading(true);
    setReviewError(null);
    try {
      const nextDiff = await getWorkspaceFileDiff(workspaceId, path);
      if (diffRequestRef.current === requestId) {
        setFileDiff(nextDiff);
      }
    } catch (err) {
      if (diffRequestRef.current === requestId) {
        setReviewError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (diffRequestRef.current === requestId) {
        setDiffLoading(false);
      }
    }
  }, []);

  const loadReviewForWorkspace = useCallback(async (workspaceId: string, preferredPath?: string | null) => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const files = await getWorkspaceChangedFiles(workspaceId);
      setReviewFiles(files);
      setReviewLastRefreshedAt(new Date().toISOString());
      const nextPath = preferredPath && files.some((file) => file.path === preferredPath)
        ? preferredPath
        : files[0]?.path ?? null;
      setSelectedReviewPath(nextPath);
      if (nextPath) {
        void loadDiffForWorkspace(workspaceId, nextPath);
      } else {
        setFileDiff(null);
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
      setReviewFiles([]);
      setSelectedReviewPath(null);
      setFileDiff(null);
    } finally {
      setReviewLoading(false);
    }
  }, [loadDiffForWorkspace]);

  const loadReviewForSelected = useCallback(async () => {
    if (!selectedId) {
      setReviewFiles([]);
      setSelectedReviewPath(null);
      setFileDiff(null);
      return;
    }
    await loadReviewForWorkspace(selectedId, selectedReviewPath);
  }, [loadReviewForWorkspace, selectedId, selectedReviewPath]);

  useEffect(() => {
    if (view === 'reviews') void loadReviewForSelected();
  }, [loadReviewForSelected, view]);

  const loadSummaryForSelected = useCallback(async (refresh = false) => {
    if (!selectedId) {
      setReviewSummary(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      setReviewSummary(refresh
        ? await refreshWorkspaceReviewSummary(selectedId)
        : await getWorkspaceReviewSummary(selectedId));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err));
      setReviewSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadSummaryForSelected(false);
  }, [loadSummaryForSelected]);

  const loadReadinessForSelected = useCallback(async (refresh = false) => {
    if (!selectedId) {
      setMergeReadiness(null);
      return;
    }
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      setMergeReadiness(refresh
        ? await refreshWorkspaceMergeReadiness(selectedId)
        : await getWorkspaceMergeReadiness(selectedId));
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : String(err));
      setMergeReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadReadinessForSelected(false);
  }, [loadReadinessForSelected]);

  const handleRefreshWorkspaceState = async () => {
    await Promise.all([
      loadReviewForSelected(),
      loadSummaryForSelected(true),
      loadReadinessForSelected(true),
    ]);
  };

  const handleSelectReviewFile = async (path: string) => {
    if (!selectedId) return;
    setSelectedReviewPath(path);
    await loadDiffForWorkspace(selectedId, path);
  };

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
    setWorkspaces((current) => [workspace, ...current]);
    setSelectedId(workspace.id);
    setView('workspaces');
    setActivityItems(await listActivity());
    setModalOpen(false);
    setModalRepositoryId(undefined);
    setBranchFromWorkspaceId(null);
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

  const handleArchiveWorkspace = () => {
    if (!selectedId) return;
    setArchivedWorkspaceIds((current) => (
      current.includes(selectedId) ? current.filter((id) => id !== selectedId) : [...current, selectedId]
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

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const candidate = workspaces.find((workspace) => workspace.id === workspaceId);
    const label = candidate?.name ?? workspaceId;
    if (!window.confirm(`Delete workspace "${label}"? This cannot be undone.`)) return;
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
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[12px] text-forge-muted">Loading Review Cockpit…</div>}>
          <ReviewCockpit
            workspace={selected}
            selectedPath={selectedReviewPath}
            onSelectedPathChange={setSelectedReviewPath}
            targetCommentId={reviewTargetCommentId}
            onTargetCommentHandled={() => setReviewTargetCommentId(null)}
          />
        </Suspense>
      );
    }

    return <SettingsView settings={settingsState} onSettingsChange={setSettingsState} onRemoveRepository={(repositoryId) => void handleRemoveRepository(repositoryId)} />;
  };

  const isReviewView = view === 'reviews';

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-forge-bg text-forge-text antialiased selection:bg-forge-orange/25">
      <div className="flex flex-1 min-h-0">
        {!isReviewView && (
          <>
            <div className="shrink-0 h-full" style={{ width: `${sidebarWidth}px` }}>
              <Sidebar
                activeView={view}
                onNavigate={setView}
                repositories={settingsState?.discoveredRepositories ?? []}
                workspaces={workspaces}
                archivedWorkspaceIds={archivedWorkspaceIds}
                workspaceAttention={workspaceAttention}
                selectedWorkspaceId={selectedId}
                onSelectWorkspace={setSelectedId}
                onDeleteWorkspace={(workspaceId) => void handleDeleteWorkspace(workspaceId)}
                onRemoveRepository={(repositoryId) => void handleRemoveRepository(repositoryId)}
                onNewWorkspace={(repositoryId) => {
                  setModalRepositoryId(repositoryId);
                  setBranchFromWorkspaceId(null);
                  setModalOpen(true);
                }}
              />
            </div>
            <div
              role="separator"
              aria-label="Resize sidebar"
              onMouseDown={(event) => startResize(event, 'left')}
              className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
            />
          </>
        )}

        <div className="flex flex-1 min-w-0 min-h-0">
          <div className="relative flex flex-col flex-1 min-w-0 min-h-0 bg-gradient-to-br from-[#0b0d12] via-forge-bg to-[#08090c]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(249,115,22,0.06), transparent)',
              }}
            />

            <div className="relative z-[1] flex flex-1 flex-col min-h-0">
              {mainContent()}
            </div>
          </div>

          {!isReviewView && (
            <>
              <div
                role="separator"
                aria-label="Resize detail panel"
                onMouseDown={(event) => startResize(event, 'right')}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
              />
              <div className="relative z-[2] shrink-0 h-full shadow-forge-panel" style={{ width: `${detailPanelWidth}px` }}>
                <DetailPanel
                  workspace={selected}
                  onOpenInCursor={() => void handleOpenInCursor()}
                  isArchived={selected ? archivedWorkspaceIds.includes(selected.id) : false}
                  onArchiveWorkspace={handleArchiveWorkspace}
                  onDeleteWorkspace={selected ? () => void handleDeleteWorkspace(selected.id) : undefined}
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
                />
              </div>
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
            changedFiles={reviewFiles}
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
          />
        </Suspense>
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
        <div className="pointer-events-none fixed bottom-4 z-50 flex w-[360px] flex-col gap-2" style={{ left: `${isReviewView ? 16 : sidebarWidth + 16}px` }}>
          {attentionToasts.map((toast) => (
            <button
              key={toast.id}
              onClick={() => {
                setView('workspaces');
                setSelectedId(toast.workspaceId);
                setAttentionToasts((current) => current.filter((item) => item.id !== toast.id));
              }}
              className="pointer-events-auto rounded-xl border border-forge-blue/25 bg-[#0b0d12]/95 px-3 py-2 text-left shadow-xl shadow-black/30 backdrop-blur hover:bg-[#10131b]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-forge-blue">New workspace output</span>
                <span className="text-[10px] text-forge-muted">Open</span>
              </div>
              <p className="mt-1 truncate text-[12px] font-semibold text-forge-text">{toast.workspaceName}</p>
              <p className="mt-0.5 truncate text-[11px] text-forge-muted">{toast.text}</p>
            </button>
          ))}
        </div>
      )}

      {deepLinkNotice && (
        <div className="fixed right-4 top-4 z-50 max-w-[420px] rounded-xl border border-forge-blue/25 bg-[#0b0d12]/95 px-4 py-3 text-[12px] font-semibold text-forge-text shadow-xl shadow-black/30 backdrop-blur">
          {deepLinkNotice}
        </div>
      )}
    </div>
  );
}
