import { useCallback, useEffect, useState } from 'react';
import type { ActivityItem as ForgeActivityItem } from '../../types';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceReadiness } from '../../types/workspace-readiness';
import type { WorkspacePrDraft, WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceHealth } from '../../types/workspace-health';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import type { WorkspaceCheckpoint } from '../../types/checkpoint';
import type { WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from '../../types/task-lifecycle';
import type { WorkspaceHookInspector } from '../../types/workspace-hooks';
import { listWorkspaceActivity } from '../../lib/tauri-api/activity';
import { getWorkspaceForgeConfig, getWorkspaceHookInspector } from '../../lib/tauri-api/workspace-scripts';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { listWorkspacePorts } from '../../lib/tauri-api/workspace-ports';
import { getCachedWorkspacePrStatus, getWorkspacePrDraft, getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { getWorkspaceChangedFiles } from '../../lib/tauri-api/git-review';
import { getWorkspaceHealth } from '../../lib/tauri-api/workspace-health';
import { getWorkspaceReviewCockpit } from '../../lib/tauri-api/review-cockpit';
import { listWorkspaceCheckpoints } from '../../lib/tauri-api/checkpoints';
import { getWorkspaceTaskSnapshot, listWorkspaceSchedulerJobs } from '../../lib/tauri-api/workspace-tasks';

function loadCockpitSummaryData(workspaceId: string) {
  return Promise.allSettled([
    getWorkspaceForgeConfig(workspaceId),
    getWorkspaceHookInspector(workspaceId),
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
    getWorkspaceTaskSnapshot(workspaceId),
    listWorkspaceSchedulerJobs(workspaceId),
  ]);
}

export function useDetailPanelCockpitState(workspaceId: string | undefined, activityOpen: boolean) {
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [workspacePrStatus, setWorkspacePrStatus] = useState<WorkspacePrStatus | null>(null);
  const [workspacePrDraft, setWorkspacePrDraft] = useState<WorkspacePrDraft | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [reviewCockpit, setReviewCockpit] = useState<WorkspaceReviewCockpit | null>(null);
  const [workspacePortCount, setWorkspacePortCount] = useState<number | null>(null);
  const [workspaceChangedFiles, setWorkspaceChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [workspaceHookInspector, setWorkspaceHookInspector] = useState<WorkspaceHookInspector | null>(null);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [workspaceTaskSnapshot, setWorkspaceTaskSnapshot] = useState<WorkspaceTaskSnapshot | null>(null);
  const [workspaceSchedulerJobs, setWorkspaceSchedulerJobs] = useState<WorkspaceSchedulerJob[]>([]);
  const [cockpitLoading, setCockpitLoading] = useState(false);
  const [timelineItems, setTimelineItems] = useState<ForgeActivityItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const resetCockpitState = useCallback(() => {
    setForgeConfig(null);
    setWorkspaceReadiness(null);
    setWorkspacePrStatus(null);
    setWorkspacePrDraft(null);
    setWorkspaceHealth(null);
    setReviewCockpit(null);
    setWorkspacePortCount(null);
    setWorkspaceChangedFiles([]);
    setWorkspaceHookInspector(null);
    setCheckpoints([]);
    setWorkspaceTaskSnapshot(null);
    setWorkspaceSchedulerJobs([]);
  }, []);

  const applySummaryResults = useCallback((
    [configResult, hookInspectorResult, readinessResult, healthResult, changedFilesResult]: Awaited<ReturnType<typeof loadCockpitSummaryData>>,
  ) => {
    setForgeConfig(configResult.status === 'fulfilled' ? configResult.value : null);
    setWorkspaceHookInspector(hookInspectorResult.status === 'fulfilled' ? hookInspectorResult.value : null);
    setWorkspaceReadiness(readinessResult.status === 'fulfilled' ? readinessResult.value : null);
    setWorkspaceHealth(healthResult.status === 'fulfilled' ? healthResult.value : null);
    setWorkspaceChangedFiles(changedFilesResult.status === 'fulfilled' ? changedFilesResult.value : []);
  }, []);

  const applyHeavyResults = useCallback((
    [portsResult, prStatusResult, prDraftResult, reviewCockpitResult, checkpointsResult, taskSnapshotResult, schedulerJobsResult]: Awaited<ReturnType<typeof loadCockpitHeavyData>>,
  ) => {
    setWorkspacePortCount(portsResult.status === 'fulfilled' ? portsResult.value.length : null);
    setWorkspacePrStatus(prStatusResult.status === 'fulfilled' ? prStatusResult.value : null);
    setWorkspacePrDraft(prDraftResult.status === 'fulfilled' ? prDraftResult.value : null);
    setReviewCockpit(reviewCockpitResult.status === 'fulfilled' ? reviewCockpitResult.value : null);
    setCheckpoints(checkpointsResult.status === 'fulfilled' ? checkpointsResult.value : []);
    setWorkspaceTaskSnapshot(taskSnapshotResult.status === 'fulfilled' ? taskSnapshotResult.value : null);
    setWorkspaceSchedulerJobs(schedulerJobsResult.status === 'fulfilled' ? schedulerJobsResult.value : []);
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
    const cachedPrStatus = getCachedWorkspacePrStatus(workspaceId);
    if (cachedPrStatus) setWorkspacePrStatus(cachedPrStatus);
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

  return {
    forgeConfig,
    workspaceReadiness,
    workspacePrStatus,
    workspacePrDraft,
    workspaceHealth,
    reviewCockpit,
    workspacePortCount,
    workspaceChangedFiles,
    workspaceHookInspector,
    checkpoints,
    workspaceTaskSnapshot,
    workspaceSchedulerJobs,
    cockpitLoading,
    timelineItems,
    timelineLoading,
    refreshCockpitData,
    setWorkspacePrDraft,
    setReviewCockpit,
    setCheckpoints,
  };
}
