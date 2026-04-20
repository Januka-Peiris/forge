export type MergeReadinessLevel = 'ready' | 'caution' | 'blocked';

export interface PreFlightCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
}

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
  preFlightChecks: PreFlightCheck[];
  generatedAt: string;
}
