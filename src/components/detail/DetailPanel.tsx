import { useMemo, useState } from 'react';
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
import { setWorkspaceCostLimit } from '../../lib/tauri-api/workspaces';
import {
  runWorkspaceSetup,
  startWorkspaceRunCommand,
  stopWorkspaceRunCommands,
} from '../../lib/tauri-api/workspace-scripts';
import { refreshWorkspacePrDraft } from '../../lib/tauri-api/pr-draft';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { recoverWorkspaceSessions } from '../../lib/tauri-api/workspace-health';
import { refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import type { WorkspaceSessionRecoveryResult } from '../../types/workspace-health';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';
import { formatPrDraftMarkdown } from './DetailPanelUtils';
import { DetailPanelConfigTab } from './DetailPanelConfigTab';
import { DetailPanelStatusTab } from './DetailPanelStatusTab';
import { useDetailPanelCockpitState } from './useDetailPanelCockpitState';
import { useDetailPanelCheckpointActions } from './useDetailPanelCheckpointActions';

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
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [recoveryResult, setRecoveryResult] = useState<WorkspaceSessionRecoveryResult | null>(null);
  const [scriptActionBusy, setScriptActionBusy] = useState<string | null>(null);
  const [scriptActionMessage, setScriptActionMessage] = useState<string | null>(null);
  const [prDraftRefreshing, setPrDraftRefreshing] = useState(false);
  const [reviewCommentsRefreshing, setReviewCommentsRefreshing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const workspaceId = workspace?.id;
  const {
    forgeConfig,
    workspaceReadiness,
    workspacePrStatus,
    workspacePrDraft,
    workspaceHealth,
    reviewCockpit,
    workspacePortCount,
    workspaceChangedFiles,
    checkpoints,
    cockpitLoading,
    timelineItems,
    timelineLoading,
    refreshCockpitData,
    setWorkspacePrDraft,
    setReviewCockpit,
    setCheckpoints,
  } = useDetailPanelCockpitState(workspaceId, activityOpen);
  const {
    selectedCheckpointRef,
    checkpointDiff,
    checkpointRestorePlan,
    checkpointBusy,
    checkpointMessage,
    createManualCheckpoint,
    previewCheckpoint,
    restoreSelectedCheckpoint,
    branchFromCheckpoint,
    abandonCheckpoint,
  } = useDetailPanelCheckpointActions({
    workspaceId,
    refreshCockpitData,
    onRefreshWorkspaceState,
    setCheckpoints,
  });

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
