import type { DiscoveredRepository } from './repository';

export interface AppSettings {
  repoRoots: string[];
  discoveredRepositories: DiscoveredRepository[];
  hasCompletedEnvCheck: boolean;
  managedWorkspacesRoot: string;
}

export interface SaveRepoRootsInput {
  repoRoots: string[];
}

export interface AiModelSettings {
  claudeAgentModel: string;
  codexAgentModel: string;
  kimiAgentModel: string; // kept for API compat, always empty
  agentModel: string;
  orchestratorModel: string;
}

export interface SaveAiModelSettingsInput {
  claudeAgentModel: string;
  codexAgentModel: string;
  kimiAgentModel: string; // kept for API compat, always empty
  agentModel: string;
  orchestratorModel: string;
}
