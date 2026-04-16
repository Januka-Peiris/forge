export interface WorkspacePort {
  port: number;
  pid: number;
  command: string;
  user?: string | null;
  protocol: string;
  address: string;
  cwd?: string | null;
  workspaceMatched: boolean;
}
