import type { WorkspaceReviewSummary } from '../../types/review-summary';
import { invokeCommand } from './client';

export function getWorkspaceReviewSummary(workspaceId: string): Promise<WorkspaceReviewSummary> {
  return invokeCommand<WorkspaceReviewSummary>('get_workspace_review_summary', { workspaceId });
}

export function refreshWorkspaceReviewSummary(workspaceId: string): Promise<WorkspaceReviewSummary> {
  return invokeCommand<WorkspaceReviewSummary>('refresh_workspace_review_summary', { workspaceId });
}
