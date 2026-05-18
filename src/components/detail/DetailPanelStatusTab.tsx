import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitPullRequest, Loader2, Network, Plus } from 'lucide-react';
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
import type { WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from '../../types/task-lifecycle';
import type { WorkspaceHookInspector } from '../../types/workspace-hooks';
import type { CoordinationArtifact, CoordinationArtifactKind } from '../../types/coordination-artifact';
import { createCoordinationArtifact, listCoordinationArtifacts } from '../../lib/tauri-api/coordination-artifacts';
import { Button } from '../ui/button';

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
  workspaceTaskSnapshot: WorkspaceTaskSnapshot | null;
  workspaceSchedulerJobs: WorkspaceSchedulerJob[];
  cockpitLoading: boolean;
  scriptActionBusy: string | null;
  prCreating: boolean;
  cleanupBusy: boolean;
  recoveryBusy: boolean;
  reviewCommentsRefreshing: boolean;
  schedulerActionBusy: string | null;
  workspaceReadiness: WorkspaceReadiness | null;
  workspacePortCount: number | null;
  scriptActionMessage: string | null;
  workspaceChangedFiles: WorkspaceChangedFile[];
  workspaceHookInspector: WorkspaceHookInspector | null;
  reviewMessage: string | null;
  isArchived: boolean;
  recoveryResult: WorkspaceSessionRecoveryResult | null;
  shippingMessage: string | null;
  schedulerMessage: string | null;
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
  onApplyRecoveryAction: (sessionId: string, action: 'resume_tracking' | 'mark_interrupted' | 'close_session') => void;
  onSetSchedulerJobEnabled: (jobId: string, enabled: boolean) => void;
  onRunSchedulerJobSoon: (jobId: string) => void;
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


const COORDINATION_ARTIFACT_KIND_OPTIONS: Array<{ value: CoordinationArtifactKind; label: string }> = [
  { value: 'api_diff', label: 'API diff' },
  { value: 'schema_change', label: 'Schema change' },
  { value: 'decision_summary', label: 'Decision summary' },
  { value: 'dependency_note', label: 'Dependency note' },
  { value: 'release_ordering_note', label: 'Release ordering' },
];

function artifactKindLabel(kind: CoordinationArtifactKind): string {
  return COORDINATION_ARTIFACT_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function statusClass(status: CoordinationArtifact['status']): string {
  switch (status) {
    case 'active':
      return 'border-forge-blue/30 bg-forge-blue/10 text-forge-blue';
    case 'resolved':
      return 'border-forge-green/30 bg-forge-green/10 text-forge-green';
    case 'dismissed':
      return 'border-forge-muted/30 bg-white/5 text-forge-muted';
    case 'draft':
    default:
      return 'border-forge-yellow/30 bg-forge-yellow/10 text-forge-yellow';
  }
}

function CoordinationArtifactsSection({ workspace }: { workspace: Workspace }) {
  const [artifacts, setArtifacts] = useState<CoordinationArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactKind, setArtifactKind] = useState<CoordinationArtifactKind>('decision_summary');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArtifacts(await listCoordinationArtifacts(workspace.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    setArtifacts([]);
    setTitle('');
    setBody('');
    setTargetWorkspaceId('');
    void loadArtifacts();
  }, [loadArtifacts]);

  const canCreate = useMemo(() => title.trim().length > 0 && !saving, [saving, title]);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createCoordinationArtifact({
        sourceWorkspaceId: workspace.id,
        targetWorkspaceId: targetWorkspaceId.trim() || null,
        artifactKind,
        title: title.trim(),
        body: body.trim(),
        status: 'active',
      });
      setArtifacts((current) => [created, ...current.filter((artifact) => artifact.id !== created.id)]);
      setTitle('');
      setBody('');
      setTargetWorkspaceId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [artifactKind, body, canCreate, targetWorkspaceId, title, workspace.id]);

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-forge-orange" />
              <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Coordination artifacts</p>
            </div>
            <p className="mt-0.5 text-xs text-forge-muted">Group handoffs for this federated task.</p>
          </div>
          <Button type="button" variant="ghost" size="xs" onClick={() => void loadArtifacts()} disabled={loading || saving}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        <div className="space-y-2">
          {artifacts.length === 0 && !loading ? (
            <p className="rounded-lg border border-dashed border-forge-border/70 bg-black/10 px-2 py-2 text-xs text-forge-muted">
              No coordination artifacts yet. Add one when another repo needs a structured handoff.
            </p>
          ) : null}

          {artifacts.slice(0, 5).map((artifact) => (
            <div key={artifact.id} className="rounded-lg border border-forge-border/60 bg-black/10 px-2 py-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-forge-border/60 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forge-muted">
                      {artifactKindLabel(artifact.artifactKind)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(artifact.status)}`}>
                      {artifact.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-forge-text">{artifact.title}</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-forge-muted">
                Source <span className="font-mono text-forge-text/80">{artifact.sourceWorkspaceId}</span>
                {artifact.targetWorkspaceId ? (
                  <> · Target <span className="font-mono text-forge-text/80">{artifact.targetWorkspaceId}</span></>
                ) : (
                  <> · Group-wide</>
                )}
              </p>
              {artifact.body.trim() && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-forge-text/80">{artifact.body}</p>
              )}
            </div>
          ))}

          {artifacts.length > 5 && (
            <p className="text-[11px] text-forge-muted">Showing 5 of {artifacts.length} artifacts.</p>
          )}
        </div>

        <div className="mt-3 space-y-2 rounded-lg border border-forge-border/60 bg-black/10 p-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="space-y-1 text-xs text-forge-muted">
              Kind
              <select
                value={artifactKind}
                onChange={(event) => setArtifactKind(event.target.value as CoordinationArtifactKind)}
                className="w-full rounded border border-forge-border bg-forge-card px-2 py-1 text-xs text-forge-text"
              >
                {COORDINATION_ARTIFACT_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-forge-muted">
              Target workspace ID <span className="text-forge-muted/60">optional</span>
              <input
                value={targetWorkspaceId}
                onChange={(event) => setTargetWorkspaceId(event.target.value)}
                placeholder="Group-wide"
                className="w-full rounded border border-forge-border bg-forge-card px-2 py-1 text-xs text-forge-text placeholder:text-forge-muted/50"
              />
            </label>
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Artifact title"
            className="w-full rounded border border-forge-border bg-forge-card px-2 py-1 text-xs text-forge-text placeholder:text-forge-muted/50"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Brief handoff details…"
            rows={2}
            className="w-full resize-none rounded border border-forge-border bg-forge-card px-2 py-1 text-xs text-forge-text placeholder:text-forge-muted/50"
          />
          {error && <p className="text-xs text-forge-red">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" variant="default" size="xs" disabled={!canCreate} onClick={() => void handleCreate()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {saving ? 'Adding…' : 'Add artifact'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
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
  workspaceTaskSnapshot,
  workspaceSchedulerJobs,
  cockpitLoading,
  scriptActionBusy,
  prCreating,
  cleanupBusy,
  recoveryBusy,
  reviewCommentsRefreshing,
  schedulerActionBusy,
  workspaceReadiness,
  workspacePortCount,
  scriptActionMessage,
  workspaceChangedFiles,
  workspaceHookInspector,
  reviewMessage,
  isArchived,
  recoveryResult,
  shippingMessage,
  schedulerMessage,
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
  onApplyRecoveryAction,
  onSetSchedulerJobEnabled,
  onRunSchedulerJobSoon,
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

      <CoordinationArtifactsSection workspace={workspace} />

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
            workspaceTaskSnapshot={workspaceTaskSnapshot}
            workspaceSchedulerJobs={workspaceSchedulerJobs}
            recoveryResult={recoveryResult}
            cleanupBusy={cleanupBusy}
            recoveryBusy={recoveryBusy}
            schedulerActionBusy={schedulerActionBusy}
            schedulerMessage={schedulerMessage}
            message={shippingMessage}
            onCleanup={onCleanup}
            onRecover={onRecover}
            onApplyRecoveryAction={onApplyRecoveryAction}
            onSetSchedulerJobEnabled={onSetSchedulerJobEnabled}
            onRunSchedulerJobSoon={onRunSchedulerJobSoon}
            onArchive={onArchive}
            onDelete={onDelete}
          />

          {workspaceHookInspector && workspaceHookInspector.recentEvents.length > 0 && (
            <div className="px-4 pb-4">
              <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Recent hook / guardrail activity</p>
                <div className="mt-2 space-y-1">
                  {workspaceHookInspector.recentEvents.slice(0, 4).map((event) => (
                    <div key={event.id} className="rounded border border-forge-border/50 bg-black/10 px-2 py-1.5 text-xs">
                      <p className="text-forge-text/85">{event.label ?? event.event}</p>
                      <p className="text-[11px] text-forge-muted">{event.status} · {event.detail ?? 'No additional details'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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
