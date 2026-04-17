import type { AiModelSettings, AppSettings, SaveAiModelSettingsInput, SaveRepoRootsInput } from '../../types/settings';
import { invokeCommand } from './client';

export function getSettings(): Promise<AppSettings> {
  return invokeCommand<AppSettings>('get_settings');
}

export function saveRepoRoots(input: SaveRepoRootsInput): Promise<AppSettings> {
  return invokeCommand<AppSettings>('save_repo_roots', { input });
}

/** Resolves a directory to `git rev-parse --show-toplevel` (Rust). */
export function resolveGitRepositoryPath(path: string): Promise<string> {
  return invokeCommand<string>('resolve_git_repository_path', { path });
}

export function getAiModelSettings(): Promise<AiModelSettings> {
  return invokeCommand<AiModelSettings>('get_ai_model_settings');
}

export function saveAiModelSettings(input: SaveAiModelSettingsInput): Promise<AiModelSettings> {
  return invokeCommand<AiModelSettings>('save_ai_model_settings', { input });
}

export function saveHasCompletedEnvCheck(completed: boolean): Promise<AppSettings> {
  return invokeCommand<AppSettings>('save_has_completed_env_check', { completed });
}

export function getSetting(key: string): Promise<string | null> {
  return invokeCommand<string | null>('get_setting', { key });
}

export function setSetting(key: string, value: string): Promise<void> {
  return invokeCommand<void>('set_setting', { key, value });
}
