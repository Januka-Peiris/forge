import type { CommandSafetyResult } from './command-safety';

export interface WorkspaceHookCommand {
  id: string;
  hookKind: string;
  phase: string;
  label: string;
  command: string;
  safety: CommandSafetyResult;
  willBlockWhenRisky: boolean;
}

export interface WorkspaceHookEvent {
  id: string;
  category: string;
  label?: string | null;
  event: string;
  status: string;
  level: string;
  detail?: string | null;
  timestamp: string;
}

export interface WorkspaceHookInspector {
  workspaceId: string;
  configPath?: string | null;
  riskyScriptsEnabled: boolean;
  commands: WorkspaceHookCommand[];
  recentEvents: WorkspaceHookEvent[];
}
