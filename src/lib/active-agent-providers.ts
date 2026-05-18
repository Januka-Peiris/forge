import type { AgentProfile, EnvironmentCheckItem } from '../types';

export const ACTIVE_AGENT_PROVIDERS_SETTING_KEY = 'active_agent_providers';

export const AGENT_PROVIDER_IDS = ['claude_code', 'codex', 'kimi_code', 'local_llm', 'openai'] as const;

export type AgentProviderId = typeof AGENT_PROVIDER_IDS[number];

export interface AgentProviderOption {
  id: AgentProviderId;
  label: string;
  shortLabel: string;
  binary?: string;
  setupHint: string;
}

export const AGENT_PROVIDER_OPTIONS: AgentProviderOption[] = [
  {
    id: 'claude_code',
    label: 'Claude Code',
    shortLabel: 'Claude',
    binary: 'claude',
    setupHint: 'Install and authenticate the Claude Code CLI.',
  },
  {
    id: 'codex',
    label: 'Codex',
    shortLabel: 'Codex',
    binary: 'codex',
    setupHint: 'Install and authenticate the Codex CLI.',
  },
  {
    id: 'kimi_code',
    label: 'Kimi Code',
    shortLabel: 'Kimi',
    binary: 'kimi',
    setupHint: 'Install and authenticate the Kimi CLI.',
  },
  {
    id: 'local_llm',
    label: 'Local LLM',
    shortLabel: 'Local',
    binary: 'ollama',
    setupHint: 'Install Ollama or add a local app/workspace profile.',
  },
  {
    id: 'openai',
    label: 'OpenAI API',
    shortLabel: 'OpenAI',
    setupHint: 'Add an OpenAI API profile or enable manually for coordinator planning.',
  },
];

const AGENT_PROVIDER_ID_SET = new Set<string>(AGENT_PROVIDER_IDS);

export function normalizeAgentProviderIds(ids: readonly string[]): AgentProviderId[] {
  const seen = new Set<AgentProviderId>();
  for (const id of ids) {
    if (!AGENT_PROVIDER_ID_SET.has(id)) continue;
    seen.add(id as AgentProviderId);
  }
  return AGENT_PROVIDER_IDS.filter((id) => seen.has(id));
}

export function parseStoredActiveAgentProviders(value: string | null): AgentProviderId[] | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return normalizeAgentProviderIds(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Fall through to legacy/comma format parsing.
  }
  return normalizeAgentProviderIds(trimmed.split(',').map((item) => item.trim()));
}

export function serializeActiveAgentProviders(ids: readonly AgentProviderId[]): string {
  return JSON.stringify(normalizeAgentProviderIds(ids));
}

export function providerForAgentProfile(profile: AgentProfile): AgentProviderId | null {
  if (profile.agent === 'shell') return null;
  if (profile.agent === 'openai' || profile.provider === 'openai') return 'openai';
  if (profile.agent === 'local_llm' || profile.local) return 'local_llm';
  if (profile.agent === 'claude_code' || profile.agent === 'codex' || profile.agent === 'kimi_code') {
    return profile.agent;
  }
  return null;
}

export function isAgentProfileActive(profile: AgentProfile, activeProviderIds: ReadonlySet<AgentProviderId>): boolean {
  if (profile.agent === 'shell') return true;
  const providerId = providerForAgentProfile(profile);
  return providerId ? activeProviderIds.has(providerId) : true;
}

export function isProviderDetected(
  providerId: AgentProviderId,
  environmentItems: readonly EnvironmentCheckItem[],
  profiles: readonly AgentProfile[] = [],
): boolean {
  if (providerId === 'openai') {
    return profiles.some((profile) => profile.agent === 'openai' || profile.provider === 'openai');
  }
  if (providerId === 'local_llm') {
    const hasLocalProfile = profiles.some((profile) => profile.agent !== 'shell' && (profile.agent === 'local_llm' || profile.local));
    if (hasLocalProfile) return true;
  }
  const option = AGENT_PROVIDER_OPTIONS.find((candidate) => candidate.id === providerId);
  if (!option?.binary) return false;
  return environmentItems.some((item) => item.binary === option.binary && item.status === 'ok');
}

export function deriveDetectedActiveAgentProviders(
  environmentItems: readonly EnvironmentCheckItem[],
  profiles: readonly AgentProfile[] = [],
): AgentProviderId[] {
  return AGENT_PROVIDER_IDS.filter((providerId) => isProviderDetected(providerId, environmentItems, profiles));
}

export function agentTypeForProvider(providerId: AgentProviderId) {
  switch (providerId) {
    case 'claude_code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'kimi_code':
      return 'Kimi Code';
    case 'local_llm':
      return 'Local LLM';
    case 'openai':
      return null;
  }
}
