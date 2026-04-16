import type { TerminalSession } from './terminal';

import type { AgentProfile } from './agent-profile';

export interface ForgeWorkspaceConfig {
  exists: boolean;
  path?: string | null;
  setup: string[];
  run: string[];
  teardown: string[];
  agentProfiles: AgentProfile[];
  warning?: string | null;
}

export type WorkspaceScriptTerminalSession = TerminalSession;
