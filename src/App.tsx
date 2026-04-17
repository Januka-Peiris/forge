import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, FolderOpen, GitBranch, RefreshCw, Save } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { DetailPanel } from './components/detail/DetailPanel';
import { Sidebar, type NavView } from './components/layout/Sidebar';
import { WorkspaceTerminal } from './components/terminal/WorkspaceTerminal';
import { removeRepository, scanRepositories } from './lib/tauri-api/repositories';
import { createWorkspacePr } from './lib/tauri-api/pr-draft';
import { listAgentMemories, setAgentMemory, deleteAgentMemory } from './lib/tauri-api/agent-memory';
import type { AgentMemory } from './types/agent-memory';
import { getAiModelSettings, getSettings, getSetting, setSetting, resolveGitRepositoryPath, saveAiModelSettings, saveHasCompletedEnvCheck, saveRepoRoots } from './lib/tauri-api/settings';
import type { AiModelSettings } from './types/settings';
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
import type { ActivityItem, AppSettings, CreateWorkspaceInput, DiscoveredRepository, EnvironmentCheckItem, TerminalOutputEvent, Workspace, WorkspaceAttention } from './types';


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

interface EnvironmentSetupModalProps {
  items: EnvironmentCheckItem[];
  busy: boolean;
  onContinue: () => void;
  onRerun: () => void;
}

function EnvironmentSetupModal({ items, busy, onContinue, onRerun }: EnvironmentSetupModalProps) {
  const copyCommand = async (command: string) => {
    await navigator.clipboard?.writeText(command);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-forge-border bg-forge-surface p-4 shadow-2xl">
        <div className="mb-3">
          <h2 className="text-[16px] font-bold text-forge-text">Environment Setup</h2>
          <p className="mt-1 text-[12px] text-forge-muted">Forge checked your local tools. Missing tools will not block app usage.</p>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.binary} className="rounded-xl border border-forge-border bg-forge-bg/80 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={item.status === 'ok' ? 'text-forge-green' : item.status === 'missing' ? 'text-forge-red' : 'text-forge-yellow'}>
                    {item.status === 'ok' ? '✓' : item.status === 'missing' ? '✗' : '?'}
                  </span>
                  <span className="text-[13px] font-semibold text-forge-text">{item.name}</span>
                  {item.optional && <span className="rounded-full border border-forge-border px-1.5 py-0.5 text-[9px] text-forge-muted">optional</span>}
                </div>
                <span className="text-[10px] uppercase tracking-widest text-forge-muted">{item.status}</span>
              </div>
              {item.status !== 'ok' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-forge-border bg-black/20 px-2 py-1.5">
                  <span className="text-[11px] text-forge-muted">Run:</span>
                  <code className="flex-1 truncate text-[11px] text-forge-text">{item.fix}</code>
                  <button
                    type="button"
                    onClick={() => void copyCommand(item.fix)}
                    className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10"
                  >
                    <Copy className="inline h-3 w-3" /> Copy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onContinue} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-[12px] font-semibold text-forge-muted hover:bg-white/10">Continue anyway</button>
          <button type="button" disabled={busy} onClick={onRerun} className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-3 py-2 text-[12px] font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50">
            {busy ? 'Checking…' : 'Re-run checks'}
          </button>
        </div>
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


const AGENT_MODELS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (1M context)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (1M context)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast + capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast + cheap)' },
];

const ORCHESTRATOR_MODELS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (1M context)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (1M context)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast + capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast + cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI, fast)' },
  { value: 'o3', label: 'o3 (OpenAI, reasoning)' },
  { value: 'o4-mini', label: 'o4-mini (OpenAI, reasoning, fast)' },
];

