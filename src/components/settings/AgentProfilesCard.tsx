import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

import {
  agentProfilesForCoordinatorPicker,
  agentProfilesForPromptPicker,
  listAppAgentProfiles,
  listWorkspaceAgentProfiles,
  saveAppAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { getSetting, setSetting } from '../../lib/tauri-api/settings';
import { getStoredAgentProfileId, setStoredAgentProfileId } from '../../lib/hooks/useAgentProfile';
import { formatCommandPreview, parseCommandArgs } from '../../lib/shell-args';
import { isAgentProfileActive, type AgentProviderId } from '../../lib/active-agent-providers';

import type { AgentProfile } from '../../types';

const DEFAULT_PROFILE_IDS = new Set(['shell']);

export function AgentProfilesCard({ activeProviderIds }: { activeProviderIds: ReadonlySet<AgentProviderId> }) {
  const [effectiveProfiles, setEffectiveProfiles] = useState<AgentProfile[]>([]);
  const [appProfiles, setAppProfiles] = useState<AgentProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState(() => getStoredAgentProfileId());
  const [coordinatorBrainProfileId, setCoordinatorBrainProfileId] = useState<string>('');
  const [coordinatorCoderProfileId, setCoordinatorCoderProfileId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [label, setLabel] = useState('OpenAI GPT');
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-5.4');
  const [command, setCommand] = useState('openai');
  const [argsText, setArgsText] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1');

  const refresh = useCallback(async () => {
    const [effective, app] = await Promise.all([
      listWorkspaceAgentProfiles(null),
      listAppAgentProfiles(),
    ]);
    setEffectiveProfiles(effective);
    setAppProfiles(app);
    if (!effective.some((profile) => profile.id === defaultProfileId)) {
      const fallback = agentProfilesForPromptPicker(effective)[0]?.id ?? '';
      setDefaultProfileId(fallback);
      setStoredAgentProfileId(fallback);
    }
    const [savedBrain, savedCoder] = await Promise.all([
      getSetting('coordinator_default_brain_profile_id').catch(() => null),
      getSetting('coordinator_default_coder_profile_id').catch(() => null),
    ]);
    const coordinatorProfiles = agentProfilesForCoordinatorPicker(effective);
    const selectedBrain = coordinatorProfiles.some((profile) => profile.id === savedBrain) ? (savedBrain ?? '') : coordinatorProfiles[0]?.id ?? '';
    const selectedCoder = coordinatorProfiles.some((profile) => profile.id === savedCoder) ? (savedCoder ?? '') : coordinatorProfiles[0]?.id ?? '';
    setCoordinatorBrainProfileId(selectedBrain);
    setCoordinatorCoderProfileId(selectedCoder);
  }, [defaultProfileId]);

  useEffect(() => {
    void refresh().catch((err) => setMessage(err instanceof Error ? err.message : String(err)));
  }, [refresh]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const id = editingProfileId ?? uniqueProfileId(slug(label || model || provider || 'profile'), appProfiles);
      const isOpenAi = provider === 'openai';
      const nextProfile: AgentProfile = {
        id,
        label: label.trim() || id,
        agent: isOpenAi ? 'openai' : (provider.trim() || 'custom'),
        command: command.trim() || (isOpenAi ? 'openai' : ''),
        args: isOpenAi ? [] : parseCommandArgs(argsText),
        model: model.trim() || (isOpenAi ? 'gpt-5.4' : null),
        reasoning: null,
        mode: 'act',
        provider: provider.trim() || (isOpenAi ? 'openai' : 'custom'),
        endpoint: endpoint.trim() || (isOpenAi ? 'https://api.openai.com/v1' : null),
        local: false,
        description: isOpenAi ? 'OpenAI API profile for coordinator planning' : `Custom ${provider} profile`,
        skills: [],
        templates: [],
        rolePreference: 'brain',
        coordinatorEligible: true,
      };
      const saved = await saveAppAgentProfiles([
        ...appProfiles.filter((profile) => profile.id !== id),
        nextProfile,
      ]);
      setAppProfiles(saved);
      setEditingProfileId(null);
      await refresh();
      setMessage(`${editingProfileId ? 'Updated' : 'Saved'} ${nextProfile.label}.`);
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
            rolePreference: profile.rolePreference,
            coordinatorEligible: profile.coordinatorEligible,
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
    setProvider(profile.provider ?? profile.agent);
    setModel(profile.model ?? '');
    setCommand(profile.command);
    setArgsText(formatCommandPreview('', profile.args));
    setEndpoint(profile.endpoint ?? '');
    setMessage(mode === 'edit' ? `Editing ${profile.label}.` : `Loaded ${profile.label} as a new profile template.`);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setLabel('OpenAI GPT');
    setProvider('openai');
    setModel('gpt-5.4');
    setCommand('openai');
    setArgsText('');
    setEndpoint('https://api.openai.com/v1');
  };

  const appProfileIds = new Set(appProfiles.map((profile) => profile.id));
  const activeEffectiveProfiles = effectiveProfiles.filter((profile) => isAgentProfileActive(profile, activeProviderIds));
  const selectableProfiles = agentProfilesForPromptPicker(activeEffectiveProfiles).filter((profile) => profile.agent !== 'shell');
  const coordinatorProfiles = agentProfilesForCoordinatorPicker(activeEffectiveProfiles);

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-mn-text">Agent Profiles</h2>
        <p className="mt-0.5 text-[11px] text-mn-muted">Configure inspectable CLI-backed agents. Repo `.forge/config.json` profiles can still override these.</p>
      </div>

      <div className="mb-4 rounded-lg border border-mn-border/70 bg-black/10 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-mn-text">Default workspace agent profile</p>
            <p className="text-[11px] text-mn-muted">Used by workspace/review composers unless a workspace-specific selection is already active.</p>
          </div>
          <Select
            value={defaultProfileId}
            onValueChange={(value) => {
              setDefaultProfileId(value);
              setStoredAgentProfileId(value);
              setMessage(`Default agent profile set to ${effectiveProfiles.find((profile) => profile.id === value)?.label ?? value}.`);
            }}
          >
            <SelectTrigger className="w-full md:w-[260px]"><SelectValue placeholder="No terminal-capable profiles configured" /></SelectTrigger>
            <SelectContent>
              {selectableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-mn-border/70 bg-black/10 p-3">
        <div className="mb-2">
          <p className="text-[12px] font-semibold text-mn-text">Coordinator defaults</p>
          <p className="text-[11px] text-mn-muted">Used by workspace Coordinator mode unless a launch override is provided.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-mn-text">Brain profile</label>
            <Select
              value={coordinatorBrainProfileId}
              onValueChange={(value) => {
                setCoordinatorBrainProfileId(value);
                void setSetting('coordinator_default_brain_profile_id', value);
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose brain profile" /></SelectTrigger>
              <SelectContent>
                {coordinatorProfiles.map((profile) => (
                  <SelectItem key={`brain-${profile.id}`} value={profile.id}>
                    {profile.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-mn-text">Coder profile</label>
            <Select
              value={coordinatorCoderProfileId}
              onValueChange={(value) => {
                setCoordinatorCoderProfileId(value);
                void setSetting('coordinator_default_coder_profile_id', value);
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose coder profile" /></SelectTrigger>
              <SelectContent>
                {coordinatorProfiles.map((profile) => (
                  <SelectItem key={`coder-${profile.id}`} value={profile.id}>
                    {profile.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {activeEffectiveProfiles.map((profile) => {
          const source = appProfileIds.has(profile.id) ? 'app' : DEFAULT_PROFILE_IDS.has(profile.id) ? 'built-in' : 'repo';
          return (
            <div key={profile.id} className="rounded-lg border border-mn-border/70 bg-mn-surface/50 p-3">
              <div className="flex items-start gap-2">
                <Bot className="mt-0.5 h-3.5 w-3.5 text-mn-orange" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-semibold text-mn-text">{profile.label}</p>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-mn-muted">{source}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-mn-muted">
                    {formatCommandPreview(profile.command, profile.args)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-mn-muted">
                    {profile.provider ?? profile.agent}{profile.model ? ` · ${profile.model}` : ''}{profile.endpoint ? ` · ${profile.endpoint}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {source === 'app' && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => loadProfileIntoForm(profile, 'edit')} title="Edit app profile">
                      Edit
                    </Button>
                  )}
                  <Button variant="ghost" size="xs" disabled={saving} onClick={() => void copyProfileJson(profile)} title="Copy .forge/config.json snippet">
                    Copy
                  </Button>
                  {source !== 'app' && (
                    <Button variant="ghost" size="xs" disabled={saving} onClick={() => loadProfileIntoForm(profile, 'template')} title="Use as template">
                      Use
                    </Button>
                  )}
                  {source === 'app' && (
                    <Button variant="ghost" size="icon-xs" disabled={saving} onClick={() => void deleteAppProfile(profile.id)} title="Delete app profile">
                      <Trash2 className="h-3.5 w-3.5 text-mn-red" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {activeEffectiveProfiles.length === 0 && (
          <div className="rounded-lg border border-mn-border/70 bg-black/10 p-3 text-[12px] text-mn-muted">
            No active agent providers. Enable a provider in Agent Setup to choose defaults or manage profiles.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-mn-border/70 bg-black/10 p-3">
        <div className="mb-3">
          <p className="text-[12px] font-semibold text-mn-text">
            {editingProfileId ? 'Edit app-level profile' : 'Add app-level profile'}
          </p>
          <p className="text-[11px] text-mn-muted">
            {editingProfileId ? `Editing ${editingProfileId}.` : 'Saved for all workspaces. Use OpenAI for coordinator planning or add custom API-compatible providers.'}
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <LabeledInput label="Label" value={label} onChange={setLabel} />
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-mn-text">Provider</label>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value);
                if (value === 'openai') {
                  setCommand('openai');
                  setEndpoint('https://api.openai.com/v1');
                  setModel('gpt-5.4');
                  setArgsText('');
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI API</SelectItem>
                <SelectItem value="openai-compatible">OpenAI-compatible API</SelectItem>
                <SelectItem value="custom">Custom CLI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <LabeledInput label="Model" value={model} onChange={setModel} placeholder={provider === 'openai' ? 'gpt-5.4' : 'model-name'} />
          <LabeledInput label="Endpoint" value={endpoint} onChange={setEndpoint} />
          <LabeledInput label="Command" value={command} onChange={setCommand} placeholder={provider === 'openai' ? 'openai' : 'command'} />
          <LabeledInput label="Args" value={argsText} onChange={setArgsText} placeholder={provider === 'openai' ? '(unused for OpenAI API)' : 'arg1 arg2'} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-mn-muted">
            {provider === 'openai'
              ? <>Requires <span className="font-mono text-mn-text/80">OPENAI_API_KEY</span> in the Mnemonic app environment.</>
              : 'Configure a custom API-compatible provider.'}
          </p>
          <div className="flex items-center gap-2">
            {editingProfileId && (
              <Button size="sm" variant="secondary" onClick={resetProfileForm} disabled={saving}>
                Cancel edit
              </Button>
            )}
            <Button size="sm" onClick={() => void saveProfile()} disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : editingProfileId ? 'Update profile' : 'Save profile'}
            </Button>
          </div>
        </div>
      </div>
      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-mn-text">{label}</label>
      <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
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
