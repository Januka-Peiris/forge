import type { RiskLevel } from './workspace';

export interface ReviewItem {
  id: string;
  workspaceId?: string;
  workspaceName: string;
  repo: string;
  branch: string;
  risk: RiskLevel;
  filesChanged: number;
  additions: number;
  deletions: number;
  aiSummary: string;
  author: string;
  createdAt: string;
}
