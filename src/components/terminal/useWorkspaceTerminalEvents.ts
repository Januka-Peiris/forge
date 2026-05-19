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
  refreshReadiness,
  refreshWorkbenchState,
  refreshCoordinatorStatus,
  onCoordinatorNotify,
}: UseWorkspaceTerminalEventsParams) {
  useEffect(() => {
    if (!workspaceId) return;

    let unlistenTerminalOutput: UnlistenFn | undefined;
    let unlistenApproval: UnlistenFn | undefined;
    let unlistenCoordinatorNotify: UnlistenFn | undefined;
    let disposed = false;

    void listen<PendingCommand>('mn://command-approval-required', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      setPendingCommand(event.payload);
    }).then((fn) => {
      if (disposed) fn(); else unlistenApproval = fn;
    }).catch(() => undefined);

    void listen<TerminalOutputEvent>('mn://terminal-output', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      const chunk = event.payload.chunk;
      enqueueOutput(chunk.sessionId, [chunk]);
      bumpNextSeqFromChunk(chunk.sessionId, chunk.seq);
    }).then((fn) => {
      if (disposed) fn(); else unlistenTerminalOutput = fn;
    }).catch(() => undefined);

    void listen<{ workspaceId: string; message: string }>('mn://coordinator-notify', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      onCoordinatorNotify?.(event.payload);
      void refreshCoordinatorStatus();
    }).then((fn) => {
      if (disposed) fn(); else unlistenCoordinatorNotify = fn;
    }).catch(() => undefined);

    return () => {
      disposed = true;
      if (unlistenTerminalOutput) unlistenTerminalOutput();
      if (unlistenApproval) unlistenApproval();
      if (unlistenCoordinatorNotify) unlistenCoordinatorNotify();
    };
  }, [
    bumpNextSeqFromChunk,
    enqueueOutput,
    onCoordinatorNotify,
    refreshCoordinatorStatus,
    refreshReadiness,
    refreshWorkbenchState,
    setPendingCommand,
    workspaceId,
  ]);
}
