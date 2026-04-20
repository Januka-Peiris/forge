import type { Workspace, WorkspaceAttention } from '../types';

export type CockpitTone = 'green' | 'blue' | 'yellow' | 'red' | 'muted';

export interface WorkspaceCockpitSummary {
  agentState: string;
  changeSummary: string;
  checkSummary: string;
  prSummary: string;
  trustSummary: string;
  nextAction: string;
  nextActionTone: CockpitTone;
}

export function deriveWorkspaceCockpit(
  workspace: Workspace,
  options: {
    attention?: WorkspaceAttention;
    hasConflict?: boolean;
    isArchived?: boolean;
  } = {},
): WorkspaceCockpitSummary {
  const { attention, hasConflict = false, isArchived = false } = options;
  const changedCount = workspace.changedFiles.length;
  const additions = workspace.changedFiles.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = workspace.changedFiles.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const unread = attention?.unreadCount ?? 0;
  const runningCount = attention?.runningCount ?? 0;
  const queuedCount = attention?.queuedCount ?? 0;
  const status = attention?.status ?? workspace.status;

  const agentState = (() => {
    if (isArchived) return 'Archived';
    if (hasConflict) return 'Conflict needs attention';
    if (unread > 0) return `${unread} unread agent update${unread === 1 ? '' : 's'}`;
    if (queuedCount > 0) return `${queuedCount} queued prompt${queuedCount === 1 ? '' : 's'}`;
    if (runningCount > 0 || status === 'running' || workspace.status === 'Running') return 'Agent running';
    if (status === 'error' || workspace.status === 'Blocked') return 'Blocked';
    if (status === 'complete' || workspace.status === 'Review Ready') return 'Ready for review';
    return workspace.agentSession?.lastMessage && workspace.agentSession.lastMessage !== 'No terminal session started yet'
      ? workspace.agentSession.lastMessage
      : 'Ready for instruction';
  })();

  const changeSummary =
    changedCount > 0
      ? `${changedCount} changed file${changedCount === 1 ? '' : 's'} · +${additions} −${deletions}`
      : 'No local changes yet';

  const checkSummary = (() => {
    if (workspace.completedSteps.includes('Testing')) return 'Checks completed';
    if (workspace.currentStep === 'Testing') return 'Checks running';
    if (changedCount > 0) return 'Checks not run yet';
    return 'No checks yet';
  })();

  const prSummary = workspace.prStatus && workspace.prNumber
    ? `PR #${workspace.prNumber} · ${workspace.prStatus}`
    : changedCount > 0
      ? 'No PR yet'
      : 'PR not needed yet';

  const trustSummary = (() => {
    if (hasConflict) return 'Overlapping workspace edits detected';
    if (workspace.mergeRisk === 'High') return 'High merge risk';
    if (workspace.behindBy > 0) return `${workspace.behindBy} behind base`;
    if (workspace.worktreeManagedByForge) return 'Forge-managed worktree';
    return 'External worktree';
  })();

  const next = (() => {
    if (isArchived) return { label: 'Restore or inspect history', tone: 'muted' as CockpitTone };
    if (hasConflict) return { label: 'Resolve conflict', tone: 'red' as CockpitTone };
    if (unread > 0 || status === 'waiting') return { label: 'Respond to agent', tone: 'yellow' as CockpitTone };
    if (status === 'error' || workspace.status === 'Blocked') return { label: 'Inspect blocker', tone: 'red' as CockpitTone };
    if (runningCount > 0 || status === 'running' || workspace.status === 'Running') return { label: 'Monitor progress', tone: 'green' as CockpitTone };
    if (changedCount > 0 && !workspace.prStatus) return { label: 'Review changes', tone: 'blue' as CockpitTone };
    if (changedCount > 0 && workspace.prStatus) return { label: 'Track PR readiness', tone: 'blue' as CockpitTone };
    return { label: 'Send next instruction', tone: 'muted' as CockpitTone };
  })();

  return {
    agentState,
    changeSummary,
    checkSummary,
    prSummary,
    trustSummary,
    nextAction: next.label,
    nextActionTone: next.tone,
  };
}

export function cockpitToneClass(tone: CockpitTone): string {
  switch (tone) {
    case 'green':
      return 'border-forge-green/25 bg-forge-green/10 text-forge-green';
    case 'blue':
      return 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue';
    case 'yellow':
      return 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow';
    case 'red':
      return 'border-forge-red/25 bg-forge-red/10 text-forge-red';
    default:
      return 'border-forge-border bg-white/5 text-forge-muted';
  }
}
