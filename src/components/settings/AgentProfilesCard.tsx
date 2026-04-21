import { useCallback, useEffect, useState } from 'react';
import { Bot, Cpu, Plus, Trash2 } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

import {
  agentProfilesForPromptPicker,
  listAppAgentProfiles,
  listWorkspaceAgentProfiles,
  saveAppAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { checkEnvironment } from '../../lib/tauri-api/environment';
import { diagnoseLocalLlmProfile, listLocalLlmModels } from '../../lib/tauri-api/local-llms';
import { getStoredAgentProfileId, setStoredAgentProfileId } from '../../lib/hooks/useAgentProfile';
import { formatCommandPreview, parseCommandArgs } from '../../lib/shell-args';

import type { AgentProfile, LocalLlmModel, LocalLlmProfileDiagnostic } from '../../types';

const DEFAULT_PROFILE_IDS = new Set(['claude-default', 'claude-plan', 'codex-default', 'codex-high', 'kimi-default', 'shell']);

export function AgentProfilesCard() {
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
  const selectableProfiles = agentProfilesForPromptPicker(effectiveProfiles).filter((profile) => profile.agent !== 'shell');

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
