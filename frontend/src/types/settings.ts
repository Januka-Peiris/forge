import type { DiscoveredRepository } from './repository';

export interface AppSettings {
  repoRoots: string[];
  discoveredRepositories: DiscoveredRepository[];
}

export interface SaveRepoRootsInput {
  repoRoots: string[];
}
