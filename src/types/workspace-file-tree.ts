export type WorkspaceFileTreeNodeKind = 'file' | 'dir';

export interface WorkspaceFileTreeNode {
  path: string;
  name: string;
  kind: WorkspaceFileTreeNodeKind;
  hasChildren: boolean;
  children?: WorkspaceFileTreeNode[];
}

export interface ListWorkspaceFileTreeInput {
  path?: string;
  depth?: number;
}
