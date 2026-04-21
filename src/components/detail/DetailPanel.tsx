import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitBranch,
  ExternalLink,
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronRight,
} from 'lucide-react';
import type {
  ActivityItem as ForgeActivityItem,
  DiscoveredRepository,
  LinkedWorktreeRef,
  Workspace,
} from '../../types';
import { listWorkspaceActivity } from '../../lib/tauri-api/activity';
import { setWorkspaceCostLimit } from '../../lib/tauri-api/workspaces';
import {
  getWorkspaceForgeConfig,
  runWorkspaceSetup,
  startWorkspaceRunCommand,
  stopWorkspaceRunCommands,
} from '../../lib/tauri-api/workspace-scripts';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { listWorkspacePorts } from '../../lib/tauri-api/workspace-ports';
import { getWorkspacePrDraft, getWorkspacePrStatus, refreshWorkspacePrDraft } from '../../lib/tauri-api/pr-draft';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { getWorkspaceChangedFiles } from '../../lib/tauri-api/git-review';
import { getWorkspaceHealth, recoverWorkspaceSessions } from '../../lib/tauri-api/workspace-health';
import { getWorkspaceReviewCockpit, refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import {
  createWorkspaceCheckpoint,
  createBranchFromWorkspaceCheckpoint,
  deleteWorkspaceCheckpoint,
  getWorkspaceCheckpointDiff,
  getWorkspaceCheckpointRestorePlan,
  listWorkspaceCheckpoints,
  restoreWorkspaceCheckpoint,
} from '../../lib/tauri-api/checkpoints';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceReadiness } from '../../types/workspace-readiness';
import type { WorkspacePrDraft, WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceCheckpoint, WorkspaceCheckpointRestorePlan } from '../../types/checkpoint';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceHealth, WorkspaceSessionRecoveryResult } from '../../types/workspace-health';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';
import { formatPrDraftMarkdown } from './DetailPanelUtils';
import { DetailPanelConfigTab } from './DetailPanelConfigTab';
import { DetailPanelStatusTab } from './DetailPanelStatusTab';

interface DetailPanelProps {
  workspace: Workspace | null;
  isArchived?: boolean;
  onCollapse?: () => void;
  onRefreshWorkspaceState?: () => void;
  onOpenInCursor?: () => void;
  onArchiveWorkspace?: () => void;
  onDeleteWorkspace?: () => void;
  onCreatePr?: () => Promise<{ prUrl: string; prNumber: number } | void>;
  onOpenReviewFile?: (path?: string) => void;
  activityItems?: ForgeActivityItem[];
  repositories?: DiscoveredRepository[];
  linkedWorktrees?: LinkedWorktreeRef[];
  onAttachLinkedWorktree?: (worktreeId: string) => void;
  onDetachLinkedWorktree?: (worktreeId: string) => void;
  onOpenLinkedWorktreeInCursor?: (path: string) => void;
  onCreateChildWorkspace?: () => void;
}

function loadCockpitSummaryData(workspaceId: string) {
  return Promise.allSettled([
    getWorkspaceForgeConfig(workspaceId),
    getWorkspaceReadiness(workspaceId),
    getWorkspaceHealth(workspaceId),
    getWorkspaceChangedFiles(workspaceId),
  ]);
}

function loadCockpitHeavyData(workspaceId: string) {
  return Promise.allSettled([
    listWorkspacePorts(workspaceId),
    getWorkspacePrStatus(workspaceId),
    getWorkspacePrDraft(workspaceId),
    getWorkspaceReviewCockpit(workspaceId, null),
    listWorkspaceCheckpoints(workspaceId),
  ]);
}

