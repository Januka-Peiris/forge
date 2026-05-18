import type { TerminalSession } from './terminal';

import type { AgentProfile } from './agent-profile';
import type { RepositoryRelationshipKind } from './repository-relationship';

export interface ForgeWorkspaceConfig {
  exists: boolean;
  path?: string | null;
  setup: string[];
  run: string[];
  teardown: string[];
  hooks: ForgeWorkspaceHooks;
  agentProfiles: AgentProfile[];
  mcpServers: ForgeMcpServerConfig[];
  mcpWarnings: string[];
  repositoryRelationships: ForgeRepositoryRelationshipConfig[];
  repositoryRelationshipWarnings: string[];
  warning?: string | null;
}

export interface ForgeWorkspaceHooks {
  preRun: string[];
  postRun: string[];
  preTool: string[];
  postTool: string[];
  preShip: string[];
  postShip: string[];
}

export interface ForgeMcpServerConfig {
  id: string;
  transport: string;
  command?: string | null;
  args: string[];
  env: Record<string, string>;
  url?: string | null;
  enabled: boolean;
}

export interface ForgeRepositoryRelationshipConfig {
  to: string;
  kind: RepositoryRelationshipKind | string;
  label?: string | null;
  notes?: string | null;
}

export type WorkspaceScriptTerminalSession = TerminalSession;
