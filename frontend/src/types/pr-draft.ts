export interface WorkspacePrDraft {
  workspaceId: string;
  title: string;
  summary: string;
  keyChanges: string[];
  risks: string[];
  testingNotes: string[];
  generatedAt: string;
}
