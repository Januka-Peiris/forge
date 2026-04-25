import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  closeWorkspaceTerminalSessionById,
  createWorkspaceTerminal,
  getWorkspaceTerminalOutputForSession,
  interruptWorkspaceTerminalSessionById,
  stopWorkspaceTerminalSessionById,
} from '../../lib/tauri-api/terminal';
import {
  runWorkspaceSetup,
  restartWorkspaceRunCommand,
  startWorkspaceRunCommand,
  stopWorkspaceRunCommands,
} from '../../lib/tauri-api/workspace-scripts';
import {
  killWorkspacePortProcess,
  openWorkspacePort,
} from '../../lib/tauri-api/workspace-ports';
import {
  closeAgentChatSession,
  createAgentChatSession,
  interruptAgentChatSession,
} from '../../lib/tauri-api/agent-chat';
import type { AgentChatEvent, AgentChatSession } from '../../types/agent-chat';
import type { OutputMap } from './workspace-terminal-constants';
import type { TerminalOutputChunk, TerminalProfile, TerminalSession, WorkspacePort } from '../../types';

interface UseWorkspaceTerminalSessionActionsParams {
  workspaceId: string | null;
  setSelectedProfileId: (value: string | ((current: string) => string)) => void;
  focusedSession: TerminalSession | null;
  focusedIdRef: MutableRefObject<string | null>;
  focusedChatIdRef: MutableRefObject<string | null>;
  chatSessionsRef: MutableRefObject<AgentChatSession[]>;
  outputs: OutputMap;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setCommandBusy: (busy: string | null) => void;
  setPortsBusy: (busy: boolean) => void;
  setFocusedId: (id: string | null) => void;
  setFocusedChatId: (id: string | null) => void;
  setChatEvents: Dispatch<SetStateAction<Record<string, AgentChatEvent[]>>>;
  setPorts: Dispatch<SetStateAction<WorkspacePort[]>>;
  setNextSeq: (sessionId: string, nextSeq: number) => void;
  appendOutput: (sessionId: string, chunks: TerminalOutputChunk[], reset?: boolean) => void;
  removeSessionOutput: (sessionId: string) => void;
  refreshSessions: (fetchOutput?: boolean, preferredFocusId?: string | null) => Promise<void>;
  refreshChatSessions: (preferredFocusId?: string | null) => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  setActionError: (err: unknown) => void;
}

