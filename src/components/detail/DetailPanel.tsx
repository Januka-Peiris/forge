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
  RefreshCw,
  GitPullRequest,
} from 'lucide-react';
import type {
  ActivityItem as ForgeActivityItem,
  DiscoveredRepository,
  LinkedWorktreeRef,
  Workspace,
} from '../../types';
import { setWorkspaceCostLimit } from '../../lib/tauri-api/workspaces';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';
import { DetailPanelConfigTab } from './DetailPanelConfigTab';
import { DetailPanelStatusTab } from './DetailPanelStatusTab';
import { useDetailPanelCockpitState } from './useDetailPanelCockpitState';
import { useDetailPanelCheckpointActions } from './useDetailPanelCheckpointActions';
import { useDetailPanelWorkflowActions } from './useDetailPanelWorkflowActions';

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
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
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
  } = useDetailPanelWorkflowActions({
    workspaceId,
    isArchived,
    workspacePrDraft,
    onCreatePr,
    onArchiveWorkspace,
    onRefreshWorkspaceState,
    refreshCockpitData,
    setWorkspacePrDraft,
    setReviewCockpit,
  });
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

  const cockpit = deriveWorkspaceCockpit(workspace || ({} as Workspace), { isArchived });
  const changedFileCount = workspaceReadiness?.changedFiles
    ?? (Array.isArray(workspace?.changedFiles) ? workspace?.changedFiles.length : workspace?.changedFiles ?? 0);

  const primaryAction = useMemo(() => {
    if (!workspace) return null;
    if (workspace.behindBy > 0) return { label: 'Pull', icon: RefreshCw, onClick: pullBranchFromCockpit, variant: 'outline' as const };
    if (!workspacePrStatus?.found && changedFileCount > 0) return { label: 'Draft PR', icon: GitPullRequest, onClick: createPrFromCockpit, variant: 'default' as const };
    if (workspacePrStatus?.url) return { label: 'View PR', icon: ExternalLink, onClick: () => window.open(workspacePrStatus.url!, '_blank'), variant: 'outline' as const };
    return null;
  }, [workspace, workspacePrStatus, changedFileCount, createPrFromCockpit, pullBranchFromCockpit]);

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
      {/* Dynamic Header */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-forge-border/40 bg-forge-bg shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2 className="text-sm font-bold text-forge-text truncate">{workspace.name}</h2>
              {workspacePrStatus?.found && (
                <span className="text-xs font-mono text-forge-muted shrink-0">#{workspacePrStatus.number}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-forge-muted">
              <span className="truncate max-w-[80px]">{workspace.repo}</span>
              <span>/</span>
              <GitBranch className="w-2.5 h-2.5 shrink-0" />
              <span className="font-mono truncate">{workspace.branch}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenInCursor && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onOpenInCursor}
                className="text-forge-muted hover:text-forge-blue hover:bg-forge-blue/10"
                title="Open in Cursor"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            {primaryAction && (
              <Button 
                variant={primaryAction.variant} 
                size="xs" 
                onClick={primaryAction.onClick}
                className={primaryAction.variant === 'default' ? 'bg-forge-green hover:bg-forge-green-high text-white shadow-electric-glow' : ''}
              >
                <primaryAction.icon className="w-3 h-3 mr-1" />
                {primaryAction.label}
              </Button>
            )}
            {onCollapse && (
              <Button variant="ghost" size="icon-xs" onClick={onCollapse} className="text-forge-muted">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Primary Status Banner */}
        <div className="flex items-center gap-3">
          {workspace.behindBy > 0 ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-forge-orange">
              <AlertTriangle className="w-3.5 h-3.5" />
              Behind by {workspace.behindBy} commit{workspace.behindBy === 1 ? '' : 's'}
            </div>
          ) : workspacePrStatus?.found ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-forge-green">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {workspacePrStatus.checksSummary === 'success' ? 'All checks passed' : workspacePrStatus.state}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-forge-muted">
              <Circle className="w-3 h-3" />
              {changedFileCount > 0 ? `${changedFileCount} files changed` : 'Clean workspace'}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-forge-muted/60 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-forge-green/40" />
            {sessionStatus}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'config')} className="flex flex-col flex-1 min-h-0">
        <TabsList className="px-4 bg-black/20 border-b border-forge-border/40">
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
              onApplyRecoveryAction={(sessionId, action) => void applyRecoveryActionFromCockpit(sessionId, action)}
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
    </aside>
  );
}
