import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { addRepository, listRepositories, removeRepository } from '../tauri-api/repositories';
import { resolveGitRepositoryPath } from '../tauri-api/settings';
import { forgeWarn } from '../forge-log';
import type { AppSettings } from '../../types';

export function useAppRepositories() {
  const [settingsState, setSettingsState] = useState<AppSettings | null>(null);

  const refreshRepositories = useCallback(async () => {
    try {
      const repos = await listRepositories();
      setSettingsState((current) =>
        current
          ? {
              ...current,
              repoRoots: repos.map((repo) => repo.path),
              discoveredRepositories: repos,
            }
          : current,
      );
    } catch (err) {
      forgeWarn('repositories', 'list repositories failed', { err });
    }
  }, []);

  const removeRepositoryFromSettings = useCallback(async (repositoryId: string) => {
    const repo = settingsState?.discoveredRepositories.find((item) => item.id === repositoryId);
    const label = repo?.name ?? repositoryId;
    if (!window.confirm(`Remove repository "${label}" from Forge? This only removes it from the list — it won't delete files on disk.`)) return;
    try {
      await removeRepository(repositoryId);
      setSettingsState((current) =>
        current
          ? {
              ...current,
              discoveredRepositories: current.discoveredRepositories.filter((item) => item.id !== repositoryId),
            }
          : current,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to remove repository: ${message}`);
    }
  }, [settingsState?.discoveredRepositories]);

  const addRepositoryToSettings = useCallback(async () => {
    const picked = await openFilePicker({ directory: true, multiple: false, title: 'Choose a Git repository' });
    if (!picked) return;
    try {
      const toplevel = await resolveGitRepositoryPath(picked as string);
      const repos = await addRepository(toplevel);
      setSettingsState((current) => current ? { ...current, discoveredRepositories: repos } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to add repository: ${message}`);
    }
  }, []);

  return {
    addRepositoryToSettings,
    refreshRepositories,
    removeRepositoryFromSettings,
    setSettingsState: setSettingsState as Dispatch<SetStateAction<AppSettings | null>>,
    settingsState,
  };
}
