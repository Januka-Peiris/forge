import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen, PlugZap, Save } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { getAiModelSettings, getSetting, saveAiModelSettings, saveManagedWorkspacesRoot, setSetting } from '../../lib/tauri-api/settings';
import type { AiModelSettings } from '../../types/settings';
import type { AppSettings } from '../../types';
import { AgentProfilesCard } from './AgentProfilesCard';
import { RepositoriesCard } from './RepositoriesCard';
import { RepositoryRelationshipsCard } from './RepositoryRelationshipsCard';
import { cn } from '../../lib/cn';
import {
  AGENT_PROVIDER_OPTIONS,
  type AgentProviderId,
} from '../../lib/active-agent-providers';
import { useActiveAgentProviders } from '../../lib/hooks/useActiveAgentProviders';

const CLAUDE_AGENT_MODELS = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-opus-4-8[1m]', label: 'Claude Opus 4.8 (1M context)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-opus-4-7[1m]', label: 'Claude Opus 4.7 (1M context)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-opus-4-6[1m]', label: 'Claude Opus 4.6 (1M context)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast + capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast + cheap)' },
];

const CODEX_AGENT_MODELS = [
  { value: 'gpt-5.4', label: 'GPT-5.4 (Flagship)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Spark' },
  { value: 'o4-mini', label: 'o4-mini' },
];

const ORCHESTRATOR_MODELS = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-opus-4-8[1m]', label: 'Claude Opus 4.8 (1M context)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (1M context)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (1M context)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast + capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast + cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI, fast)' },
  { value: 'o3', label: 'o3 (OpenAI, reasoning)' },
  { value: 'o4-mini', label: 'o4-mini (OpenAI, reasoning, fast)' },
];

const NOTIFICATION_MIN_LEVELS = [
  { value: 'info', label: 'Info (all important notifications)' },
  { value: 'warn', label: 'Warn (warnings + errors)' },
  { value: 'error', label: 'Error only' },
];

function SettingsGroup({
  title,
  description,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  meta: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-mn-border bg-mn-card/70">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-mn-muted transition-transform',
                !open && '-rotate-90',
              )}
            />
            <h2 className="text-[14px] font-bold text-mn-text">{title}</h2>
          </div>
          <p className="mt-0.5 pl-6 text-[11px] text-mn-muted">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-mn-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mn-muted">
          {meta}
        </span>
      </button>
      <div className={cn('space-y-4 border-t border-mn-border/60 bg-mn-bg/20 p-3', !open && 'hidden')}>
        {children}
      </div>
    </section>
  );
}

