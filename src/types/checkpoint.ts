export interface WorkspaceCheckpoint {
  workspaceId: string;
  reference: string;
  shortOid: string;
  createdAt: string;
  subject: string;
}

export interface WorkspaceCheckpointDiff {
  workspaceId: string;
  reference: string;
  diff: string;
}

export interface WorkspaceCheckpointRestorePlan {
  workspaceId: string;
  reference: string;
  currentDirty: boolean;
  changedFileCount: number;
  checkpointFileCount: number;
  warnings: string[];
  steps: string[];
}

export interface WorkspaceCheckpointRestoreResult {
  workspaceId: string;
  reference: string;
  applied: boolean;
  message: string;
}

export interface WorkspaceCheckpointDeleteResult {
  workspaceId: string;
  reference: string;
  deleted: boolean;
  message: string;
}

export interface WorkspaceCheckpointBranchResult {
  workspaceId: string;
  reference: string;
  branch: string;
  created: boolean;
  message: string;
}
