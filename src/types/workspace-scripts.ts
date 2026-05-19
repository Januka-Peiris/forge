import type { TerminalSession } from './terminal';

import type { AgentProfile } from './agent-profile';
import type { RepositoryRelationshipKind } from './repository-relationship';

export interface MnemonicWorkspaceConfig {
  exists: boolean;
  path?: string | null;
  setup: string[];
  run: string[];
  teardown: string[];
  hooks: MnemonicWorkspaceHooks;
  agentProfiles: AgentProfile[];
  mcpServers: MnemonicMcpServerConfig[];
  mcpWarnings: string[];
  repositoryRelationships: MnemonicRepositoryRelationshipConfig[];
  repositoryRelationshipWarnings: string[];
  warning?: string | null;
}

export interface MnemonicWorkspaceHooks {
  preRun: string[];
  postRun: string[];
  preTool: string[];
  postTool: string[];
  preShip: string[];
  postShip: string[];
}

export interface MnemonicMcpServerConfig {
  id: string;
  transport: string;
  command?: string | null;
  args: string[];
  env: Record<string, string>;
  url?: string | null;
  enabled: boolean;
}

export interface MnemonicRepositoryRelationshipConfig {
  to: string;
  kind: RepositoryRelationshipKind | string;
  label?: string | null;
  notes?: string | null;
}

export type WorkspaceScriptTerminalSession = TerminalSession;
