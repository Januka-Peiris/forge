export type MergeReadinessLevel = 'ready' | 'caution' | 'blocked';

export interface WorkspaceMergeReadiness {
  workspaceId: string;
  mergeReady: boolean;
  readinessLevel: MergeReadinessLevel | string;
  reasons: string[];
  warnings: string[];
  aheadCount?: number;
  behindCount?: number;
  activeRunStatus?: string;
  reviewRiskLevel?: string;
  generatedAt: string;
}
