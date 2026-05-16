import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TerminalSession } from '../../types';

interface UseWorkspaceTerminalPollingParams {
  workspaceId: string | null;
  visibleSessionsRef: MutableRefObject<TerminalSession[]>;
  refreshSessions: (fetchOutput?: boolean, preferredFocusId?: string | null) => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  refreshWorkbenchState: () => Promise<void>;
  refreshCoordinatorStatus: () => Promise<void>;
}

export function useWorkspaceTerminalPolling({
  workspaceId,
  visibleSessionsRef,
  refreshSessions,
  refreshHealth,
  refreshReadiness,
  refreshWorkbenchState,
  refreshCoordinatorStatus,
}: UseWorkspaceTerminalPollingParams) {
  const metadataPollTickRef = useRef(0);

  useEffect(() => {
    if (!workspaceId) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      metadataPollTickRef.current += 1;

      const hasRunningSession = visibleSessionsRef.current.some((session) => session.status === 'running');

      if (!hasRunningSession && metadataPollTickRef.current % 6 !== 0) return;

      const shouldBackfillOutput = hasRunningSession
        ? metadataPollTickRef.current % 6 === 0
        : metadataPollTickRef.current % 18 === 0;
      const shouldRefreshExpensiveState = hasRunningSession
        ? metadataPollTickRef.current % 3 === 0
        : metadataPollTickRef.current % 12 === 0;

      void refreshSessions(shouldBackfillOutput);
      if (shouldRefreshExpensiveState) {
        void refreshHealth();
        void refreshReadiness();
        void refreshWorkbenchState();
        void refreshCoordinatorStatus();
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [
    refreshHealth,
    refreshReadiness,
    refreshSessions,
    refreshWorkbenchState,
    refreshCoordinatorStatus,
    visibleSessionsRef,
    workspaceId,
  ]);
}
