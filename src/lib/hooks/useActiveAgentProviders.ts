import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACTIVE_AGENT_PROVIDERS_SETTING_KEY,
  deriveDetectedActiveAgentProviders,
  normalizeAgentProviderIds,
  parseStoredActiveAgentProviders,
  serializeActiveAgentProviders,
  type AgentProviderId,
} from '../active-agent-providers';
import { checkEnvironment } from '../tauri-api/environment';
import { listAppAgentProfiles } from '../tauri-api/agent-profiles';
import { getSetting, setSetting } from '../tauri-api/settings';
import type { AgentProfile, EnvironmentCheckItem } from '../../types';

const ACTIVE_AGENT_PROVIDERS_CHANGED_EVENT = 'mn:active-agent-providers-changed';
const EMPTY_PROFILES: AgentProfile[] = [];

interface ActiveAgentProvidersState {
  activeProviderIds: AgentProviderId[];
  detectedProviderIds: AgentProviderId[];
  environmentItems: EnvironmentCheckItem[];
  hasSavedPreference: boolean;
  loading: boolean;
  error: string | null;
}

export function useActiveAgentProviders(profiles: AgentProfile[] = EMPTY_PROFILES) {
  const [state, setState] = useState<ActiveAgentProvidersState>({
    activeProviderIds: [],
    detectedProviderIds: [],
    environmentItems: [],
    hasSavedPreference: false,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [stored, environmentItems, appProfiles] = await Promise.all([
        getSetting(ACTIVE_AGENT_PROVIDERS_SETTING_KEY),
        checkEnvironment().catch(() => [] as EnvironmentCheckItem[]),
        listAppAgentProfiles().catch(() => [] as AgentProfile[]),
      ]);
      const combinedProfiles = [...appProfiles, ...profiles];
      const detectedProviderIds = deriveDetectedActiveAgentProviders(environmentItems, combinedProfiles);
      const storedProviderIds = parseStoredActiveAgentProviders(stored);
      setState({
        activeProviderIds: storedProviderIds ?? detectedProviderIds,
        detectedProviderIds,
        environmentItems,
        hasSavedPreference: storedProviderIds !== null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((current) => ({
        ...current,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [profiles]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(ACTIVE_AGENT_PROVIDERS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACTIVE_AGENT_PROVIDERS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const saveActiveProviderIds = useCallback(async (ids: readonly AgentProviderId[]) => {
    const normalized = normalizeAgentProviderIds(ids);
    await setSetting(ACTIVE_AGENT_PROVIDERS_SETTING_KEY, serializeActiveAgentProviders(normalized));
    setState((current) => ({
      ...current,
      activeProviderIds: normalized,
      hasSavedPreference: true,
      loading: false,
      error: null,
    }));
    window.dispatchEvent(new Event(ACTIVE_AGENT_PROVIDERS_CHANGED_EVENT));
  }, []);

  const activeProviderSet = useMemo(() => new Set(state.activeProviderIds), [state.activeProviderIds]);
  const detectedProviderSet = useMemo(() => new Set(state.detectedProviderIds), [state.detectedProviderIds]);

  return {
    ...state,
    activeProviderSet,
    detectedProviderSet,
    refresh,
    saveActiveProviderIds,
  };
}
