import { useCallback, useEffect, useState } from 'react';
import { Bot, Cpu, FolderOpen, GitBranch, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { open } from '@tauri-apps/plugin-dialog';
import { addRepository } from '../../lib/tauri-api/repositories';
import { getAiModelSettings, getSetting, setSetting, resolveGitRepositoryPath, saveAiModelSettings } from '../../lib/tauri-api/settings';
import { checkEnvironment } from '../../lib/tauri-api/environment';
import { listAppAgentProfiles, listWorkspaceAgentProfiles, saveAppAgentProfiles } from '../../lib/tauri-api/agent-profiles';
import { diagnoseLocalLlmProfile, listLocalLlmModels } from '../../lib/tauri-api/local-llms';
import { formatCommandPreview, parseCommandArgs } from '../../lib/shell-args';
import { getStoredAgentProfileId, setStoredAgentProfileId } from '../../lib/hooks/useAgentProfile';
import type { AiModelSettings } from '../../types/settings';
import type { AgentProfile, AppSettings, DiscoveredRepository, LocalLlmModel, LocalLlmProfileDiagnostic } from '../../types';

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
          <Select value={modelSettings.agentModel} onValueChange={(v) => setModelSettings({ ...modelSettings, agentModel: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AGENT_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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

const DEFAULT_PROFILE_IDS = new Set(['claude-default', 'claude-plan', 'codex-default', 'codex-high', 'shell']);

function AgentProfilesCard() {
  const [effectiveProfiles, setEffectiveProfiles] = useState<AgentProfile[]>([]);
  const [appProfiles, setAppProfiles] = useState<AgentProfile[]>([]);
  const [ollamaModels, setOllamaModels] = useState<LocalLlmModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'ok' | 'missing' | 'unknown'>('unknown');
  const [defaultProfileId, setDefaultProfileId] = useState(() => getStoredAgentProfileId());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, LocalLlmProfileDiagnostic>>({});
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [label, setLabel] = useState('Ollama Qwen Coder');
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState('qwen2.5-coder');
  const [command, setCommand] = useState('ollama');
  const [argsText, setArgsText] = useState('run qwen2.5-coder');
  const [endpoint, setEndpoint] = useState('http://localhost:11434');

  const refresh = useCallback(async () => {
    const [effective, app, env, modelsResult] = await Promise.all([
      listWorkspaceAgentProfiles(null),
      listAppAgentProfiles(),
      checkEnvironment().catch(() => []),
      listLocalLlmModels('ollama')
        .then((models) => ({ models, error: null as string | null }))
        .catch((err) => ({ models: [] as LocalLlmModel[], error: err instanceof Error ? err.message : String(err) })),
    ]);
    setEffectiveProfiles(effective);
    setAppProfiles(app);
    if (!effective.some((profile) => profile.id === defaultProfileId)) {
      const fallback = effective.find((profile) => profile.agent !== 'shell')?.id ?? 'claude-default';
      setDefaultProfileId(fallback);
      setStoredAgentProfileId(fallback);
    }
    setOllamaModels(modelsResult.models);
    const ollama = env.find((item) => item.binary === 'ollama');
    setOllamaStatus((ollama?.status as 'ok' | 'missing' | undefined) ?? 'unknown');
    if (modelsResult.error && ollama?.status === 'ok') {
      setMessage(modelsResult.error);
    }
  }, [defaultProfileId]);

  useEffect(() => {
    void refresh().catch((err) => setMessage(err instanceof Error ? err.message : String(err)));
  }, [refresh]);

  const saveLocalProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const id = editingProfileId ?? uniqueProfileId(slug(label || model || provider || 'local-llm'), appProfiles);
      const nextProfile: AgentProfile = {
        id,
        label: label.trim() || id,
        agent: 'local_llm',
        command: command.trim() || (provider === 'ollama' ? 'ollama' : ''),
        args: parseCommandArgs(argsText),
        model: model.trim() || null,
        reasoning: null,
        mode: 'act',
        provider: provider.trim() || 'local',
        endpoint: endpoint.trim() || null,
        local: true,
        description: `Local ${provider} profile`,
        skills: [],
        templates: [],
      };
      const saved = await saveAppAgentProfiles([
        ...appProfiles.filter((profile) => profile.id !== id),
        nextProfile,
      ]);
      setAppProfiles(saved);
      setEditingProfileId(null);
      await refresh();
      setMessage(`${editingProfileId ? 'Updated' : 'Saved'} ${nextProfile.label}. It will appear in workspace agent profile pickers.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteAppProfile = async (profileId: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveAppAgentProfiles(appProfiles.filter((profile) => profile.id !== profileId));
      setAppProfiles(saved);
      await refresh();
      setMessage('Agent profile removed.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const testProfile = async (profile: AgentProfile) => {
    setMessage(null);
    try {
      const diagnostic = await diagnoseLocalLlmProfile(profile);
      setDiagnostics((current) => ({ ...current, [profile.id]: diagnostic }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const copyProfileJson = async (profile: AgentProfile) => {
    const json = JSON.stringify(
      {
        agentProfiles: [
          {
            id: profile.id,
            label: profile.label,
            agent: profile.agent,
            provider: profile.provider,
            endpoint: profile.endpoint,
            local: profile.local,
            command: profile.command,
            args: profile.args,
            model: profile.model,
            mode: profile.mode,
            description: profile.description,
          },
        ],
      },
      null,
      2,
    );
    try {
      await navigator.clipboard?.writeText(json);
      setMessage(`Copied ${profile.label} as .forge/config.json agentProfiles JSON.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const loadProfileIntoForm = (profile: AgentProfile, mode: 'edit' | 'template') => {
    setEditingProfileId(mode === 'edit' ? profile.id : null);
    setLabel(mode === 'edit' ? profile.label : `${profile.label} Copy`);
    setProvider(profile.provider ?? (profile.agent === 'local_llm' ? 'custom' : profile.agent));
    setModel(profile.model ?? '');
    setCommand(profile.command);
    setArgsText(formatCommandPreview('', profile.args));
    setEndpoint(profile.endpoint ?? '');
    setMessage(mode === 'edit' ? `Editing ${profile.label}.` : `Loaded ${profile.label} as a new profile template.`);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setLabel('Ollama Qwen Coder');
    setProvider('ollama');
    setModel('qwen2.5-coder');
    setCommand('ollama');
    setArgsText('run qwen2.5-coder');
    setEndpoint('http://localhost:11434');
  };

  const appProfileIds = new Set(appProfiles.map((profile) => profile.id));
  const selectableProfiles = effectiveProfiles.filter((profile) => profile.agent !== 'shell');

  return (
    <div className="rounded-xl border border-forge-border bg-forge-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-forge-text">Agent Profiles & Local LLMs</h2>
          <p className="mt-0.5 text-[11px] text-forge-muted">Configure inspectable CLI-backed agents. Repo `.forge/config.json` profiles can still override these.</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ollamaStatus === 'ok' ? 'border-forge-green/30 text-forge-green' : 'border-forge-border text-forge-muted'}`}>
          Ollama {ollamaStatus}
        </span>
      </div>

      <div className="mb-4 rounded-lg border border-forge-border/70 bg-black/10 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-forge-text">Default workspace agent profile</p>
            <p className="text-[11px] text-forge-muted">Used by workspace/review composers unless a workspace-specific selection is already active.</p>
          </div>
          <Select
            value={defaultProfileId}
            onValueChange={(value) => {
              setDefaultProfileId(value);
              setStoredAgentProfileId(value);
              setMessage(`Default agent profile set to ${effectiveProfiles.find((profile) => profile.id === value)?.label ?? value}.`);
            }}
          >
            <SelectTrigger className="w-full md:w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {selectableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.label}{profile.local ? ' · local' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {effectiveProfiles.map((profile) => {
          const source = appProfileIds.has(profile.id) ? 'app' : DEFAULT_PROFILE_IDS.has(profile.id) ? 'built-in' : 'repo';
          const diagnostic = diagnostics[profile.id];
          return (
            <div key={profile.id} className="rounded-lg border border-forge-border/70 bg-forge-surface/50 p-3">
              <div className="flex items-start gap-2">
                {profile.local ? <Cpu className="mt-0.5 h-3.5 w-3.5 text-forge-green" /> : <Bot className="mt-0.5 h-3.5 w-3.5 text-forge-orange" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-semibold text-forge-text">{profile.label}</p>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-forge-muted">{source}</span>
                    {profile.local && <span className="rounded bg-forge-green/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-forge-green">local</span>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-forge-muted">
                    {formatCommandPreview(profile.command, profile.args)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-forge-muted">
                    {profile.provider ?? profile.agent}{profile.model ? ` · ${profile.model}` : ''}{profile.endpoint ? ` · ${profile.endpoint}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {profile.local && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => void testProfile(profile)} title="Test profile">
                      Test
                    </Button>
                  )}
                  {source === 'app' && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => loadProfileIntoForm(profile, 'edit')} title="Edit app profile">
                      Edit
                    </Button>
                  )}
                  {profile.local && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => void copyProfileJson(profile)} title="Copy .forge/config.json snippet">
                      Copy
                    </Button>
                  )}
                  {profile.local && source !== 'app' && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => loadProfileIntoForm(profile, 'template')} title="Use as template">
                      Use
                    </Button>
                  )}
                  {source === 'app' && (
                    <Button variant="ghost" size="icon-xs" disabled={saving} onClick={() => void deleteAppProfile(profile.id)} title="Delete app profile">
                      <Trash2 className="h-3.5 w-3.5 text-forge-red" />
                    </Button>
                  )}
                </div>
              </div>
              {diagnostic && (
                <div className="mt-2 rounded border border-forge-border/50 bg-black/15 p-2">
                  <p className={`text-[11px] font-semibold ${diagnostic.status === 'ok' ? 'text-forge-green' : diagnostic.status === 'error' ? 'text-forge-red' : 'text-forge-yellow'}`}>
                    {diagnostic.summary}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-forge-muted">{diagnostic.commandPreview}</p>
                  <div className="mt-1 space-y-0.5">
                    {diagnostic.checks.map((check) => (
                      <p key={check.name} className="text-[10px] text-forge-muted">
                        <span className={check.status === 'ok' ? 'text-forge-green' : check.status === 'error' ? 'text-forge-red' : 'text-forge-yellow'}>
                          {check.name}: {check.status}
                        </span>
                        {' · '}
                        {check.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-forge-border/70 bg-black/10 p-3">
        <div className="mb-3">
          <p className="text-[12px] font-semibold text-forge-text">
            {editingProfileId ? 'Edit app-level local profile' : 'Add app-level local profile'}
          </p>
          <p className="text-[11px] text-forge-muted">
            {editingProfileId ? `Editing ${editingProfileId}.` : 'Saved for all workspaces. Commands stay visible and run in normal Forge terminals.'}
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <LabeledInput label="Label" value={label} onChange={setLabel} />
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-forge-text">Provider</label>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value);
                if (value === 'ollama') {
                  setCommand('ollama');
                  setEndpoint('http://localhost:11434');
                  setArgsText(`run ${model || 'llama3.2'}`);
                } else if (value === 'lm-studio') {
                  setEndpoint('http://localhost:1234/v1');
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="lm-studio">LM Studio</SelectItem>
                <SelectItem value="llama.cpp">llama.cpp</SelectItem>
                <SelectItem value="openai-compatible">OpenAI-compatible local</SelectItem>
                <SelectItem value="custom">Custom CLI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {provider === 'ollama' && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-forge-text">Installed Ollama model</label>
              <Select
                value={ollamaModels.some((item) => item.name === model) ? model : ''}
                onValueChange={(value) => {
                  setModel(value);
                  setArgsText(`run ${value}`);
                  if (!label.trim() || label.startsWith('Ollama ')) {
                    setLabel(`Ollama ${value}`);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder={ollamaModels.length ? 'Choose installed model…' : 'No models discovered'} /></SelectTrigger>
                <SelectContent>
                  {ollamaModels.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name}{item.size ? ` · ${item.size}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <LabeledInput label="Model" value={model} onChange={(value) => { setModel(value); if (provider === 'ollama') setArgsText(`run ${value || 'llama3.2'}`); }} />
          <LabeledInput label="Endpoint metadata" value={endpoint} onChange={setEndpoint} />
          <LabeledInput label="Command" value={command} onChange={setCommand} />
            <LabeledInput label="Args" value={argsText} onChange={setArgsText} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-forge-muted">
            {provider === 'ollama' && ollamaModels.length > 0
              ? `${ollamaModels.length} Ollama model(s) discovered.`
              : <>Tip: for Ollama run <span className="font-mono text-forge-text/80">ollama pull {model || 'llama3.2'}</span> first. Args support single/double quotes.</>}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={saving}>
              Refresh models
            </Button>
            {editingProfileId && (
              <Button size="sm" variant="secondary" onClick={resetProfileForm} disabled={saving}>
                Cancel edit
              </Button>
            )}
            <Button size="sm" onClick={() => void saveLocalProfile()} disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : editingProfileId ? 'Update profile' : 'Save local profile'}
            </Button>
          </div>
        </div>
      </div>
      {message && <p className="mt-3 text-[12px] text-forge-muted">{message}</p>}
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-forge-text">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'local-llm';
}

function uniqueProfileId(base: string, profiles: AgentProfile[]): string {
  const existing = new Set(profiles.map((profile) => profile.id));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
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
  const [repositories, setRepositories] = useState<DiscoveredRepository[]>(settings?.discoveredRepositories ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ repoId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setRepositories(settings?.discoveredRepositories ?? []);
  }, [settings]);

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
      const repos = await addRepository(toplevel);
      setRepositories(repos);
      onSettingsChange({ repoRoots: repos.map((r) => r.path), discoveredRepositories: repos, hasCompletedEnvCheck: settings?.hasCompletedEnvCheck ?? false });
      setMessage(`Added — ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} in Forge.`);
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
        <AgentProfilesCard />
        <RepoContextCard />
        <TrustAndSafetyCard />

        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-bold text-forge-text">Repositories</h2>
              <p className="text-[11px] text-forge-muted mt-0.5">Right-click a repo to remove it.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleAddRepository()}
              disabled={busy}
              className="text-forge-blue hover:bg-forge-blue/15 border border-forge-blue/30"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Add repository…
            </Button>
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

      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-forge-border bg-forge-surface shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onRemoveRepository(contextMenu.repoId);
              setContextMenu(null);
            }}
            className="w-full justify-start text-forge-red hover:bg-forge-red/10"
          >
            Remove from Forge
          </Button>
        </div>
      )}
    </div>
  );
}
