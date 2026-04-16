export type ReviewFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface WorkspaceChangedFile {
  workspaceId: string;
  path: string;
  oldPath?: string;
  status: ReviewFileStatus | string;
  staged: boolean;
  unstaged: boolean;
  additions?: number;
  deletions?: number;
}

export interface WorkspaceFileDiff {
  workspaceId: string;
  path: string;
  oldPath?: string;
  status: ReviewFileStatus | string;
  diff: string;
  isBinary: boolean;
  source: string;
}
