import type { AppSettings, SaveRepoRootsInput } from '../../types/settings';
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
