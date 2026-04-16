export interface WorkspacePrDraft {
  workspaceId: string;
  title: string;
  summary: string;
  keyChanges: string[];
  risks: string[];
  testingNotes: string[];
  generatedAt: string;
}

export interface WorkspacePrResult {
  workspaceId: string;
  prUrl: string;
  prNumber: number;
  title: string;
}