export function DetailPanel({
  workspace,
  isArchived = false,
  onCollapse,
  onRefreshWorkspaceState,
  onOpenInCursor,
  onArchiveWorkspace,
  onDeleteWorkspace,
  onCreatePr,
  onOpenReviewFile,
  activityItems = [],
  repositories = [],
  linkedWorktrees = [],
  onAttachLinkedWorktree,
  onDetachLinkedWorktree,
  onOpenLinkedWorktreeInCursor,
  onCreateChildWorkspace,
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'config'>('status');
  const [statusDepth, setStatusDepth] = useState<'simple' | 'deep'>('simple');
  const [selectedLinkedWorktreeId, setSelectedLinkedWorktreeId] = useState('');
  const [prCreating, setPrCreating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [timelineItems, setTimelineItems] = useState<ForgeActivityItem[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [workspacePrStatus, setWorkspacePrStatus] = useState<WorkspacePrStatus | null>(null);
  const [workspacePrDraft, setWorkspacePrDraft] = useState<WorkspacePrDraft | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [reviewCockpit, setReviewCockpit] = useState<WorkspaceReviewCockpit | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<WorkspaceSessionRecoveryResult | null>(null);
  const [workspacePortCount, setWorkspacePortCount] = useState<number | null>(null);
  const [workspaceChangedFiles, setWorkspaceChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [scriptActionBusy, setScriptActionBusy] = useState<string | null>(null);
  const [scriptActionMessage, setScriptActionMessage] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [selectedCheckpointRef, setSelectedCheckpointRef] = useState<string | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<string | null>(null);
  const [checkpointRestorePlan, setCheckpointRestorePlan] = useState<WorkspaceCheckpointRestorePlan | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [cockpitLoading, setCockpitLoading] = useState(false);
  const [prDraftRefreshing, setPrDraftRefreshing] = useState(false);
  const [reviewCommentsRefreshing, setReviewCommentsRefreshing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const workspaceId = workspace?.id;

  const resetCockpitState = useCallback(() => {
    setForgeConfig(null);
    setWorkspaceReadiness(null);
    setWorkspacePrStatus(null);
    setWorkspacePrDraft(null);
    setWorkspaceHealth(null);
    setReviewCockpit(null);
    setRecoveryResult(null);
    setWorkspacePortCount(null);
    setWorkspaceChangedFiles([]);
    setScriptActionBusy(null);
    setScriptActionMessage(null);
    setCheckpoints([]);
    setSelectedCheckpointRef(null);
    setCheckpointDiff(null);
    setCheckpointRestorePlan(null);
  }, []);

  const applySummaryResults = useCallback((
    [configResult, readinessResult, healthResult, changedFilesResult]: Awaited<ReturnType<typeof loadCockpitSummaryData>>,
  ) => {
    setForgeConfig(configResult.status === 'fulfilled' ? configResult.value : null);
    setWorkspaceReadiness(readinessResult.status === 'fulfilled' ? readinessResult.value : null);
    setWorkspaceHealth(healthResult.status === 'fulfilled' ? healthResult.value : null);
    setWorkspaceChangedFiles(changedFilesResult.status === 'fulfilled' ? changedFilesResult.value : []);
  }, []);

  const applyHeavyResults = useCallback((
    [portsResult, prStatusResult, prDraftResult, reviewCockpitResult, checkpointsResult]: Awaited<ReturnType<typeof loadCockpitHeavyData>>,
  ) => {
    setWorkspacePortCount(portsResult.status === 'fulfilled' ? portsResult.value.length : null);
    setWorkspacePrStatus(prStatusResult.status === 'fulfilled' ? prStatusResult.value : null);
    setWorkspacePrDraft(prDraftResult.status === 'fulfilled' ? prDraftResult.value : null);
    setReviewCockpit(reviewCockpitResult.status === 'fulfilled' ? reviewCockpitResult.value : null);
    setCheckpoints(checkpointsResult.status === 'fulfilled' ? checkpointsResult.value : []);
  }, []);

  const refreshCockpitData = useCallback(async () => {
    if (!workspaceId) return;
    const [summaryResults, heavyResults] = await Promise.all([
      loadCockpitSummaryData(workspaceId),
      loadCockpitHeavyData(workspaceId),
    ]);
    applySummaryResults(summaryResults);
    applyHeavyResults(heavyResults);
  }, [applyHeavyResults, applySummaryResults, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !activityOpen) return;
    let cancelled = false;
    setTimelineLoading(true);
    listWorkspaceActivity(workspaceId, 50)
      .then((items) => { if (!cancelled) setTimelineItems(items); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [activityOpen, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      resetCockpitState();
      return;
    }
    let cancelled = false;
    let heavyTimer: number | undefined;
    setCockpitLoading(true);

    loadCockpitSummaryData(workspaceId)
      .then((summaryResults) => {
        if (cancelled) return;
        applySummaryResults(summaryResults);
        setCockpitLoading(false);
        heavyTimer = window.setTimeout(() => {
          if (cancelled || document.hidden) return;
          void loadCockpitHeavyData(workspaceId).then((heavyResults) => {
            if (!cancelled) applyHeavyResults(heavyResults);
          });
        }, 100);
      })
      .catch(() => {
        if (!cancelled) setCockpitLoading(false);
      });

    return () => {
      cancelled = true;
      if (heavyTimer !== undefined) window.clearTimeout(heavyTimer);
    };
  }, [applyHeavyResults, applySummaryResults, resetCockpitState, workspaceId]);

  const createManualCheckpoint = async () => {
    if (!workspaceId) return;
    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const checkpoint = await createWorkspaceCheckpoint(workspaceId, 'manual checkpoint from cockpit');
      setCheckpoints(await listWorkspaceCheckpoints(workspaceId));
      setCheckpointMessage(checkpoint ? 'Checkpoint created.' : 'No local changes to checkpoint.');
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const previewCheckpoint = async (checkpoint: WorkspaceCheckpoint) => {
    if (!workspaceId) return;
    if (selectedCheckpointRef === checkpoint.reference) {
      setSelectedCheckpointRef(null);
      setCheckpointDiff(null);
      setCheckpointRestorePlan(null);
      return;
    }
    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await getWorkspaceCheckpointDiff(workspaceId, checkpoint.reference);
      const plan = await getWorkspaceCheckpointRestorePlan(workspaceId, checkpoint.reference);
      setSelectedCheckpointRef(checkpoint.reference);
      setCheckpointDiff(result.diff);
      setCheckpointRestorePlan(plan);
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

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
      const openComments = cockpit.prComments.filter((comment) => !comment.resolvedAt && comment.state !== 'resolved').length;
      setReviewMessage(`Fetched ${openComments} open PR comment(s).`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setReviewMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewCommentsRefreshing(false);
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

  const restoreSelectedCheckpoint = async () => {
    if (!workspaceId || !selectedCheckpointRef || !checkpointRestorePlan) return;
    const confirmed = window.confirm(
      [
        'Restore this checkpoint into the workspace?',
        '',
        'Forge will only continue if the current workspace is clean.',
        'The checkpoint tree will be restored into the index and working tree without creating a commit.',
      ].join('\n'),
    );
    if (!confirmed) return;

    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await restoreWorkspaceCheckpoint(workspaceId, selectedCheckpointRef);
      setCheckpointMessage(result.message);
      setCheckpoints(await listWorkspaceCheckpoints(workspaceId));
      onRefreshWorkspaceState?.();
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const branchFromCheckpoint = async (checkpoint: WorkspaceCheckpoint) => {
    if (!workspaceId) return;
    const branch = window.prompt(
      [
        'Create a branch from this checkpoint?',
        '',
        'Forge will create a Git branch at the checkpoint commit.',
        'It will not switch branches or change workspace files.',
        '',
        'Branch name:',
      ].join('\n'),
      `forge/checkpoint-${checkpoint.shortOid}`,
    );
    const branchName = branch?.trim();
    if (!branchName) return;

    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await createBranchFromWorkspaceCheckpoint(workspaceId, checkpoint.reference, branchName);
      setCheckpointMessage(result.message);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const abandonCheckpoint = async (checkpoint: WorkspaceCheckpoint) => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      [
        'Abandon this checkpoint?',
        '',
        `Forge will delete checkpoint ref ${checkpoint.reference}.`,
        'Workspace files, branches, and commits will not be changed.',
      ].join('\n'),
    );
    if (!confirmed) return;

    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await deleteWorkspaceCheckpoint(workspaceId, checkpoint.reference);
      setCheckpointMessage(result.message);
      if (selectedCheckpointRef === checkpoint.reference) {
        setSelectedCheckpointRef(null);
        setCheckpointDiff(null);
        setCheckpointRestorePlan(null);
      }
      setCheckpoints(await listWorkspaceCheckpoints(workspaceId));
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const workspaceRepositoryId = workspace?.repositoryId;
  const linkedById = useMemo(
    () => new Set(linkedWorktrees.map((item) => item.worktreeId)),
    [linkedWorktrees],
  );
  const primaryPath = workspace?.workspaceRootPath ?? workspace?.selectedWorktreePath;
  const groupedAttachOptions = useMemo(() => {
    const search = linkedSearch.trim().toLowerCase();
    return repositories.map((repo) => ({
      repoId: repo.id,
      repoName: repo.name,
      worktrees: repo.worktrees.filter((wt) => {
        if (workspaceRepositoryId && repo.id === workspaceRepositoryId) return false;
        if (linkedById.has(wt.id)) return false;
        if (primaryPath && wt.path === primaryPath) return false;
        if (!search) return true;
        return (
          repo.name.toLowerCase().includes(search)
          || wt.path.toLowerCase().includes(search)
          || (wt.branch ?? '').toLowerCase().includes(search)
        );
      }),
    })).filter((group) => group.worktrees.length > 0);
  }, [linkedById, linkedSearch, primaryPath, repositories, workspaceRepositoryId]);

  if (!workspace) {
    return (
      <aside className="w-[300px] shrink-0 h-full bg-forge-surface flex flex-col items-center justify-center">
        <div className="text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-forge-card border border-forge-border flex items-center justify-center mx-auto mb-3">
            <Activity className="w-5 h-5 text-forge-muted" />
          </div>
          <p className="text-sm font-medium text-forge-muted">No workspace selected</p>
          <p className="text-sm text-forge-muted mt-1">Select a workspace to inspect it</p>
        </div>
      </aside>
    );
  }

  const riskColor = {
    Low: 'text-forge-green',
    Medium: 'text-forge-yellow',
    High: 'text-forge-red',
  }[workspace.mergeRisk];

  const sessionStatus = workspace.agentSession?.status ?? 'idle';
  const sessionModel = workspace.agentSession?.model ?? 'not started';
  const cockpit = deriveWorkspaceCockpit(workspace, { isArchived });
  const changedFileCount = workspaceReadiness?.changedFiles
    ?? (Array.isArray(workspace.changedFiles) ? workspace.changedFiles.length : workspace.changedFiles);
  const activityRows = activityItems.slice(0, 8).map((item) => {
    const tone = item.level === 'error'
      ? { icon: AlertCircle, color: 'bg-forge-red/70' }
      : item.level === 'warning'
      ? { icon: AlertTriangle, color: 'bg-forge-yellow/70' }
      : item.level === 'success'
      ? { icon: CheckCircle2, color: 'bg-forge-green/70' }
      : { icon: Circle, color: 'bg-forge-muted/60' };
    return {
      icon: tone.icon,
      color: tone.color,
      label: item.details ? `${item.event} · ${item.details}` : item.event,
      time: item.timestamp,
    };
  });

  return (
    <aside className="w-full shrink-0 h-full bg-forge-surface flex flex-col overflow-hidden">
      {/* Header — always visible */}
      <div className="px-4 py-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-bold text-forge-text truncate flex-1">{workspace.name}</h2>
          {onCollapse && (
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onCollapse}
              title="Collapse detail panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-forge-muted mt-1">
          <span className="text-forge-text/90 font-medium">{workspace.repo}</span>
          <span className="text-forge-muted">/</span>
          <GitBranch className="w-3 h-3 shrink-0 text-forge-muted" />
          <span className="font-mono truncate text-forge-text/90">{workspace.branch}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-forge-muted">{sessionStatus} · {sessionModel}</span>
        </div>
      </div>

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'config')} className="flex flex-col flex-1 min-h-0">
        <TabsList className="px-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="status">
            <DetailPanelStatusTab
              workspace={workspace}
              cockpit={cockpit}
              statusDepth={statusDepth}
              onStatusDepthChange={setStatusDepth}
              changedFileCount={changedFileCount}
              forgeConfig={forgeConfig}
              workspacePrStatus={workspacePrStatus}
              workspacePrDraft={workspacePrDraft}
              prDraftRefreshing={prDraftRefreshing}
              reviewCockpit={reviewCockpit}
              workspaceHealth={workspaceHealth}
              checkpoints={checkpoints}
              cockpitLoading={cockpitLoading}
              scriptActionBusy={scriptActionBusy}
              prCreating={prCreating}
              cleanupBusy={cleanupBusy}
              recoveryBusy={recoveryBusy}
              reviewCommentsRefreshing={reviewCommentsRefreshing}
              workspaceReadiness={workspaceReadiness}
              workspacePortCount={workspacePortCount}
              scriptActionMessage={scriptActionMessage}
              workspaceChangedFiles={workspaceChangedFiles}
              reviewMessage={reviewMessage}
              isArchived={isArchived}
              recoveryResult={recoveryResult}
              shippingMessage={shippingMessage}
              checkpointBusy={checkpointBusy}
              checkpointMessage={checkpointMessage}
              selectedCheckpointRef={selectedCheckpointRef}
              checkpointRestorePlan={checkpointRestorePlan}
              checkpointDiff={checkpointDiff}
              prError={prError}
              canCreatePr={Boolean(onCreatePr)}
              activityOpen={activityOpen}
              timelineLoading={timelineLoading}
              timelineItems={timelineItems}
              activityRows={activityRows}
              timelineExpanded={timelineExpanded}
              onOpenReviewFile={onOpenReviewFile}
              onRunFirstCheck={() => void runCheckFromCockpit(0)}
              onRefreshComments={() => void refreshPrCommentsFromCockpit()}
              onRefreshDraft={() => void refreshPrDraftFromCockpit()}
              onCopyDraft={() => void copyPrDraftFromCockpit()}
              onRecover={() => void recoverSessionsFromCockpit()}
              onCreatePr={() => void createPrFromCockpit()}
              onCleanup={() => void cleanupFromCockpit()}
              onRunSetup={() => void runSetupFromCockpit()}
              onRunCommand={(index) => void runCheckFromCockpit(index)}
              onStopRuns={() => void stopChecksFromCockpit()}
              onArchive={onArchiveWorkspace ? archiveFromCockpit : undefined}
              onDelete={onDeleteWorkspace}
              onCreateCheckpoint={() => void createManualCheckpoint()}
              onPreviewCheckpoint={(checkpoint) => void previewCheckpoint(checkpoint)}
              onRestoreCheckpoint={() => void restoreSelectedCheckpoint()}
              onBranchFromCheckpoint={(checkpoint) => void branchFromCheckpoint(checkpoint)}
              onAbandonCheckpoint={(checkpoint) => void abandonCheckpoint(checkpoint)}
              onToggleActivityOpen={() => setActivityOpen((value) => !value)}
              onToggleTimelineExpanded={() => setTimelineExpanded((value) => !value)}
            />
          </TabsContent>

          <TabsContent value="config">
            <DetailPanelConfigTab
              workspace={workspace}
              riskColor={riskColor}
              budgetInput={budgetInput}
              onBudgetInputChange={setBudgetInput}
              onBudgetInputCommit={() => {
                const value = parseFloat(budgetInput);
                void setWorkspaceCostLimit(workspace.id, Number.isNaN(value) || value <= 0 ? null : value).catch(() => undefined);
              }}
              forgeConfig={forgeConfig}
              linkedSearch={linkedSearch}
              onLinkedSearchChange={setLinkedSearch}
              selectedLinkedWorktreeId={selectedLinkedWorktreeId}
              onSelectedLinkedWorktreeIdChange={setSelectedLinkedWorktreeId}
              groupedAttachOptions={groupedAttachOptions}
              onAttachLinkedWorktree={onAttachLinkedWorktree}
              linkedWorktrees={linkedWorktrees}
              onOpenLinkedWorktreeInCursor={onOpenLinkedWorktreeInCursor}
              onDetachLinkedWorktree={onDetachLinkedWorktree}
              onCreateChildWorkspace={onCreateChildWorkspace}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer — always visible */}
      <div className="px-4 py-3 shrink-0 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenInCursor}
          className="w-full text-forge-blue hover:bg-forge-blue/15 border border-forge-blue/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Cursor
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={archiveFromCockpit}
            disabled={!onArchiveWorkspace}
            className="flex-1"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onDeleteWorkspace}
            className="flex-1 text-forge-red/70 hover:text-forge-red hover:bg-forge-red/10"
          >
            Forget
          </Button>
        </div>
      </div>
    </aside>
  );
}
