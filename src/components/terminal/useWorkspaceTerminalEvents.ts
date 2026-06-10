import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentDecisionPrompt, AgentDecisionResolvedEvent, AgentModeChangedEvent, TerminalOutputEvent } from '../../types';
import type { PendingCommand } from '../modals/CommandApprovalModal';

interface UseWorkspaceTerminalEventsParams {
  workspaceId: string | null;
  enqueueOutput: (sessionId: string, chunks: TerminalOutputEvent['chunk'][]) => void;
  bumpNextSeqFromChunk: (sessionId: string, seq: number) => void;
  setPendingCommand: Dispatch<SetStateAction<PendingCommand | null>>;
  setPendingDecision: Dispatch<SetStateAction<AgentDecisionPrompt | null>>;
  onAgentModeChanged: (payload: AgentModeChangedEvent) => void;
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
  setPendingDecision,
  onAgentModeChanged,
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
      listen<AgentDecisionPrompt>('mn://agent-decision-required', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        setPendingDecision(event.payload);
      }).catch((err) => {
        console.warn('Failed to listen for agent-decision-required:', err);
        return (() => {}) as UnlistenFn;
      }),
    );

    promises.push(
      listen<AgentDecisionResolvedEvent>('mn://agent-decision-resolved', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        const { sessionId } = event.payload;
        setPendingDecision((current) => (current?.sessionId === sessionId ? null : current));
      }).catch((err) => {
        console.warn('Failed to listen for agent-decision-resolved:', err);
        return (() => {}) as UnlistenFn;
      }),
    );

    promises.push(
      listen<AgentModeChangedEvent>('mn://agent-mode-changed', (event) => {
        if (disposed || event.payload.workspaceId !== workspaceId) return;
        onAgentModeChanged(event.payload);
      }).catch((err) => {
        console.warn('Failed to listen for agent-mode-changed:', err);
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
    onAgentModeChanged,
    onCoordinatorNotify,
    refreshCoordinatorStatus,
    setPendingCommand,
    setPendingDecision,
    workspaceId,
  ]);
}
