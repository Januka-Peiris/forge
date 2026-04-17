import type { AgentChatEvent, AgentChatNextAction, AgentChatSession } from '../types/agent-chat';
import type { WorkspaceChangedFile } from '../types/git-review';
import type { WorkspaceReviewCockpit } from '../types/review-cockpit';
import type { WorkspaceReadiness } from '../types/workspace-readiness';

export type AgentRunSectionKind = 'planning' | 'actions' | 'results' | 'diagnostics' | 'conversation';

export interface AgentRunSection {
  kind: AgentRunSectionKind;
  title: string;
  events: AgentChatEvent[];
}

export interface AgentWorkbenchSummary {
  changedFileCount: number;
  reviewedFileCount: number;
  testStatus: string;
  mergeRisk: string;
  prCommentCount: number;
  warnings: string[];
}

const PLANNING_EVENTS = new Set(['thinking', 'plan', 'todo']);
const ACTION_EVENTS = new Set(['tool_call', 'tool_result', 'command', 'file_read', 'file_change', 'test_run']);
const RESULT_EVENTS = new Set(['result', 'status', 'next_action']);
const DIAGNOSTIC_EVENTS = new Set(['diagnostic', 'error']);

export function deriveAgentRunSections(events: AgentChatEvent[]): AgentRunSection[] {
  const sections: AgentRunSection[] = [
    { kind: 'conversation', title: 'Conversation', events: [] },
    { kind: 'planning', title: 'Planning', events: [] },
    { kind: 'actions', title: 'Actions', events: [] },
    { kind: 'results', title: 'Results', events: [] },
    { kind: 'diagnostics', title: 'Diagnostics', events: [] },
  ];
  const byKind = Object.fromEntries(sections.map((section) => [section.kind, section])) as Record<AgentRunSectionKind, AgentRunSection>;

  for (const event of events) {
    if (event.eventType === 'user_message' || event.eventType === 'assistant_message') {
      const mode = latestPlanModeBefore(events, event.seq);
      if (event.eventType === 'assistant_message' && mode === 'Plan') byKind.planning.events.push({ ...event, eventType: 'plan', title: 'Plan' });
      else byKind.conversation.events.push(event);
    } else if (PLANNING_EVENTS.has(event.eventType)) byKind.planning.events.push(event);
    else if (ACTION_EVENTS.has(event.eventType)) byKind.actions.events.push(event);
    else if (RESULT_EVENTS.has(event.eventType)) byKind.results.events.push(event);
    else if (DIAGNOSTIC_EVENTS.has(event.eventType)) byKind.diagnostics.events.push(event);
    else byKind.actions.events.push(event);
  }

  return sections.filter((section) => section.events.length > 0);
}

export function latestPlanEvent(events: AgentChatEvent[]): AgentChatEvent | null {
  const sections = deriveAgentRunSections(events);
  const plans = sections.flatMap((section) => section.events).filter((event) => event.eventType === 'plan');
  return plans[plans.length - 1] ?? null;
}

export function deriveWorkbenchSummary(
  readiness: WorkspaceReadiness | null,
  changedFiles: WorkspaceChangedFile[],
  reviewCockpit: WorkspaceReviewCockpit | null,
): AgentWorkbenchSummary {
  return {
    changedFileCount: changedFiles.length || readiness?.changedFiles || 0,
    reviewedFileCount: readiness?.reviewedFiles ?? reviewCockpit?.files.filter((file) => file.review?.status === 'reviewed').length ?? 0,
    testStatus: readiness?.testStatus ?? 'unknown',
    mergeRisk: reviewCockpit?.mergeReadiness?.readinessLevel ?? reviewCockpit?.reviewSummary?.riskLevel ?? 'unknown',
    prCommentCount: readiness?.prCommentCount ?? reviewCockpit?.prComments.filter((comment) => comment.state !== 'resolved_local').length ?? 0,
    warnings: reviewCockpit?.warnings ?? [],
  };
}

export function deriveNextActions(input: {
  session: AgentChatSession;
  events: AgentChatEvent[];
  readiness: WorkspaceReadiness | null;
  changedFiles: WorkspaceChangedFile[];
  reviewCockpit: WorkspaceReviewCockpit | null;
  hasRunCommands: boolean;
  hasPr: boolean;
}): AgentChatNextAction[] {
  const actions: AgentChatNextAction[] = [];
  const plan = latestPlanEvent(input.events);
  const latestError = [...input.events].reverse().find((event) => event.eventType === 'error' || event.status === 'failed');
  const changedCount = input.changedFiles.length || input.readiness?.changedFiles || 0;
  const reviewedCount = input.readiness?.reviewedFiles ?? 0;
  const prComments = input.readiness?.prCommentCount ?? input.reviewCockpit?.prComments.length ?? 0;

  if (plan && input.session.status !== 'running') {
    actions.push({ id: 'accept-plan', label: 'Accept Plan', kind: 'accept_plan', tone: 'primary' });
    actions.push({ id: 'ask-followup', label: 'Ask follow-up', kind: 'ask_followup' });
    actions.push({ id: 'copy-plan', label: 'Copy plan', kind: 'copy_plan' });
  }
  if (latestError) {
    actions.push({ id: 'send-failure', label: 'Send failure to agent', kind: 'send_failure', tone: 'warning' });
    actions.push({ id: 'open-diagnostics', label: 'Open diagnostics', kind: 'open_diagnostics' });
  }
  if (changedCount > 0) {
    actions.push({ id: 'review-diff', label: `Review ${changedCount} file${changedCount === 1 ? '' : 's'}`, kind: 'review_diff', tone: 'primary' });
    if (input.hasRunCommands) actions.push({ id: 'run-tests', label: 'Run tests', kind: 'run_tests' });
    actions.push({ id: 'ask-reviewer', label: 'Ask reviewer', kind: 'ask_reviewer' });
    if (!input.hasPr) actions.push({ id: 'create-pr', label: 'Create PR', kind: 'create_pr' });
  }
  if (prComments > 0) actions.push({ id: 'refresh-comments', label: 'Refresh comments', kind: 'refresh_comments' });
  if (changedCount > 0 && reviewedCount >= changedCount && !input.hasPr) actions.push({ id: 'create-pr-reviewed', label: 'Create PR', kind: 'create_pr', tone: 'primary' });
  if (input.session.status === 'succeeded') actions.push({ id: 'archive-chat', label: 'Archive chat', kind: 'archive_chat' });
  actions.push({ id: 'open-diagnostics-fallback', label: 'Raw diagnostics', kind: 'open_diagnostics' });

  return dedupeActions(actions).slice(0, 6);
}

export function modelContextLabel(modelId: string): string {
  if (modelId.includes('[1m]')) return '1M';
  if (modelId.includes('sonnet-4-6')) return '200k';
  if (modelId.includes('opus-4')) return '200k';
  if (modelId.includes('haiku')) return '200k';
  return 'context unknown';
}

function latestPlanModeBefore(events: AgentChatEvent[], seq: number): string | null {
  const user = [...events]
    .filter((event) => event.seq <= seq && event.eventType === 'user_message')
    .sort((a, b) => b.seq - a.seq)[0];
  return typeof user?.metadata?.taskMode === 'string' ? user.metadata.taskMode : null;
}

function dedupeActions(actions: AgentChatNextAction[]): AgentChatNextAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.kind)) return false;
    seen.add(action.kind);
    return true;
  });
}
