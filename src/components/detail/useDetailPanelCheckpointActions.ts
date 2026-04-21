import { useState } from 'react';
import {
  createWorkspaceCheckpoint,
  createBranchFromWorkspaceCheckpoint,
  deleteWorkspaceCheckpoint,
  getWorkspaceCheckpointDiff,
  getWorkspaceCheckpointRestorePlan,
  listWorkspaceCheckpoints,
  restoreWorkspaceCheckpoint,
} from '../../lib/tauri-api/checkpoints';
import type { WorkspaceCheckpoint, WorkspaceCheckpointRestorePlan } from '../../types/checkpoint';

interface UseDetailPanelCheckpointActionsParams {
  workspaceId: string | undefined;
  refreshCockpitData: () => Promise<void>;
  onRefreshWorkspaceState?: () => void;
  setCheckpoints: (checkpoints: WorkspaceCheckpoint[]) => void;
}

export function useDetailPanelCheckpointActions({
  workspaceId,
  refreshCockpitData,
  onRefreshWorkspaceState,
  setCheckpoints,
}: UseDetailPanelCheckpointActionsParams) {
  const [selectedCheckpointRef, setSelectedCheckpointRef] = useState<string | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<string | null>(null);
  const [checkpointRestorePlan, setCheckpointRestorePlan] = useState<WorkspaceCheckpointRestorePlan | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);

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

  return {
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
  };
}
