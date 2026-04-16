import type { WorkspacePort } from '../../types/workspace-ports';
import { invokeCommand } from './client';

export function listWorkspacePorts(workspaceId: string): Promise<WorkspacePort[]> {
  return invokeCommand<WorkspacePort[]>('list_workspace_ports', { workspaceId });
}

export function openWorkspacePort(workspaceId: string, port: number): Promise<void> {
  return invokeCommand<void>('open_workspace_port', { workspaceId, port });
}

export function killWorkspacePortProcess(workspaceId: string, port: number, pid: number): Promise<WorkspacePort[]> {
  return invokeCommand<WorkspacePort[]>('kill_workspace_port_process', { workspaceId, port, pid });
}
