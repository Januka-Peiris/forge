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

export interface WorkspacePrStatus {
  workspaceId: string;
  found: boolean;
  number?: number | null;
  title?: string | null;
  url?: string | null;
  state?: string | null;
  isDraft: boolean;
  reviewDecision?: string | null;
  checksSummary: string;
  checks: WorkspacePrCheck[];
  warning?: string | null;
}

export interface WorkspacePrCheck {
  name: string;
  status: string;
  conclusion?: string | null;
  url?: string | null;
}
