import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentChatEvent, AgentChatEventEnvelope, AgentChatSession } from '../../types/agent-chat';
import type { TerminalOutputEvent } from '../../types';
import type { PendingCommand } from '../modals/CommandApprovalModal';

interface UseWorkspaceTerminalEventsParams {
  workspaceId: string | null;
  enqueueOutput: (sessionId: string, chunks: TerminalOutputEvent['chunk'][]) => void;
  bumpNextSeqFromChunk: (sessionId: string, seq: number) => void;
  setPendingCommand: Dispatch<SetStateAction<PendingCommand | null>>;
  setChatSessions: Dispatch<SetStateAction<AgentChatSession[]>>;
  setChatEvents: Dispatch<SetStateAction<Record<string, AgentChatEvent[]>>>;
  refreshChatSessions: (preferredFocusId?: string | null, scope?: 'all' | 'active') => Promise<void>;
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
  setChatSessions,
  setChatEvents,
  refreshChatSessions,
  refreshReadiness,
  refreshWorkbenchState,
  refreshCoordinatorStatus,
  onCoordinatorNotify,
}: UseWorkspaceTerminalEventsParams) {
  useEffect(() => {
    if (!workspaceId) return;

    let unlistenTerminalOutput: UnlistenFn | undefined;
    let unlistenApproval: UnlistenFn | undefined;
    let unlistenAgentChat: UnlistenFn | undefined;
    let unlistenCoordinatorNotify: UnlistenFn | undefined;
    let disposed = false;

    void listen<PendingCommand>('forge://command-approval-required', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      setPendingCommand(event.payload);
    }).then((fn) => {
      if (disposed) fn(); else unlistenApproval = fn;
    }).catch(() => undefined);

    void listen<TerminalOutputEvent>('forge://terminal-output', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      const chunk = event.payload.chunk;
      enqueueOutput(chunk.sessionId, [chunk]);
      bumpNextSeqFromChunk(chunk.sessionId, chunk.seq);
    }).then((fn) => {
      if (disposed) fn(); else unlistenTerminalOutput = fn;
    }).catch(() => undefined);

    void listen<AgentChatEventEnvelope>('forge://agent-chat-event', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      const { session, event: chatEvent } = event.payload;
      setChatSessions((current) => {
        const without = current.filter((item) => item.id !== session.id);
        return [session, ...without].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      });
      setChatEvents((current) => {
        const existing = current[chatEvent.sessionId] ?? [];
        if (existing.some((item) => item.id === chatEvent.id)) return current;
        return {
          ...current,
          [chatEvent.sessionId]: [...existing, chatEvent].sort((a, b) => a.seq - b.seq),
        };
      });
      if (chatEvent.eventType === 'status' && (chatEvent.status === 'succeeded' || chatEvent.status === 'failed')) {
        window.setTimeout(() => {
          void refreshChatSessions(undefined, 'active');
          void refreshReadiness();
          void refreshWorkbenchState();
        }, 600);
      }
    }).then((fn) => {
      if (disposed) fn(); else unlistenAgentChat = fn;
    }).catch(() => undefined);

    void listen<{ workspaceId: string; message: string }>('forge://coordinator-notify', (event) => {
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
      if (unlistenAgentChat) unlistenAgentChat();
      if (unlistenCoordinatorNotify) unlistenCoordinatorNotify();
    };
  }, [
    bumpNextSeqFromChunk,
    enqueueOutput,
    refreshChatSessions,
    onCoordinatorNotify,
    refreshCoordinatorStatus,
    refreshReadiness,
    refreshWorkbenchState,
    setChatEvents,
    setChatSessions,
    setPendingCommand,
    workspaceId,
  ]);
}
