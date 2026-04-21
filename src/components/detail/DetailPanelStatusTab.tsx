import { GitPullRequest, Loader2 } from 'lucide-react';
import type { ActivityItem as ForgeActivityItem, Workspace } from '../../types';
import type { WorkspaceCockpitSummary } from '../../lib/workspace-cockpit';
import { cockpitToneClass } from '../../lib/workspace-cockpit';
import { CockpitLine, ChecksShippingPanel, LifecyclePanel, ShippingGuidePanel } from './DetailPanelCockpitSections';
import { ChangeUnderstandingPanel, ReviewBlockersPanel, SimpleNextActionsPanel } from './DetailPanelInsightsSections';
import { ActivitySection, SafeIterationSection } from './DetailPanelWorkflowSections';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceReadiness } from '../../types/workspace-readiness';
import type { WorkspacePrDraft, WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceCheckpoint, WorkspaceCheckpointRestorePlan } from '../../types/checkpoint';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceHealth, WorkspaceSessionRecoveryResult } from '../../types/workspace-health';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';

interface DetailPanelStatusTabProps {
  workspace: Workspace;
  cockpit: WorkspaceCockpitSummary;
  statusDepth: 'simple' | 'deep';
  onStatusDepthChange: (depth: 'simple' | 'deep') => void;
  changedFileCount: number;
  forgeConfig: ForgeWorkspaceConfig | null;
  workspacePrStatus: WorkspacePrStatus | null;
  workspacePrDraft: WorkspacePrDraft | null;
  prDraftRefreshing: boolean;
  reviewCockpit: WorkspaceReviewCockpit | null;
  workspaceHealth: WorkspaceHealth | null;
  checkpoints: WorkspaceCheckpoint[];
  cockpitLoading: boolean;
  scriptActionBusy: string | null;
  prCreating: boolean;
  cleanupBusy: boolean;
  recoveryBusy: boolean;
  reviewCommentsRefreshing: boolean;
  workspaceReadiness: WorkspaceReadiness | null;
  workspacePortCount: number | null;
  scriptActionMessage: string | null;
  workspaceChangedFiles: WorkspaceChangedFile[];
  reviewMessage: string | null;
  isArchived: boolean;
  recoveryResult: WorkspaceSessionRecoveryResult | null;
  shippingMessage: string | null;
  checkpointBusy: boolean;
  checkpointMessage: string | null;
  selectedCheckpointRef: string | null;
  checkpointRestorePlan: WorkspaceCheckpointRestorePlan | null;
  checkpointDiff: string | null;
  prError: string | null;
  canCreatePr: boolean;
  activityOpen: boolean;
  timelineLoading: boolean;
  timelineItems: ForgeActivityItem[];
  activityRows: Array<{ label: string; time: string }>;
  timelineExpanded: boolean;
  onOpenReviewFile?: (path?: string) => void;
  onRunFirstCheck: () => void;
  onRefreshComments: () => void;
  onRefreshDraft: () => void;
  onCopyDraft: () => void;
  onRecover: () => void;
  onCreatePr: () => void;
  onCleanup: () => void;
  onRunSetup: () => void;
  onRunCommand: (index: number) => void;
  onStopRuns: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onCreateCheckpoint: () => void;
  onPreviewCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  onRestoreCheckpoint: () => void;
  onBranchFromCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  onAbandonCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  onToggleActivityOpen: () => void;
  onToggleTimelineExpanded: () => void;
}

export function DetailPanelStatusTab({
  workspace,
  cockpit,
  statusDepth,
  onStatusDepthChange,
  changedFileCount,
  forgeConfig,
  workspacePrStatus,
  workspacePrDraft,
  prDraftRefreshing,
  reviewCockpit,
  workspaceHealth,
  checkpoints,
  cockpitLoading,
  scriptActionBusy,
  prCreating,
  cleanupBusy,
  recoveryBusy,
  reviewCommentsRefreshing,
  workspaceReadiness,
  workspacePortCount,
  scriptActionMessage,
  workspaceChangedFiles,
  reviewMessage,
  isArchived,
  recoveryResult,
  shippingMessage,
  checkpointBusy,
  checkpointMessage,
  selectedCheckpointRef,
  checkpointRestorePlan,
  checkpointDiff,
  prError,
  canCreatePr,
  activityOpen,
  timelineLoading,
  timelineItems,
  activityRows,
  timelineExpanded,
  onOpenReviewFile,
  onRunFirstCheck,
  onRefreshComments,
  onRefreshDraft,
  onCopyDraft,
  onRecover,
  onCreatePr,
  onCleanup,
  onRunSetup,
  onRunCommand,
  onStopRuns,
  onArchive,
  onDelete,
  onCreateCheckpoint,
  onPreviewCheckpoint,
  onRestoreCheckpoint,
  onBranchFromCheckpoint,
  onAbandonCheckpoint,
  onToggleActivityOpen,
  onToggleTimelineExpanded,
}: DetailPanelStatusTabProps) {
  return (
    <>
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
              onClick={() => onStatusDepthChange('simple')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${statusDepth === 'simple' ? 'bg-white/10 text-forge-text' : 'text-forge-muted hover:text-forge-text'}`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => onStatusDepthChange('deep')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${statusDepth === 'deep' ? 'bg-white/10 text-forge-text' : 'text-forge-muted hover:text-forge-text'}`}
            >
              Deep
            </button>
          </div>
        </div>
      </div>

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
          onRunFirstCheck={onRunFirstCheck}
          onOpenReviewFile={onOpenReviewFile}
          onRefreshComments={onRefreshComments}
          onRefreshDraft={onRefreshDraft}
          onCopyDraft={onCopyDraft}
          onRecover={onRecover}
          onCreatePr={onCreatePr}
          onCleanup={onCleanup}
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
            onRunSetup={onRunSetup}
            onRunCommand={onRunCommand}
            onStopRuns={onStopRuns}
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
            onRefreshComments={onRefreshComments}
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
            onCreatePr={onCreatePr}
            onRefreshDraft={onRefreshDraft}
            onCopyDraft={onCopyDraft}
            onRunFirstCheck={onRunFirstCheck}
            onCleanup={onCleanup}
          />

          <LifecyclePanel
            isArchived={isArchived}
            terminalHealth={workspaceReadiness?.terminalHealth}
            workspaceHealth={workspaceHealth}
            recoveryResult={recoveryResult}
            cleanupBusy={cleanupBusy}
            recoveryBusy={recoveryBusy}
            message={shippingMessage}
            onCleanup={onCleanup}
            onRecover={onRecover}
            onArchive={onArchive}
            onDelete={onDelete}
          />

          <SafeIterationSection
            checkpointBusy={checkpointBusy}
            checkpointMessage={checkpointMessage}
            checkpoints={checkpoints}
            selectedCheckpointRef={selectedCheckpointRef}
            checkpointRestorePlan={checkpointRestorePlan}
            checkpointDiff={checkpointDiff}
            onCreateCheckpoint={onCreateCheckpoint}
            onPreviewCheckpoint={onPreviewCheckpoint}
            onRestoreCheckpoint={onRestoreCheckpoint}
            onBranchFromCheckpoint={onBranchFromCheckpoint}
            onAbandonCheckpoint={onAbandonCheckpoint}
          />

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
                  disabled={prCreating || !canCreatePr}
                  onClick={onCreatePr}
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
        onToggleOpen={onToggleActivityOpen}
        onToggleExpanded={onToggleTimelineExpanded}
      />
    </>
  );
}
