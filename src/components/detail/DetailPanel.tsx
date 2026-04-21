import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitBranch, ArrowUp, ArrowDown, AlertTriangle,
  Clock, ExternalLink, Activity, AlertCircle, CheckCircle2, Circle,
  Link2, Plus, GitPullRequest, Loader2, ChevronRight
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
import { ContextPreviewPanel } from '../context/ContextPreviewPanel';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { cockpitToneClass, deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';
import {
  CockpitLine,
  ChecksShippingPanel,
  ShippingGuidePanel,
  LifecyclePanel,
} from './DetailPanelCockpitSections';
import {
  ChangeUnderstandingPanel,
  ReviewBlockersPanel,
  WorkspaceConfigDepthPanel,
  SimpleNextActionsPanel,
} from './DetailPanelInsightsSections';
import { formatPrDraftMarkdown } from './DetailPanelUtils';
import { ActivitySection, SafeIterationSection } from './DetailPanelWorkflowSections';

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
            {/* Cockpit Overview */}
            <div className="px-4 py-4">
              <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Workspace Cockpit</p>
                    <p className="mt-0.5 text-xs text-forge-muted">Simple by default, deeper when needed.</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${cockpitToneClass(cockpit.nextActionTone)}`}>
                    {cockpit.nextAction}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <CockpitLine label="Agent" value={cockpit.agentState} />
                  <CockpitLine label="Changes" value={cockpit.changeSummary} />
                  <CockpitLine label="Checks" value={cockpit.checkSummary} />
                  <CockpitLine label="Git / PR" value={`${cockpit.prSummary} · ${cockpit.trustSummary}`} />
                </div>
                <div className="mt-3 inline-flex rounded-lg border border-forge-border bg-black/20 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStatusDepth('simple')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${statusDepth === 'simple' ? 'bg-white/10 text-forge-text' : 'text-forge-muted hover:text-forge-text'}`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusDepth('deep')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${statusDepth === 'deep' ? 'bg-white/10 text-forge-text' : 'text-forge-muted hover:text-forge-text'}`}
                  >
                    Deep
                  </button>
                </div>
              </div>
            </div>

            {/* Current Task */}
            {workspace.currentTask.trim() && (
              <div className="px-4 pb-4">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-1.5">Current Task</p>
                <p className="text-sm text-forge-text/90 leading-relaxed">{workspace.currentTask}</p>
              </div>
            )}

            {statusDepth === 'simple' ? (
              <SimpleNextActionsPanel
                changedFiles={changedFileCount}
                checkCount={forgeConfig?.run.length ?? 0}
                prStatus={workspacePrStatus}
                prDraft={workspacePrDraft}
                draftRefreshing={prDraftRefreshing}
                reviewCockpit={reviewCockpit}
                workspaceHealth={workspaceHealth}
                checkpoints={checkpoints}
                busy={cockpitLoading || Boolean(scriptActionBusy) || prCreating || cleanupBusy || recoveryBusy || reviewCommentsRefreshing}
                onRunFirstCheck={() => void runCheckFromCockpit(0)}
                onOpenReviewFile={onOpenReviewFile}
                onRefreshComments={() => void refreshPrCommentsFromCockpit()}
                onRefreshDraft={() => void refreshPrDraftFromCockpit()}
                onCopyDraft={() => void copyPrDraftFromCockpit()}
                onRecover={() => void recoverSessionsFromCockpit()}
                onCreatePr={() => void createPrFromCockpit()}
                onCleanup={() => void cleanupFromCockpit()}
              />
            ) : (
              <>
                <ChecksShippingPanel
                  config={forgeConfig}
                  readiness={workspaceReadiness}
                  prStatus={workspacePrStatus}
                  portCount={workspacePortCount}
                  loading={cockpitLoading}
                  actionBusy={scriptActionBusy}
                  actionMessage={scriptActionMessage}
                  onRunSetup={() => void runSetupFromCockpit()}
                  onRunCommand={(index) => void runCheckFromCockpit(index)}
                  onStopRuns={() => void stopChecksFromCockpit()}
                />

                <ChangeUnderstandingPanel
                  changedFiles={workspaceChangedFiles}
                  loading={cockpitLoading}
                  onOpenReviewFile={onOpenReviewFile}
                />

                <ReviewBlockersPanel
                  cockpit={reviewCockpit}
                  loading={cockpitLoading}
                  refreshing={reviewCommentsRefreshing}
                  message={reviewMessage}
                  onRefreshComments={() => void refreshPrCommentsFromCockpit()}
                  onOpenReviewFile={onOpenReviewFile}
                />

                <ShippingGuidePanel
                  changedFiles={changedFileCount}
                  runCount={forgeConfig?.run.length ?? 0}
                  prStatus={workspacePrStatus}
                  prDraft={workspacePrDraft}
                  draftRefreshing={prDraftRefreshing}
                  prCreating={prCreating}
                  cleanupBusy={cleanupBusy}
                  message={shippingMessage}
                  onCreatePr={() => void createPrFromCockpit()}
                  onRefreshDraft={() => void refreshPrDraftFromCockpit()}
                  onCopyDraft={() => void copyPrDraftFromCockpit()}
                  onRunFirstCheck={() => void runCheckFromCockpit(0)}
                  onCleanup={() => void cleanupFromCockpit()}
                />

                <LifecyclePanel
                  isArchived={isArchived}
                  terminalHealth={workspaceReadiness?.terminalHealth}
                  workspaceHealth={workspaceHealth}
                  recoveryResult={recoveryResult}
                  cleanupBusy={cleanupBusy}
                  recoveryBusy={recoveryBusy}
                  message={shippingMessage}
                  onCleanup={() => void cleanupFromCockpit()}
                  onRecover={() => void recoverSessionsFromCockpit()}
                  onArchive={onArchiveWorkspace ? archiveFromCockpit : undefined}
                  onDelete={onDeleteWorkspace}
                />

                <SafeIterationSection
                  checkpointBusy={checkpointBusy}
                  checkpointMessage={checkpointMessage}
                  checkpoints={checkpoints}
                  selectedCheckpointRef={selectedCheckpointRef}
                  checkpointRestorePlan={checkpointRestorePlan}
                  checkpointDiff={checkpointDiff}
                  onCreateCheckpoint={() => void createManualCheckpoint()}
                  onPreviewCheckpoint={(checkpoint) => void previewCheckpoint(checkpoint)}
                  onRestoreCheckpoint={() => void restoreSelectedCheckpoint()}
                  onBranchFromCheckpoint={(checkpoint) => void branchFromCheckpoint(checkpoint)}
                  onAbandonCheckpoint={(checkpoint) => void abandonCheckpoint(checkpoint)}
                />

                {/* Pull Request — prominent, dev-flow first */}
                <div className="px-4 pb-4">
              {workspace.prStatus && workspace.prNumber ? (
                <div className="flex items-center gap-2.5 rounded-lg bg-forge-green/10 border border-forge-green/20 px-3 py-2.5">
                  <GitPullRequest className="w-4 h-4 text-forge-green shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-forge-green">PR #{workspace.prNumber}</p>
                    <p className="text-xs text-forge-muted capitalize">{workspace.prStatus}</p>
                  </div>
                </div>
              ) : (
                <>
                  {prError && <p className="text-xs text-forge-red mb-2">{prError}</p>}
                  <button
                    disabled={prCreating || !onCreatePr}
                    onClick={() => void createPrFromCockpit()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-forge-green/15 hover:bg-forge-green/25 disabled:opacity-50 text-sm font-semibold text-forge-green border border-forge-green/20 transition-colors"
                  >
                    {prCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                    {prCreating ? 'Creating PR…' : 'Create Pull Request'}
                  </button>
                </>
              )}
            </div>
              </>
            )}

            <ActivitySection
              activityOpen={activityOpen}
              timelineLoading={timelineLoading}
              timelineItems={timelineItems}
              activityRows={activityRows}
              workspaceId={workspace.id}
              timelineExpanded={timelineExpanded}
              onToggleOpen={() => setActivityOpen((value) => !value)}
              onToggleExpanded={() => setTimelineExpanded((value) => !value)}
            />
          </TabsContent>

          <TabsContent value="config">
            {/* Branch Health */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-3">Branch Health</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-green mb-1">
                    <ArrowUp className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Ahead</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.aheadBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-yellow mb-1">
                    <ArrowDown className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Behind</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.behindBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-forge-muted" />
                    <span className="text-xs text-forge-muted">Risk</span>
                  </div>
                  <p className={`text-sm font-bold ${riskColor}`}>{workspace.mergeRisk}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-forge-muted">
                <Clock className="w-3 h-3 shrink-0" />
                <span>Last rebase: {workspace.lastRebase}</span>
              </div>
            </div>

            {/* Budget Cap */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Budget Cap</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(budgetInput);
                    void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat(budgetInput);
                      void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                    }
                  }}
                  placeholder={workspace.costLimitUsd ? `$${workspace.costLimitUsd.toFixed(2)}` : 'No cap'}
                  className="flex-1"
                />
                <span className="text-xs text-forge-muted shrink-0">USD</span>
              </div>
            </div>

            {/* Context Preview */}
            <div className="mx-4 pb-4">
              <ContextPreviewPanel workspaceId={workspace.id} />
            </div>

            <WorkspaceConfigDepthPanel config={forgeConfig} />

            {/* Linked Worktrees */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Linked Worktrees</p>
              <Input
                value={linkedSearch}
                onChange={(event) => setLinkedSearch(event.target.value)}
                placeholder="Search repos/worktrees..."
                className="mb-2"
              />
              <div className="flex gap-2 mb-2">
                <Select value={selectedLinkedWorktreeId} onValueChange={setSelectedLinkedWorktreeId}>
                  <SelectTrigger compact className="flex-1 min-w-0">
                    <SelectValue placeholder="Select worktree to attach" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedAttachOptions.length === 0 && (
                      <SelectItem value="" disabled>No worktrees available</SelectItem>
                    )}
                    {groupedAttachOptions.map((group) => (
                      <SelectGroup key={group.repoId}>
                        <SelectLabel>{group.repoName}</SelectLabel>
                        {group.worktrees.map((wt) => (
                          <SelectItem key={wt.id} value={wt.id}>
                            {wt.branch ?? 'detached'} · {wt.path}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => selectedLinkedWorktreeId && onAttachLinkedWorktree?.(selectedLinkedWorktreeId)}
                >
                  Attach
                </Button>
              </div>
              {linkedWorktrees.length === 0 ? (
                <p className="text-xs text-forge-muted leading-relaxed">No linked worktrees. Attach a worktree from another repo for supporting context.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedWorktrees.map((linked) => (
                    <div key={linked.worktreeId} className="rounded border border-forge-border/60 bg-forge-card/60 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-forge-text">
                        <Link2 className="w-3 h-3 text-forge-blue" />
                        <span className="font-semibold">{linked.repoName}</span>
                        <span className="font-mono text-forge-text/85">{linked.branch ?? 'detached'}</span>
                      </div>
                      <p className="mt-1 text-xs font-mono text-forge-muted truncate">{linked.path}</p>
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => onOpenLinkedWorktreeInCursor?.(linked.path)} className="text-xs text-forge-blue hover:underline">Open in Cursor</button>
                        <button onClick={() => onDetachLinkedWorktree?.(linked.worktreeId)} className="text-xs text-forge-red hover:underline">Detach</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lineage */}
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Lineage</p>
                <Button variant="secondary" size="xs" onClick={onCreateChildWorkspace}>
                  <Plus className="w-3 h-3" /> Branch From Here
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-forge-muted">Parent: <span className="font-mono text-forge-text">{workspace.parentWorkspaceId ?? 'none'}</span></p>
                <p className="text-xs text-forge-muted">Source: <span className="font-mono text-forge-text">{workspace.sourceWorkspaceId ?? 'self'}</span></p>
                <p className="text-xs text-forge-muted">Derived: <span className="font-mono text-forge-text">{workspace.derivedFromBranch ?? workspace.branch}</span></p>
              </div>
            </div>
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