export function useWorkspaceTerminalSessionActions({
  workspaceId,
  setSelectedProfileId,
  focusedSession,
  focusedIdRef,
  focusedChatIdRef,
  chatSessionsRef,
  outputs,
  setBusy,
  setError,
  setCommandBusy,
  setPortsBusy,
  setFocusedId,
  setFocusedChatId,
  setChatEvents,
  setPorts,
  setNextSeq,
  appendOutput,
  removeSessionOutput,
  refreshSessions,
  refreshChatSessions,
  refreshHealth,
  refreshReadiness,
  setActionError,
}: UseWorkspaceTerminalSessionActionsParams) {
  const createTerminal = async (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createWorkspaceTerminal({ workspaceId, kind, profile, profileId, title });
      if (session.terminalKind === 'agent') setSelectedProfileId(session.profile);
      setNextSeq(session.id, 0);
      focusedIdRef.current = session.id;
      setFocusedId(session.id);
      focusedChatIdRef.current = null;
      setFocusedChatId(null);
      await refreshSessions(true, session.id);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const createChatSession = async (provider: 'claude_code' | 'codex' | 'kimi_code' | 'local_llm', title?: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createAgentChatSession({ workspaceId, provider, title });
      focusedChatIdRef.current = session.id;
      setFocusedChatId(session.id);
      focusedIdRef.current = null;
      setFocusedId(null);
      await refreshChatSessions(session.id);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const closeChatSession = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await closeAgentChatSession(sessionId);
      setChatEvents((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      const remaining = chatSessionsRef.current.filter((session) => session.id !== sessionId);
      const nextFocus = remaining[0]?.id ?? null;
      focusedChatIdRef.current = nextFocus;
      setFocusedChatId(nextFocus);
      await refreshChatSessions(nextFocus);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const runSetup = async () => {
    if (!workspaceId) return;
    setCommandBusy('setup');
    setError(null);
    try {
      const sessions = await runWorkspaceSetup(workspaceId);
      if (sessions[0]) {
        setNextSeq(sessions[0].id, 0);
        focusedIdRef.current = sessions[0].id;
        setFocusedId(sessions[0].id);
      }
      await refreshSessions(true, sessions[0]?.id ?? null);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setCommandBusy(null);
    }
  };

  const startRunCommand = async (index: number, restart = false) => {
    if (!workspaceId) return;
    setCommandBusy(`${restart ? 'restart' : 'run'}-${index}`);
    setError(null);
    try {
      const session = restart
        ? await restartWorkspaceRunCommand(workspaceId, index)
        : await startWorkspaceRunCommand(workspaceId, index);
      setNextSeq(session.id, 0);
      focusedIdRef.current = session.id;
      setFocusedId(session.id);
      await refreshSessions(true, session.id);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setCommandBusy(null);
    }
  };

  const stopRunCommands = async () => {
    if (!workspaceId) return;
    setCommandBusy('stop-all-runs');
    setError(null);
    try {
      await stopWorkspaceRunCommands(workspaceId);
      await refreshSessions(false);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setCommandBusy(null);
    }
  };

  const openPort = async (port: number) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await openWorkspacePort(workspaceId, port);
    } catch (err) {
      setActionError(err);
    }
  };

  const killPort = async (port: WorkspacePort) => {
    if (!workspaceId) return;
    setPortsBusy(true);
    setError(null);
    try {
      setPorts(await killWorkspacePortProcess(workspaceId, port.port, port.pid));
      await refreshSessions(false);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setPortsBusy(false);
    }
  };

  const interruptFocusedAgent = async () => {
    const focusedChatId = focusedChatIdRef.current;
    if (!focusedSession && !focusedChatId) return;
    setBusy(true);
    setError(null);
    try {
      if (focusedChatId) {
        await interruptAgentChatSession(focusedChatId);
        await refreshChatSessions(focusedChatId);
      } else if (focusedSession) {
        await interruptWorkspaceTerminalSessionById(focusedSession.id);
        await refreshSessions(false);
      }
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const attachTerminal = async (session: TerminalSession) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      focusedChatIdRef.current = null;
      setFocusedChatId(null);
      focusedIdRef.current = session.id;
      setFocusedId(session.id);
      if (session.terminalKind === 'agent') setSelectedProfileId(session.profile);
      setNextSeq(session.id, 0);
      const output = await getWorkspaceTerminalOutputForSession(workspaceId, session.id, 0);
      setNextSeq(session.id, output.nextSeq);
      appendOutput(session.id, output.chunks, true);
      await refreshSessions(false, session.id);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
      await refreshSessions(false, session.id);
    } finally {
      setBusy(false);
    }
  };

  const stopTerminal = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await stopWorkspaceTerminalSessionById(sessionId);
      await refreshSessions(false);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const closeTerminal = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await closeWorkspaceTerminalSessionById(sessionId);
      removeSessionOutput(sessionId);
      await refreshSessions(false);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const copyFocusedOutput = async () => {
    if (!focusedSession) return;
    try {
      await navigator.clipboard.writeText((outputs[focusedSession.id] ?? []).map((chunk) => chunk.data).join(''));
    } catch (err) {
      setActionError(err);
    }
  };

  return {
    createTerminal,
    createChatSession,
    closeChatSession,
    runSetup,
    startRunCommand,
    stopRunCommands,
    openPort,
    killPort,
    interruptFocusedAgent,
    attachTerminal,
    stopTerminal,
    closeTerminal,
    copyFocusedOutput,
  };
}
