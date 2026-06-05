import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TerminalOutputEvent } from '../../types';
import type { PendingCommand } from '../modals/CommandApprovalModal';

interface UseWorkspaceTerminalEventsParams {
  workspaceId: string | null;
  enqueueOutput: (sessionId: string, chunks: TerminalOutputEvent['chunk'][]) => void;
  bumpNextSeqFromChunk: (sessionId: string, seq: number) => void;
  setPendingCommand: Dispatch<SetStateAction<PendingCommand | null>>;
  refreshReadiness: () => Promise<void>;
  refreshWorkbenchState: () => Promise<void>;
  refreshCoordinatorStatus: () => Promise<void>;
  onCoordinatorNotify?: (payload: { workspaceId: string; message: string }) => void;
}

export function useWorkspaceTerminalEvents({
  workspaceId,
  enqueueOutput,
  bumpNextSeqFromChunk,
  setPendingCommand,
  refreshCoordinatorStatus,
  onCoordinatorNotify,
}: UseWorkspaceTerminalEventsParams) {
  useEffect(() => {
    if (!workspaceId) return;

    let disposed = false;
    const promises: Promise<UnlistenFn>[] = [];

    promises.push(
      listen<PendingCommand>('mn://command-approval-required', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        setPendingCommand(event.payload);
      }).catch((err) => {
        console.warn('Failed to listen for command-approval-required:', err);
        return (() => {}) as UnlistenFn;
      }),
    );

    promises.push(
      listen<TerminalOutputEvent>('mn://terminal-output', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        const chunk = event.payload.chunk;
        enqueueOutput(chunk.sessionId, [chunk]);
        bumpNextSeqFromChunk(chunk.sessionId, chunk.seq);
      }).catch((err) => {
        console.warn('Failed to listen for terminal-output:', err);
        return (() => {}) as UnlistenFn;
      }),
    );

    promises.push(
      listen<{ workspaceId: string; message: string }>('mn://coordinator-notify', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        onCoordinatorNotify?.(event.payload);
        void refreshCoordinatorStatus();
      }).catch((err) => {
        console.warn('Failed to listen for coordinator-notify:', err);
        return (() => {}) as UnlistenFn;
      }),
    );

    return () => {
      disposed = true;
      void Promise.all(promises).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [
    bumpNextSeqFromChunk,
    enqueueOutput,
    onCoordinatorNotify,
    refreshCoordinatorStatus,
    setPendingCommand,
    workspaceId,
  ]);
}
