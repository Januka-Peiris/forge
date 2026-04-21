import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { checkEnvironment } from '../tauri-api/environment';
import { saveHasCompletedEnvCheck } from '../tauri-api/settings';
import { forgeWarn } from '../forge-log';
import type { AppSettings, EnvironmentCheckItem } from '../../types';

interface UseEnvironmentCheckInput {
  settingsState: AppSettings | null;
  setSettingsState: Dispatch<SetStateAction<AppSettings | null>>;
}

export function useEnvironmentCheck({ settingsState, setSettingsState }: UseEnvironmentCheckInput) {
  const [environmentItems, setEnvironmentItems] = useState<EnvironmentCheckItem[]>([]);
  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [environmentCheckBusy, setEnvironmentCheckBusy] = useState(false);
  const firstRunEnvCheckStartedRef = useRef(false);

  const runEnvironmentCheck = useCallback(async (showModal = true) => {
    setEnvironmentCheckBusy(true);
    try {
      const items = await checkEnvironment();
      setEnvironmentItems(items);
      if (showModal) setEnvironmentModalOpen(true);
      return items;
    } catch (err) {
      forgeWarn('environment', 'check failed', { err });
      const unknownItems: EnvironmentCheckItem[] = ['git', 'tmux', 'codex', 'claude', 'kimi', 'gh'].map((binary) => ({
        name: binary === 'codex'
          ? 'codex CLI'
          : binary === 'claude'
            ? 'claude CLI'
            : binary === 'kimi'
              ? 'Kimi CLI'
              : binary === 'gh'
                ? 'GitHub CLI'
                : binary,
        binary,
        status: 'unknown',
        fix: binary === 'kimi' ? 'uv tool install kimi-cli' : `brew install ${binary}`,
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
  }, [setSettingsState]);

  useEffect(() => {
    if (!settingsState || settingsState.hasCompletedEnvCheck || firstRunEnvCheckStartedRef.current) return;
    firstRunEnvCheckStartedRef.current = true;
    void runEnvironmentCheck(true).finally(() => {
      void saveHasCompletedEnvCheck(true)
        .then((nextSettings) => setSettingsState(nextSettings))
        .catch((err) => forgeWarn('environment', 'failed to persist first-run completion', { err }));
    });
  }, [runEnvironmentCheck, setSettingsState, settingsState]);

  return {
    completeFirstRunEnvironmentCheck,
    environmentCheckBusy,
    environmentItems,
    environmentModalOpen,
    runEnvironmentCheck,
  };
}
