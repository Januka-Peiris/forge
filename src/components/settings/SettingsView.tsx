import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { getAiModelSettings, getSetting, saveAiModelSettings, setSetting } from '../../lib/tauri-api/settings';
import type { AiModelSettings } from '../../types/settings';
import type { AppSettings } from '../../types';
import { AgentProfilesCard } from './AgentProfilesCard';
import { RepositoriesCard } from './RepositoriesCard';

const CLAUDE_AGENT_MODELS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (1M context)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (1M context)' },
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

const KIMI_AGENT_MODELS = [
  { value: 'kimi-for-coding', label: 'Kimi for Coding' },
  { value: 'kimi-k2.6', label: 'Kimi K2.6' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5' },
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

const NOTIFICATION_MIN_LEVELS = [
  { value: 'info', label: 'Info (all important notifications)' },
  { value: 'warn', label: 'Warn (warnings + errors)' },
  { value: 'error', label: 'Error only' },
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
        <p className="text-[11px] text-forge-muted mt-0.5">Choose default models for Claude, Codex, Kimi, and orchestrator roles. Changes take effect immediately.</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Claude default model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used when starting or focusing Claude chats.</p>
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
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Codex default model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used when starting or focusing Codex chats.</p>
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
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Kimi default model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used when starting or focusing Kimi chats.</p>
          <Select
            value={modelSettings.kimiAgentModel}
            onValueChange={(v) => setModelSettings({ ...modelSettings, kimiAgentModel: v })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIMI_AGENT_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              {!KIMI_AGENT_MODELS.some((m) => m.value === modelSettings.kimiAgentModel) && (
                <SelectItem value={modelSettings.kimiAgentModel}>
                  {modelSettings.kimiAgentModel}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Orchestrator brain model</label>
          <p className="text-[11px] text-forge-muted mb-2">Used by the Orchestrator to analyse workspaces and dispatch agent prompts. Supports Claude and OpenAI models.</p>
          <Select value={modelSettings.orchestratorModel} onValueChange={(v) => setModelSettings({ ...modelSettings, orchestratorModel: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORCHESTRATOR_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}
      <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving} className="mt-4">
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving…' : 'Save model settings'}
      </Button>
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
      ? 'Auto-rebase enabled. Forge will periodically rebase active workspaces and report conflicts.'
      : 'Auto-rebase disabled. Forge will not change branches in the background.');
    void setSetting('auto_rebase_enabled', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  const updateAutoSetup = (checked: boolean) => {
    setAutoSetupEnabled(checked);
    setMessage(checked
      ? 'Automatic setup enabled for new Forge-managed workspaces.'
      : 'Automatic setup disabled. New workspaces will wait for manual setup.');
    void setSetting('auto_run_setup_enabled', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  const updateRiskyScripts = (checked: boolean) => {
    setRiskyScriptsEnabled(checked);
    setMessage(checked
      ? 'Risky workspace scripts enabled. Forge will still record every configured script execution in activity.'
      : 'Risky workspace scripts blocked. Destructive setup/run/teardown commands will not start.');
    void setSetting('allow_risky_workspace_scripts', checked ? 'true' : 'false').catch((err) => {
      setMessage(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <div className="rounded-xl border border-forge-border bg-forge-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-forge-text">Trust & Safety</h2>
        <p className="text-[11px] text-forge-muted mt-0.5">Keep background Git behavior explicit and inspectable.</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[12px] text-forge-text/80">Auto-rebase active workspaces</p>
          <p className="text-[11px] text-forge-muted mt-0.5">
            Off by default. When enabled, Forge periodically rebases active workspaces onto their base branch and surfaces conflicts.
          </p>
        </div>
        <Switch checked={autoRebaseEnabled} onCheckedChange={updateAutoRebase} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-forge-border/60 pt-4">
        <div>
          <p className="text-[12px] text-forge-text/80">Auto-run setup for new workspaces</p>
          <p className="text-[11px] text-forge-muted mt-0.5">
            Off by default. When enabled, Forge immediately runs `.forge/config.json` setup commands after creating a managed worktree.
          </p>
        </div>
        <Switch checked={autoSetupEnabled} onCheckedChange={updateAutoSetup} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-forge-border/60 pt-4">
        <div>
          <p className="text-[12px] text-forge-text/80">Allow risky workspace scripts</p>
          <p className="text-[11px] text-forge-muted mt-0.5">
            Off by default. When disabled, configured setup/run/teardown scripts that look destructive are blocked and logged.
          </p>
        </div>
        <Switch checked={riskyScriptsEnabled} onCheckedChange={updateRiskyScripts} />
      </div>
      {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}
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
    <div className="rounded-xl border border-forge-border bg-forge-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-forge-text">Notifications</h2>
        <p className="text-[11px] text-forge-muted mt-0.5">Control notification severity and dedupe/folding behavior.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Minimum notification level</label>
          <p className="text-[11px] text-forge-muted mb-2">Notifications below this level are ignored.</p>
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
          <label className="text-[12px] font-semibold text-forge-text block mb-1">Dedupe window (seconds)</label>
          <p className="text-[11px] text-forge-muted mb-2">Repeated notifications in this window are folded into one item.</p>
          <div className="flex items-center gap-2">
            <input
              value={dedupeSecondsInput}
              onChange={(event) => setDedupeSecondsInput(event.target.value)}
              onBlur={saveDedupeSeconds}
              className="h-9 w-28 rounded-md border border-forge-border bg-forge-bg px-2 text-[12px] text-forge-text focus:border-forge-blue/40 focus:outline-none"
              inputMode="numeric"
              aria-label="Notification dedupe seconds"
            />
            <Button type="button" size="sm" onClick={saveDedupeSeconds}>
              Save
            </Button>
          </div>
        </div>
      </div>

      {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}
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
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <h1 className="text-[22px] font-bold text-forge-text tracking-tight">Settings</h1>
        <p className="text-[12px] text-forge-muted mt-1.5">Manage repositories and AI model configuration</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <AiModelsCard />
        <NotificationSettingsCard />
        <AgentProfilesCard />
        <RepoContextCard />
        <TrustAndSafetyCard />
        <RepositoriesCard
          settings={settings}
          onSettingsChange={onSettingsChange}
          onRemoveRepository={onRemoveRepository}
        />
      </div>
    </div>
  );
}
