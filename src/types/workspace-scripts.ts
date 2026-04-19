import type { TerminalSession } from './terminal';

import type { AgentProfile } from './agent-profile';

export interface ForgeWorkspaceConfig {
  exists: boolean;
  path?: string | null;
  setup: string[];
  run: string[];
  teardown: string[];
  agentProfiles: AgentProfile[];
  mcpServers: ForgeMcpServerConfig[];
  mcpWarnings: string[];
  warning?: string | null;
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

export type WorkspaceScriptTerminalSession = TerminalSession;
