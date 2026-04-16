import type { DiscoveredRepository } from './repository';

export interface AppSettings {
  repoRoots: string[];
  discoveredRepositories: DiscoveredRepository[];
}

export interface SaveRepoRootsInput {
  repoRoots: string[];
}

export interface AiModelSettings {
  agentModel: string;
  orchestratorModel: string;
}

export interface SaveAiModelSettingsInput {
  agentModel: string;
  orchestratorModel: string;
}
