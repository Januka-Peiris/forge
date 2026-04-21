import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TerminalSession } from '../../types';
import type { AgentChatSession } from '../../types/agent-chat';

interface UseWorkspaceTerminalPollingParams {
  workspaceId: string | null;
  visibleSessionsRef: MutableRefObject<TerminalSession[]>;
  chatSessionsRef: MutableRefObject<AgentChatSession[]>;
  refreshSessions: (fetchOutput?: boolean, preferredFocusId?: string | null) => Promise<void>;
  refreshChatSessions: (preferredFocusId?: string | null, scope?: 'all' | 'active') => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  refreshWorkbenchState: () => Promise<void>;
}

export function useWorkspaceTerminalPolling({
  workspaceId,
  visibleSessionsRef,
  chatSessionsRef,
  refreshSessions,
  refreshChatSessions,
  refreshHealth,
  refreshReadiness,
  refreshWorkbenchState,
}: UseWorkspaceTerminalPollingParams) {
  const metadataPollTickRef = useRef(0);

  useEffect(() => {
    if (!workspaceId) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      metadataPollTickRef.current += 1;

      const hasRunningTerminal = visibleSessionsRef.current.some((session) => session.status === 'running');
      const hasRunningChat = chatSessionsRef.current.some((session) => session.status === 'running');
      const hasRunningSession = hasRunningTerminal || hasRunningChat;

      if (!hasRunningSession && metadataPollTickRef.current % 3 !== 0) return;

      const shouldBackfillOutput = hasRunningSession
        ? metadataPollTickRef.current % 6 === 0
        : metadataPollTickRef.current % 9 === 0;
      const shouldRefreshExpensiveState = hasRunningSession
        ? metadataPollTickRef.current % 3 === 0
        : metadataPollTickRef.current % 6 === 0;

      void refreshSessions(shouldBackfillOutput);
      void refreshChatSessions(undefined, 'active');
      if (shouldRefreshExpensiveState) {
        void refreshHealth();
        void refreshReadiness();
        void refreshWorkbenchState();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [
    chatSessionsRef,
    refreshChatSessions,
    refreshHealth,
    refreshReadiness,
    refreshSessions,
    refreshWorkbenchState,
    visibleSessionsRef,
    workspaceId,
  ]);
}
