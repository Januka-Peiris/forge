export interface AgentContextWorktree {
  repoId: string;
  repoName: string;
  path: string;
  branch?: string | null;
  head?: string | null;
}

export interface WorkspaceAgentContext {
  workspaceId: string;
  primaryPath: string;
  linkedWorktrees: AgentContextWorktree[];
  promptPreamble: string;
}
