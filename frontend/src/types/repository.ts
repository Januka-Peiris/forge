export interface DiscoveredWorktree {
  id: string;
  repoId: string;
  path: string;
  branch?: string;
  head?: string;
  isDirty: boolean;
  isDetached: boolean;
}

export interface DiscoveredRepository {
  id: string;
  name: string;
  path: string;
  currentBranch?: string;
  head?: string;
  isDirty: boolean;
  worktrees: DiscoveredWorktree[];
  lastScannedAt: string;
}

export interface ScanRepositoriesResult {
  repoRoots: string[];
  repositories: DiscoveredRepository[];
  scannedAt: string;
  warnings: string[];
}