function AgentSetupCard({
  activeProviderIds,
  detectedProviderIds,
  loading,
  error,
  hasSavedPreference,
  onSave,
}: {
  activeProviderIds: ReadonlySet<AgentProviderId>;
  detectedProviderIds: ReadonlySet<AgentProviderId>;
  loading: boolean;
  error: string | null;
  hasSavedPreference: boolean;
  onSave: (ids: readonly AgentProviderId[]) => Promise<void>;
}) {
  const [savingProviderId, setSavingProviderId] = useState<AgentProviderId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const updateProvider = async (providerId: AgentProviderId, checked: boolean) => {
    const next = new Set(activeProviderIds);
    if (checked) next.add(providerId);
    else next.delete(providerId);
    setSavingProviderId(providerId);
    setMessage(null);
    try {
      await onSave(Array.from(next));
      const label = AGENT_PROVIDER_OPTIONS.find((option) => option.id === providerId)?.label ?? providerId;
      setMessage(`${label} ${checked ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProviderId(null);
    }
  };

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-mn-cyan" />
            <h2 className="text-[14px] font-bold text-mn-text">Agent Setup</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-mn-muted">
            Pick the providers you actually use. Fresh installs default to detected tools only.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-mn-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mn-muted">
          {activeProviderIds.size} active
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {AGENT_PROVIDER_OPTIONS.map((provider) => {
          const active = activeProviderIds.has(provider.id);
          const detected = detectedProviderIds.has(provider.id);
          return (
            <div
              key={provider.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                active ? 'border-mn-cyan/35 bg-mn-cyan/5' : 'border-mn-border/70 bg-black/10',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-mn-text">{provider.shortLabel}</p>
                  <p className={cn('mt-0.5 text-[10px]', detected ? 'text-mn-cyan' : 'text-mn-muted')}>
                    {detected ? 'Detected' : provider.id === 'openai' ? 'Manual' : 'Missing'}
                  </p>
                </div>
                <Switch
                  checked={active}
                  disabled={loading || savingProviderId === provider.id}
                  onCheckedChange={(checked) => void updateProvider(provider.id, checked)}
                />
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] leading-snug text-mn-muted">{provider.setupHint}</p>
            </div>
          );
        })}
      </div>

      {(message || error || !hasSavedPreference) && (
        <p className="mt-3 text-[12px] text-mn-muted">
          {message || error || 'Using detected defaults until you toggle a provider.'}
        </p>
      )}
    </div>
  );
}

function AiModelsCard({ activeProviderIds }: { activeProviderIds: ReadonlySet<AgentProviderId> }) {
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

  if (!modelSettings) return <div className="text-[12px] text-mn-muted">Loading model settings…</div>;

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-mn-text">AI Models</h2>
        <p className="text-[11px] text-mn-muted mt-0.5">Choose defaults for active providers. Disabled provider values stay saved but hidden.</p>
      </div>
      <div className="space-y-4">
        {activeProviderIds.has('claude_code') && (
        <div>
          <label className="text-[12px] font-semibold text-mn-text block mb-1">Claude default model</label>
          <p className="text-[11px] text-mn-muted mb-2">Used when starting or focusing Claude chats.</p>
          <Select
            value={modelSettings.claudeAgentModel || modelSettings.agentModel}
            onValueChange={(v) => setModelSettings({ ...modelSettings, claudeAgentModel: v, agentModel: v })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLAUDE_AGENT_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              {!CLAUDE_AGENT_MODELS.some((m) => m.value === (modelSettings.claudeAgentModel || modelSettings.agentModel)) && (
                <SelectItem value={modelSettings.claudeAgentModel || modelSettings.agentModel}>
                  {modelSettings.claudeAgentModel || modelSettings.agentModel}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        )}
        {activeProviderIds.has('codex') && (
        <div>
          <label className="text-[12px] font-semibold text-mn-text block mb-1">Codex default model</label>
          <p className="text-[11px] text-mn-muted mb-2">Used when starting or focusing Codex chats.</p>
          <Select
            value={modelSettings.codexAgentModel}
            onValueChange={(v) => setModelSettings({ ...modelSettings, codexAgentModel: v })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CODEX_AGENT_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              {!CODEX_AGENT_MODELS.some((m) => m.value === modelSettings.codexAgentModel) && (
                <SelectItem value={modelSettings.codexAgentModel}>
                  {modelSettings.codexAgentModel}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        )}
        {!activeProviderIds.has('claude_code') && !activeProviderIds.has('codex') && (
          <p className="rounded-lg border border-mn-border/70 bg-black/10 p-3 text-[12px] text-mn-muted">
            No CLI agent providers are active. Enable Claude or Codex in Agent Setup to edit their model defaults.
          </p>
        )}
        <div>
          <label className="text-[12px] font-semibold text-mn-text block mb-1">Orchestrator brain model</label>
          <p className="text-[11px] text-mn-muted mb-2">Used by the Orchestrator to analyse workspaces and dispatch agent prompts. Supports Claude and OpenAI models.</p>
          <Select value={modelSettings.orchestratorModel} onValueChange={(v) => setModelSettings({ ...modelSettings, orchestratorModel: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORCHESTRATOR_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}
      <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving} className="mt-4">
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving…' : 'Save model settings'}
      </Button>
    </div>
  );
}


function ManagedWorkspacesCard({
  settings,
  onSettingsChange,
}: {
  settings: AppSettings | null;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const [path, setPath] = useState(settings?.managedWorkspacesRoot ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPath(settings?.managedWorkspacesRoot ?? '');
  }, [settings?.managedWorkspacesRoot]);

  const isTauriShell = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const savePath = async (nextPath = path) => {
    const trimmed = nextPath.trim();
    if (!trimmed) {
      setMessage('Choose a folder for managed workspaces.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveManagedWorkspacesRoot(trimmed);
      setPath(saved.managedWorkspacesRoot);
      onSettingsChange(saved);
      setMessage('Managed workspace location saved. New workspaces will be created there.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const chooseFolder = async () => {
    setMessage(null);
    if (!isTauriShell()) {
      setMessage('Folder picker is only available in the Mnemonic desktop app.');
      return;
    }
    try {
      const picked = await open({ directory: true, multiple: false, title: 'Choose managed workspace folder' });
      if (picked === null) return;
      setPath(picked);
      await savePath(picked);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-mn-text">Managed Workspace Location</h2>
          <p className="text-[11px] text-mn-muted mt-0.5">
            New Mnemonic-managed Git worktrees are created here, outside your main repo checkouts.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-mn-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mn-muted">
          worktrees
        </span>
      </div>
      <label className="text-[12px] font-semibold text-mn-text block mb-1">Folder</label>
      <div className="flex items-center gap-2">
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onBlur={() => void savePath()}
          className="h-9 min-w-0 flex-1 rounded-md border border-mn-border bg-mn-bg px-2 font-mono text-[12px] text-mn-text focus:border-mn-blue/40 focus:outline-none"
          placeholder="~/Mnemonic/workspaces"
          aria-label="Managed workspace folder"
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => void chooseFolder()} disabled={saving} className="text-mn-blue hover:bg-mn-blue/15 border border-mn-blue/30">
          <FolderOpen className="w-3.5 h-3.5" />
          Choose…
        </Button>
        <Button type="button" size="sm" onClick={() => void savePath()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-mn-muted">
        Existing workspaces stay where they are; this affects newly created managed worktrees.
      </p>
      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}
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
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-mn-text">Repo Context</h2>
        <p className="text-[11px] text-mn-muted mt-0.5">Inject repo map and diffs into the first prompt of each session.</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-mn-text/70">Inject context into prompts</p>
          <p className="text-[11px] text-mn-muted mt-0.5">Sends repo map + diffs at session start</p>
        </div>
        <Switch
          checked={contextEnabled}
          onCheckedChange={(checked) => {
            setContextEnabled(checked);
            void setSetting('context_enabled', checked ? 'true' : 'false').catch(console.error);
          }}
        />
      </div>
    </div>
  );
}

function TrustAndSafetyCard() {
  const [autoRebaseEnabled, setAutoRebaseEnabled] = useState(false);
  const [autoSetupEnabled, setAutoSetupEnabled] = useState(false);
  const [riskyScriptsEnabled, setRiskyScriptsEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getSetting('auto_rebase_enabled')
      .then((val) => setAutoRebaseEnabled(val === 'true'))
      .catch(() => undefined);
    void getSetting('auto_run_setup_enabled')
      .then((val) => setAutoSetupEnabled(val === 'true'))
      .catch(() => undefined);
    void getSetting('allow_risky_workspace_scripts')
      .then((val) => setRiskyScriptsEnabled(val === 'true'))
      .catch(() => undefined);
  }, []);

  const updateAutoRebase = (checked: boolean) => {
    setAutoRebaseEnabled(checked);
    setMessage(checked
      ? 'Auto-rebase enabled. Mnemonic will periodically rebase active workspaces and report conflicts.'
      : 'Auto-rebase disabled. Mnemonic will not change branches in the background.');
    void setSetting('auto_rebase_enabled', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  const updateAutoSetup = (checked: boolean) => {
    setAutoSetupEnabled(checked);
    setMessage(checked
      ? 'Automatic setup enabled for new Mnemonic-managed workspaces.'
      : 'Automatic setup disabled. New workspaces will wait for manual setup.');
    void setSetting('auto_run_setup_enabled', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  const updateRiskyScripts = (checked: boolean) => {
    setRiskyScriptsEnabled(checked);
    setMessage(checked
      ? 'Risky workspace scripts enabled. Mnemonic will still record every configured script execution in activity.'
      : 'Risky workspace scripts blocked. Destructive setup/run/teardown commands will not start.');
    void setSetting('allow_risky_workspace_scripts', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-mn-text">Trust & Safety</h2>
        <p className="text-[11px] text-mn-muted mt-0.5">Keep background Git behavior explicit and inspectable.</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[12px] text-mn-text/80">Auto-rebase active workspaces</p>
          <p className="text-[11px] text-mn-muted mt-0.5">
            Off by default. When enabled, Mnemonic periodically rebases active workspaces onto their base branch and surfaces conflicts.
          </p>
        </div>
        <Switch checked={autoRebaseEnabled} onCheckedChange={updateAutoRebase} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-mn-border/60 pt-4">
        <div>
          <p className="text-[12px] text-mn-text/80">Auto-run setup for new workspaces</p>
          <p className="text-[11px] text-mn-muted mt-0.5">
            Off by default. When enabled, Mnemonic immediately runs `.mnemonic/config.json` setup commands after creating a managed worktree.
          </p>
        </div>
        <Switch checked={autoSetupEnabled} onCheckedChange={updateAutoSetup} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-mn-border/60 pt-4">
        <div>
          <p className="text-[12px] text-mn-text/80">Allow risky workspace scripts</p>
          <p className="text-[11px] text-mn-muted mt-0.5">
            Off by default. When disabled, configured setup/run/teardown scripts that look destructive are blocked and logged.
          </p>
        </div>
        <Switch checked={riskyScriptsEnabled} onCheckedChange={updateRiskyScripts} />
      </div>
      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}
    </div>
  );
}

function NotificationSettingsCard() {
  const [minLevel, setMinLevel] = useState<'info' | 'warn' | 'error'>('info');
  const [dedupeSecondsInput, setDedupeSecondsInput] = useState('30');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getSetting('notifications_min_level')
      .then((value) => {
        if (value === 'info' || value === 'warn' || value === 'error') {
          setMinLevel(value);
        }
      })
      .catch(() => undefined);
    void getSetting('notifications_dedupe_seconds')
      .then((value) => {
        const parsed = Number(value ?? '');
        if (Number.isFinite(parsed) && parsed > 0) {
          setDedupeSecondsInput(String(Math.floor(parsed)));
        }
      })
      .catch(() => undefined);
  }, []);

  const saveMinLevel = (next: 'info' | 'warn' | 'error') => {
    setMinLevel(next);
    setMessage(null);
    void setSetting('notifications_min_level', next)
      .then(() => setMessage('Notification minimum level saved.'))
      .catch((err) => setMessage(err instanceof Error ? err.message : String(err)));
  };

  const saveDedupeSeconds = () => {
    const parsed = Number(dedupeSecondsInput.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage('Dedupe seconds must be a positive number.');
      return;
    }
    const next = String(Math.floor(parsed));
    setDedupeSecondsInput(next);
    setMessage(null);
    void setSetting('notifications_dedupe_seconds', next)
      .then(() => setMessage('Notification dedupe window saved.'))
      .catch((err) => setMessage(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-mn-text">Notifications</h2>
        <p className="text-[11px] text-mn-muted mt-0.5">Control notification severity and dedupe/folding behavior.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-mn-text block mb-1">Minimum notification level</label>
          <p className="text-[11px] text-mn-muted mb-2">Notifications below this level are ignored.</p>
          <Select value={minLevel} onValueChange={(value) => saveMinLevel(value as 'info' | 'warn' | 'error')}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NOTIFICATION_MIN_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-mn-text block mb-1">Dedupe window (seconds)</label>
          <p className="text-[11px] text-mn-muted mb-2">Repeated notifications in this window are folded into one item.</p>
          <div className="flex items-center gap-2">
            <input
              value={dedupeSecondsInput}
              onChange={(event) => setDedupeSecondsInput(event.target.value)}
              onBlur={saveDedupeSeconds}
              className="h-9 w-28 rounded-md border border-mn-border bg-mn-bg px-2 text-[12px] text-mn-text focus:border-mn-blue/40 focus:outline-none"
              inputMode="numeric"
              aria-label="Notification dedupe seconds"
            />
            <Button type="button" size="sm" onClick={saveDedupeSeconds}>
              Save
            </Button>
          </div>
        </div>
      </div>

      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}
    </div>
  );
}

export function SettingsView({
  settings,
  onSettingsChange,
  onRemoveRepository,
}: {
  settings: AppSettings | null;
  onSettingsChange: (settings: AppSettings) => void;
  onRemoveRepository: (repositoryId: string) => void;
}) {
  const activeProviders = useActiveAgentProviders();

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-mn-border shrink-0">
        <h1 className="text-[22px] font-bold text-mn-text tracking-tight">Settings</h1>
        <p className="text-[12px] text-mn-muted mt-1.5">Open a section only when you need to edit it.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <AgentSetupCard
          activeProviderIds={activeProviders.activeProviderSet}
          detectedProviderIds={activeProviders.detectedProviderSet}
          loading={activeProviders.loading}
          error={activeProviders.error}
          hasSavedPreference={activeProviders.hasSavedPreference}
          onSave={activeProviders.saveActiveProviderIds}
        />

        <SettingsGroup
          title="Essentials"
          description="Models, notifications, repo context, and automation safety."
          meta="4 panels"
        >
          <AiModelsCard activeProviderIds={activeProviders.activeProviderSet} />
          <NotificationSettingsCard />
          <RepoContextCard />
          <TrustAndSafetyCard />
        </SettingsGroup>

        <SettingsGroup
          title="Agents"
          description="Profiles, coordinator roles, and local model options."
          meta="1 panel"
        >
          <AgentProfilesCard activeProviderIds={activeProviders.activeProviderSet} />
        </SettingsGroup>

        <SettingsGroup
          title="Repositories & Federation"
          description="Registered repos, worktrees, relationships, and scope previews."
          meta={`${settings?.discoveredRepositories.length ?? 0} repos`}
        >
          <ManagedWorkspacesCard settings={settings} onSettingsChange={onSettingsChange} />
          <RepositoriesCard
            settings={settings}
            onSettingsChange={onSettingsChange}
            onRemoveRepository={onRemoveRepository}
          />
          <RepositoryRelationshipsCard repositories={settings?.discoveredRepositories ?? []} />
        </SettingsGroup>
      </div>
    </div>
  );
}
