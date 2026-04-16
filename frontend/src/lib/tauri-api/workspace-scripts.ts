import type { TerminalSession } from '../../types/terminal';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import { invokeCommand } from './client';

export function getWorkspaceForgeConfig(workspaceId: string): Promise<ForgeWorkspaceConfig> {
  return invokeCommand<ForgeWorkspaceConfig>('get_workspace_forge_config', { workspaceId });
}

export function runWorkspaceSetup(workspaceId: string): Promise<TerminalSession[]> {
  return invokeCommand<TerminalSession[]>('run_workspace_setup', { workspaceId });
}

export function startWorkspaceRunCommand(workspaceId: string, commandIndex: number): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('start_workspace_run_command', { workspaceId, commandIndex });
}

export function restartWorkspaceRunCommand(workspaceId: string, commandIndex: number): Promise<TerminalSession> {
  return invokeCommand<TerminalSession>('restart_workspace_run_command', { workspaceId, commandIndex });
}

export function stopWorkspaceRunCommands(workspaceId: string): Promise<TerminalSession[]> {
  return invokeCommand<TerminalSession[]>('stop_workspace_run_commands', { workspaceId });
}
