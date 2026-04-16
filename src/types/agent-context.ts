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

export interface RepoMapEntry {
  path: string;
  kind: string;
  symbols: string[];
}

export interface RepoMapMeta {
  version: number;
  branch: string;
  refName: string;
  commitHash: string;
  generatedAt: string;
}

export interface RepoMap {
  version: number;
  generatedAt: string;
  branch: string;
  refName: string;
  commitHash: string;
  entries: RepoMapEntry[];
}

export interface WorkspaceContextItem {
  label: string;
  path?: string | null;
  kind: string;
  priority: number;
  chars: number;
  included: boolean;
  trimmed: boolean;
}

export interface WorkspaceContextPreview {
  workspaceId: string;
  repoRoot: string;
  status: string;
  defaultBranch: string;
  refName: string;
  commitHash: string;
  generatedAt?: string | null;
  approxChars: number;
  maxChars: number;
  trimmed: boolean;
  items: WorkspaceContextItem[];
  promptContext: string;
  warning?: string | null;
}
