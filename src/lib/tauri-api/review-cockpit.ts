import type { AgentPromptEntry, MarkWorkspaceFileReviewedInput, QueueReviewAgentPromptInput, WorkspaceReviewCockpit } from '../../types';
import { invokeCommand } from './client';

export function getWorkspaceReviewCockpit(workspaceId: string, selectedPath?: string | null): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('get_workspace_review_cockpit', { workspaceId, selectedPath });
}

export function refreshWorkspaceReviewCockpit(workspaceId: string, selectedPath?: string | null): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('refresh_workspace_review_cockpit', { workspaceId, selectedPath });
}

export function markWorkspaceFileReviewed(input: MarkWorkspaceFileReviewedInput): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('mark_workspace_file_reviewed', { input });
}

export function refreshWorkspacePrComments(workspaceId: string): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('refresh_workspace_pr_comments', { workspaceId });
}

export function markWorkspacePrCommentResolvedLocal(workspaceId: string, commentId: string): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('mark_workspace_pr_comment_resolved_local', { workspaceId, commentId });
}

export function resolveWorkspacePrThread(workspaceId: string, commentId: string): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('resolve_workspace_pr_thread', { workspaceId, commentId });
}

export function reopenWorkspacePrThread(workspaceId: string, commentId: string): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('reopen_workspace_pr_thread', { workspaceId, commentId });
}

export function syncWorkspacePrThreads(workspaceId: string): Promise<WorkspaceReviewCockpit> {
  return invokeCommand<WorkspaceReviewCockpit>('sync_workspace_pr_threads', { workspaceId });
}

export function queueReviewAgentPrompt(input: QueueReviewAgentPromptInput): Promise<AgentPromptEntry> {
  return invokeCommand<AgentPromptEntry>('queue_review_agent_prompt', { input });
}
