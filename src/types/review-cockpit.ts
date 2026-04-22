import type { AgentPromptEntry } from './terminal';
import type { WorkspaceChangedFile, WorkspaceFileDiff } from './git-review';
import type { WorkspaceMergeReadiness } from './merge-readiness';
import type { WorkspaceReviewSummary } from './review-summary';

export interface WorkspaceFileReviewState {
  workspaceId: string;
  path: string;
  status: 'reviewed' | 'unreviewed' | string;
  reviewedAt?: string | null;
  reviewedBy: string;
  notes?: string | null;
}

export interface ReviewCockpitFile {
  file: WorkspaceChangedFile;
  review?: WorkspaceFileReviewState | null;
}

export interface WorkspacePrComment {
  workspaceId: string;
  provider: string;
  commentId: string;
  author: string;
  body: string;
  path?: string | null;
  line?: number | null;
  url?: string | null;
  state: string;
  createdAt?: string | null;
  resolvedAt?: string | null;
  commentNodeId?: string | null;
  threadId?: string | null;
  reviewId?: number | null;
  threadResolved?: boolean;
  threadOutdated?: boolean;
  threadResolvable?: boolean;
}

export interface WorkspaceReviewCockpit {
  workspaceId: string;
  files: ReviewCockpitFile[];
  selectedDiff?: WorkspaceFileDiff | null;
  reviewSummary?: WorkspaceReviewSummary | null;
  mergeReadiness?: WorkspaceMergeReadiness | null;
  prComments: WorkspacePrComment[];
  warnings: string[];
}

export interface MarkWorkspaceFileReviewedInput {
  workspaceId: string;
  path: string;
  reviewed: boolean;
  notes?: string | null;
}

export interface QueueReviewAgentPromptInput {
  workspaceId: string;
  path?: string | null;
  commentId?: string | null;
  action: 'fix_file' | 'address_comment' | 'explain_diff' | 'prepare_pr_summary' | string;
  profileId?: string | null;
  taskMode?: string | null;
  reasoning?: string | null;
  mode?: 'send_now' | 'interrupt_send' | string | null;
}

export type QueueReviewAgentPromptResult = AgentPromptEntry;
