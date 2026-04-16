export interface WorkspaceReadiness {
  workspaceId: string;
  status: string;
  summary: string;
  agentStatus: string;
  terminalHealth: string;
  changedFiles: number;
  reviewedFiles: number;
  testStatus: string;
  prCommentCount: number;
  portCount: number;
}
