import type { DiscoveredRepository } from './repository';

export interface AppSettings {
  repoRoots: string[];
  discoveredRepositories: DiscoveredRepository[];
  hasCompletedEnvCheck: boolean;
}

export interface SaveRepoRootsInput {
  repoRoots: string[];
}
