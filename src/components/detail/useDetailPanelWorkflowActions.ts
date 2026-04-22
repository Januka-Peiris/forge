import { useState } from 'react';
import { runWorkspaceSetup, startWorkspaceRunCommand, stopWorkspaceRunCommands } from '../../lib/tauri-api/workspace-scripts';
import { refreshWorkspacePrDraft } from '../../lib/tauri-api/pr-draft';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { applyWorkspaceSessionRecoveryAction, recoverWorkspaceSessions } from '../../lib/tauri-api/workspace-health';
import { refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import { scheduleWorkspaceSchedulerJobNow, setWorkspaceSchedulerJobEnabled } from '../../lib/tauri-api/workspace-tasks';
import { pullWorkspaceBranch } from '../../lib/tauri-api/workspaces';
import type { WorkspaceSessionRecoveryResult } from '../../types/workspace-health';
import type { WorkspacePrDraft } from '../../types/pr-draft';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import { formatPrDraftMarkdown } from './DetailPanelUtils';

interface UseDetailPanelWorkflowActionsParams {
  workspaceId: string | undefined;
  isArchived: boolean;
  workspacePrDraft: WorkspacePrDraft | null;
  onCreatePr?: () => Promise<{ prUrl: string; prNumber: number } | void>;
  onArchiveWorkspace?: () => void;
  onRefreshWorkspaceState?: () => void;
  refreshCockpitData: () => Promise<void>;
  setWorkspacePrDraft: (draft: WorkspacePrDraft | null) => void;
  setReviewCockpit: (cockpit: WorkspaceReviewCockpit | null) => void;
}

export function useDetailPanelWorkflowActions({
  workspaceId,
  isArchived,
  workspacePrDraft,
  onCreatePr,
  onArchiveWorkspace,
  onRefreshWorkspaceState,
  refreshCockpitData,
  setWorkspacePrDraft,
  setReviewCockpit,
}: UseDetailPanelWorkflowActionsParams) {
  const [prCreating, setPrCreating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<WorkspaceSessionRecoveryResult | null>(null);
  const [scriptActionBusy, setScriptActionBusy] = useState<string | null>(null);
  const [scriptActionMessage, setScriptActionMessage] = useState<string | null>(null);
  const [prDraftRefreshing, setPrDraftRefreshing] = useState(false);
  const [reviewCommentsRefreshing, setReviewCommentsRefreshing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [schedulerActionBusy, setSchedulerActionBusy] = useState<string | null>(null);
  const [schedulerMessage, setSchedulerMessage] = useState<string | null>(null);

  const runSetupFromCockpit = async () => {
    if (!workspaceId) return;
    setScriptActionBusy('setup');
    setScriptActionMessage(null);
    try {
      const sessions = await runWorkspaceSetup(workspaceId);
      setScriptActionMessage(sessions.length > 0 ? `Started ${sessions.length} setup terminal(s).` : 'No setup commands were started.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const runCheckFromCockpit = async (index: number) => {
    if (!workspaceId) return;
    setScriptActionBusy(`run-${index}`);
    setScriptActionMessage(null);
    try {
      await startWorkspaceRunCommand(workspaceId, index);
      setScriptActionMessage(`Started check command ${index + 1}.`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const stopChecksFromCockpit = async () => {
    if (!workspaceId) return;
    setScriptActionBusy('stop');
    setScriptActionMessage(null);
    try {
      const sessions = await stopWorkspaceRunCommands(workspaceId);
      setScriptActionMessage(`Stopped ${sessions.length} run/check terminal(s).`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const refreshPrDraftFromCockpit = async () => {
    if (!workspaceId) return;
    setPrDraftRefreshing(true);
    setShippingMessage(null);
    try {
      const draft = await refreshWorkspacePrDraft(workspaceId);
      setWorkspacePrDraft(draft);
      setShippingMessage('PR draft refreshed from current changes.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPrDraftRefreshing(false);
    }
  };

  const copyPrDraftFromCockpit = async () => {
    if (!workspacePrDraft) return;
    const markdown = formatPrDraftMarkdown(workspacePrDraft);
    try {
      await navigator.clipboard.writeText(markdown);
      setShippingMessage('PR draft markdown copied to clipboard.');
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshPrCommentsFromCockpit = async () => {
    if (!workspaceId) return;
    setReviewCommentsRefreshing(true);
    setReviewMessage(null);
    try {
      const cockpit = await refreshWorkspacePrComments(workspaceId);
      setReviewCockpit(cockpit);
      const openComments = cockpit.prComments.filter((comment) => !comment.threadResolved && !comment.resolvedAt && comment.state !== 'resolved').length;
      setReviewMessage(`Fetched ${openComments} open PR comment(s).`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setReviewMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewCommentsRefreshing(false);
    }
  };

  const pullBranchFromCockpit = async () => {
    if (!workspaceId) return;
    setScriptActionBusy('pull');
    setScriptActionMessage(null);
    try {
      const message = await pullWorkspaceBranch(workspaceId);
      setScriptActionMessage(message);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const createPrFromCockpit = async () => {
    if (!onCreatePr) return;
    setPrCreating(true);
    setPrError(null);
    setShippingMessage(null);
    try {
      await onCreatePr();
      setShippingMessage('Pull request created or refreshed.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPrError(message);
      setShippingMessage(message);
    } finally {
      setPrCreating(false);
    }
  };

  const cleanupFromCockpit = async () => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      [
        'Cleanup this workspace?',
        '',
        'Forge will stop running workspace terminals and start configured teardown commands.',
        'It will not remove the worktree or kill ports from this button.',
      ].join('\n'),
    );
    if (!confirmed) return;
    setCleanupBusy(true);
    setShippingMessage(null);
    try {
      const result = await cleanupWorkspace({
        workspaceId,
        killPorts: false,
        removeManagedWorktree: false,
      });
      setShippingMessage(
        `Cleanup started: stopped ${result.stoppedSessions} terminal(s), launched ${result.teardownSessions} teardown command(s).`,
      );
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCleanupBusy(false);
    }
  };

  const archiveFromCockpit = () => {
    if (!onArchiveWorkspace) return;
    const confirmed = window.confirm(
      isArchived
        ? 'Unarchive this workspace? It will return to the active workspace view.'
        : 'Archive this workspace? It will be hidden from active views, but Forge keeps its history, checkpoints, branch, Git worktree, and local files.',
    );
    if (confirmed) onArchiveWorkspace();
  };

  const recoverSessionsFromCockpit = async () => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      [
        'Recover unhealthy workspace sessions?',
        '',
        'Forge will close stale, failed, interrupted, stuck, or detached running terminal sessions.',
        'Terminal history and workspace activity will be preserved.',
        'It will not delete files, remove the worktree, or kill unrelated ports.',
      ].join('\n'),
    );
    if (!confirmed) return;
    setRecoveryResult(null);
    setRecoveryBusy(true);
    try {
      const result = await recoverWorkspaceSessions(workspaceId);
      setRecoveryResult(result);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const applyRecoveryActionFromCockpit = async (sessionId: string, action: 'resume_tracking' | 'mark_interrupted' | 'close_session') => {
    if (!workspaceId) return;
    setRecoveryBusy(true);
    try {
      await applyWorkspaceSessionRecoveryAction({ workspaceId, sessionId, action });
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const setSchedulerJobEnabledFromCockpit = async (jobId: string, enabled: boolean) => {
    if (!workspaceId) return;
    setSchedulerActionBusy(`enabled:${jobId}`);
    setSchedulerMessage(null);
    try {
      await setWorkspaceSchedulerJobEnabled(workspaceId, jobId, enabled);
      setSchedulerMessage(enabled ? 'Scheduler job resumed.' : 'Scheduler job paused.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setSchedulerMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSchedulerActionBusy(null);
    }
  };

  const runSchedulerJobSoonFromCockpit = async (jobId: string) => {
    if (!workspaceId) return;
    setSchedulerActionBusy(`run:${jobId}`);
    setSchedulerMessage(null);
    try {
      await scheduleWorkspaceSchedulerJobNow(workspaceId, jobId);
      setSchedulerMessage('Scheduler job queued to run on the next scheduler tick.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setSchedulerMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSchedulerActionBusy(null);
    }
  };

  return {
    prCreating,
    prError,
    shippingMessage,
    cleanupBusy,
    recoveryBusy,
    recoveryResult,
    scriptActionBusy,
    scriptActionMessage,
    prDraftRefreshing,
    reviewCommentsRefreshing,
    reviewMessage,
    schedulerActionBusy,
    schedulerMessage,
    runSetupFromCockpit,
    runCheckFromCockpit,
    stopChecksFromCockpit,
    refreshPrDraftFromCockpit,
    copyPrDraftFromCockpit,
    refreshPrCommentsFromCockpit,
    pullBranchFromCockpit,
    createPrFromCockpit,
    cleanupFromCockpit,
    archiveFromCockpit,
    recoverSessionsFromCockpit,
    applyRecoveryActionFromCockpit,
    setSchedulerJobEnabledFromCockpit,
    runSchedulerJobSoonFromCockpit,
  };
}