function AiModelsCard() {
  const [modelSettings, setModelSettings] = useState<AiModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getAiModelSettings().then(setModelSettings).catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const handleSave = async () => {
    if (!modelSettings) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveAiModelSettings(modelSettings);
      setModelSettings(saved);
      setMessage('Model settings saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!modelSettings) return <div className="text-[12px] text-forge-muted">Loading model settings…</div>;

  return (
    <div className="rounded-xl border border-forge-border bg-forge-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-forge-text">AI Models</h2>
        <p className="text-[11px] text-forge-muted mt-0.5">Choose which Claude model powers each role. Changes take effect immediately.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Coding Agent model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used for all workspace terminal sessions (the agent that writes code).</p>
          <select
            value={modelSettings.agentModel}
            onChange={(e) => setModelSettings({ ...modelSettings, agentModel: e.target.value })}
            className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-[12px] text-forge-text focus:outline-none focus:border-forge-blue/50"
          >
            {AGENT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Orchestrator brain model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used by the Orchestrator to analyse workspaces and dispatch agent prompts. Supports Claude and OpenAI models.</p>
          <select
            value={modelSettings.orchestratorModel}
            onChange={(e) => setModelSettings({ ...modelSettings, orchestratorModel: e.target.value })}
            className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-[12px] text-forge-text focus:outline-none focus:border-forge-blue/50"
          >
            {ORCHESTRATOR_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-4 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-forge-orange hover:bg-orange-500 disabled:opacity-60 text-[12px] font-semibold text-white"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving…' : 'Save model settings'}
      </button>
    </div>
  );
}

function RepoContextCard() {
  const [contextEnabled, setContextEnabled] = useState(true);

  useEffect(() => {
    void getSetting('context_enabled').then((val) => {
      if (val === 'false') setContextEnabled(false);
    }).catch(() => undefined);
  }, []);

  return (
    <div className="rounded-xl border border-forge-border bg-forge-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-forge-text">Repo Context</h2>
        <p className="text-[11px] text-forge-muted mt-0.5">Inject repo map and diffs into the first prompt of each session.</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-forge-text/70">Inject context into prompts</p>
          <p className="text-[11px] text-forge-muted mt-0.5">Sends repo map + diffs at session start</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !contextEnabled;
            setContextEnabled(next);
            void setSetting('context_enabled', next ? 'true' : 'false').catch(console.error);
          }}
          className={`relative w-10 h-5 rounded-full transition-colors ${contextEnabled ? 'bg-blue-500' : 'bg-white/20'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${contextEnabled ? 'left-5' : 'left-0.5'}`} />
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
  const [repositories, setRepositories] = useState<DiscoveredRepository[]>(settings?.discoveredRepositories ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ repoId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setRepositories(settings?.discoveredRepositories ?? []);
  }, [settings]);

  // Close context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const isTauriShell = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const handleAddRepository = async () => {
    setMessage(null);
    if (!isTauriShell()) {
      setMessage('Folder picker is only available in the Forge desktop app.');
      return;
    }
    setBusy(true);
    try {
      const picked = await open({ directory: true, multiple: false, title: 'Choose a Git repository' });
      if (picked === null) return;
      const toplevel = await resolveGitRepositoryPath(picked);
      const existing = repositories.map((r) => r.path);
      const merged = Array.from(new Set([...existing, toplevel])).sort();
      const saved = await saveRepoRoots({ repoRoots: merged });
      const result = await scanRepositories();
      setRepositories(result.repositories);
      onSettingsChange({ repoRoots: result.repoRoots, discoveredRepositories: result.repositories, hasCompletedEnvCheck: settings?.hasCompletedEnvCheck ?? false });
      setMessage(`Added — ${result.repositories.length} repositor${result.repositories.length === 1 ? 'y' : 'ies'} in Forge.`);
      void saved;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await scanRepositories();
      setRepositories(result.repositories);
      onSettingsChange({ repoRoots: result.repoRoots, discoveredRepositories: result.repositories, hasCompletedEnvCheck: settings?.hasCompletedEnvCheck ?? false });
      setMessage(`Refreshed — ${result.repositories.length} repositor${result.repositories.length === 1 ? 'y' : 'ies'} found.`);
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
        <p className="text-[12px] text-forge-muted mt-1.5">Manage repositories and AI model configuration</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <AiModelsCard />

        <RepoContextCard />

        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-bold text-forge-text">Repositories</h2>
              <p className="text-[11px] text-forge-muted mt-0.5">Right-click a repo to remove it.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={busy}
                title="Re-scan all known roots"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-60 text-[11px] font-semibold text-forge-muted border border-forge-border"
              >
                <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleAddRepository()}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forge-blue/15 hover:bg-forge-blue/25 disabled:opacity-60 text-[12px] font-semibold text-forge-blue border border-forge-blue/30"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Add repository…
              </button>
            </div>
          </div>

          {message && <p className="mb-3 text-[12px] text-forge-muted">{message}</p>}

          {repositories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <p className="text-[13px] text-forge-muted">No repositories added yet</p>
              <p className="text-[12px] text-forge-muted mt-1">Click "Add repository…" and choose a Git repo folder.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ repoId: repo.id, x: e.clientX, y: e.clientY });
                  }}
                  className="rounded-lg border border-forge-border/80 bg-forge-surface/60 p-3 cursor-default select-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-forge-orange shrink-0" />
                        <h3 className="text-[13px] font-semibold text-forge-text truncate">{repo.name}</h3>
                        {repo.isDirty && <span className="text-[10px] text-forge-yellow">dirty</span>}
                      </div>
                      <p className="text-[11px] font-mono text-forge-muted mt-0.5 truncate">{repo.path}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-forge-text font-mono">{repo.currentBranch ?? 'detached'}</p>
                      <p className="text-[10px] text-forge-muted font-mono">{repo.head ?? 'no HEAD'}</p>
                    </div>
                  </div>

                  {repo.worktrees.length > 0 && (
                    <div className="mt-2 border-t border-forge-border/40 pt-2 space-y-0.5">
                      {repo.worktrees.map((worktree) => (
                        <div key={worktree.id} className="flex items-center gap-2 text-[11px]">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${worktree.isDirty ? 'bg-forge-yellow' : 'bg-forge-green'}`} />
                          <span className="font-mono text-forge-text">{worktree.branch ?? 'detached'}</span>
                          <span className="text-forge-muted font-mono truncate">{worktree.path}</span>
                          <span className="ml-auto text-forge-muted font-mono shrink-0">{worktree.head?.slice(0, 7) ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-forge-border bg-forge-surface shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onRemoveRepository(contextMenu.repoId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[12px] text-forge-red hover:bg-forge-red/10"
          >
            Remove from Forge
          </button>
        </div>
      )}
    </div>
  );
}

function MemoryView() {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMemories(await listAgentMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    if (!editKey.trim() || !editValue.trim()) return;
    setSaving(true);
    try {
      const entry = await setAgentMemory({ workspaceId: null, key: editKey.trim(), value: editValue.trim() });
      setMemories((prev) => {
        const idx = prev.findIndex((m) => m.key === entry.key && m.workspaceId == null);
        if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
        return [entry, ...prev];
      });
      setEditKey('');
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string, workspaceId: string | null) => {
    try {
      await deleteAgentMemory(key, workspaceId);
      setMemories((prev) => prev.filter((m) => !(m.key === key && m.workspaceId === workspaceId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <h1 className="text-[22px] font-bold text-forge-text tracking-tight">Agent Memory</h1>
        <p className="text-[12px] text-forge-muted mt-1.5">Persistent knowledge shared across workspaces and agent sessions</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Add / edit entry */}
        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <h2 className="text-[14px] font-bold text-forge-text mb-3">Add Global Memory</h2>
          <div className="flex gap-2 mb-2">
            <input
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="Key (e.g. auth-pattern)"
              className="flex-1 bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-[12px] font-mono text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50"
            />
          </div>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Value (e.g. JWT tokens stored in env.AUTH_SECRET)"
            rows={3}
            className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-[12px] text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50 resize-none mb-2"
          />
          {error && <p className="text-[11px] text-forge-red mb-2">{error}</p>}
          <button
            disabled={saving || !editKey.trim() || !editValue.trim()}
            onClick={() => void handleSave()}
            className="px-4 py-2 rounded-lg bg-forge-blue/15 hover:bg-forge-blue/25 disabled:opacity-50 text-[12px] font-semibold text-forge-blue border border-forge-blue/20"
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>

        {/* Memory list */}
        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-forge-text">Stored Memories</h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forge-blue/15 text-forge-blue border border-forge-blue/20">
              {memories.length} entries
            </span>
          </div>
          {loading ? (
            <p className="text-[12px] text-forge-muted">Loading…</p>
          ) : memories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <p className="text-[13px] text-forge-muted">No memories stored yet</p>
              <p className="text-[12px] text-forge-muted mt-1">Add entries above to share knowledge across workspaces.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={`${m.workspaceId}-${m.key}`} className="rounded-lg border border-forge-border/80 bg-forge-surface/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-mono font-bold text-forge-text">{m.key}</span>
                        {m.workspaceId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-forge-blue/15 text-forge-blue border border-forge-blue/20">{m.workspaceId}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-forge-muted leading-relaxed whitespace-pre-wrap">{m.value}</p>
                    </div>
                    <button
                      onClick={() => void handleDelete(m.key, m.workspaceId)}
                      className="shrink-0 p-1.5 rounded text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                    >
                      ✕
                    </button>
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
        const result = await scanRepositories();
        if (cancelled) return;
        setSettingsState((current) =>
          current
            ? {
                ...current,
                repoRoots: result.repoRoots,
                discoveredRepositories: result.repositories,
              }
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
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[12px] text-forge-muted">Loading Review Cockpit…</div>}>
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
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-forge-bg text-forge-text antialiased selection:bg-forge-orange/25">
      <div className="flex flex-1 min-h-0">
        {!isReviewView && (
          sidebarCollapsed ? (
            <div
              className="shrink-0 h-full flex flex-col items-center justify-start bg-forge-surface border-r border-forge-border"
              style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
            >
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="mt-2.5 rounded-lg border border-forge-border bg-forge-surface p-1.5 text-forge-text shadow-md ring-1 ring-black/20 hover:bg-forge-card hover:border-forge-orange/35"
                title="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
              </button>
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
                  onDeleteWorkspace={(workspaceId) => void handleDeleteWorkspace(workspaceId)}
                  onRemoveRepository={(repositoryId) => void handleRemoveRepository(repositoryId)}
                  onNewWorkspace={(repositoryId) => {
                    setModalRepositoryId(repositoryId);
                    setBranchFromWorkspaceId(null);
                    setModalOpen(true);
                  }}
                  onCollapse={() => setSidebarCollapsed(true)}
                  onFilteredWorkspacesChange={setDisplayedWorkspaces}
                />
              </div>
              <div
                role="separator"
                aria-label="Resize sidebar"
                onMouseDown={(event) => startResize(event, 'left')}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
              />
            </>
          )
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

          {showDetailPanel && (
            <>
              {!detailPanelCollapsed ? (
                <>
                  <div
                    role="separator"
                    aria-label="Resize detail panel"
                    onMouseDown={(event) => startResize(event, 'right')}
                    className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
                  />
                  <div
                    className="relative z-[2] shrink-0 h-full shadow-forge-panel"
                    style={{ width: `${detailPanelWidth}px` }}
                  >
                    <button
                      type="button"
                      onClick={() => setDetailPanelCollapsed(true)}
                      className="absolute top-2.5 left-2 z-[5] rounded-md border border-forge-border bg-white/5 p-1 text-forge-muted hover:bg-white/10"
                      title="Collapse detail panel"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
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
                  className="shrink-0 h-full flex items-start justify-center bg-forge-surface border-l border-forge-border"
                  style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
                >
                  <button
                    type="button"
                    onClick={() => setDetailPanelCollapsed(false)}
                    className="mt-2.5 rounded-md border border-forge-border bg-white/5 p-1 text-forge-muted hover:bg-white/10"
                    title="Expand detail panel"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
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
