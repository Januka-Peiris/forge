export type ReviewRiskLevel = 'low' | 'medium' | 'high';

export interface FileReviewInsight {
  path: string;
  status: string;
  riskLevel: ReviewRiskLevel | string;
  reasons: string[];
  additions: number;
  deletions: number;
}

export interface WorkspaceReviewSummary {
  workspaceId: string;
  summary: string;
  riskLevel: ReviewRiskLevel | string;
  riskReasons: string[];
  filesChanged: number;
  filesFlagged: number;
  additions: number;
  deletions: number;
  generatedAt: string;
  fileInsights: FileReviewInsight[];
}
