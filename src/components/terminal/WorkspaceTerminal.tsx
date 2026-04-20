import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentProfile, ForgeWorkspaceConfig, TerminalOutputEvent, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import type { AgentChatEvent, AgentChatEventEnvelope, AgentChatNextAction, AgentChatSession } from '../../types/agent-chat';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import {
  closeWorkspaceTerminalSessionById,
  createWorkspaceTerminal,
  getWorkspaceTerminalOutputForSession,
  interruptWorkspaceTerminalSessionById,
  listWorkspaceTerminalSessions,
  listWorkspaceVisibleTerminalSessions,
  queueWorkspaceAgentPrompt,
  resizeWorkspaceTerminalSession,
  stopWorkspaceTerminalSessionById,
  writeWorkspaceTerminalSessionInput,
} from '../../lib/tauri-api/terminal';
import { CommandApprovalModal, type PendingCommand } from '../modals/CommandApprovalModal';
import {
  getWorkspaceForgeConfig,
  restartWorkspaceRunCommand,
  runWorkspaceSetup,
  startWorkspaceRunCommand,
  stopWorkspaceRunCommands,
} from '../../lib/tauri-api/workspace-scripts';
import {
  killWorkspacePortProcess,
  listWorkspacePorts,
  openWorkspacePort,
} from '../../lib/tauri-api/workspace-ports';
import { listWorkspacePromptTemplates } from '../../lib/tauri-api/prompt-templates';
import { getWorkspaceAgentContext } from '../../lib/tauri-api/agent-context';
import { getWorkspaceHealth, recoverWorkspaceSessions } from '../../lib/tauri-api/workspace-health';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { getWorkspaceChangedFiles } from '../../lib/tauri-api/git-review';
import { getWorkspaceReviewCockpit, refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import { createWorkspacePr } from '../../lib/tauri-api/pr-draft';
import {
  createAgentChatSession,
  closeAgentChatSession,
  interruptAgentChatSession,
  listAgentChatEvents,
  listAgentChatSessions,
  sendAgentChatMessage,
} from '../../lib/tauri-api/agent-chat';
import { getAiModelSettings } from '../../lib/tauri-api/settings';
import {
  defaultWorkspaceAgentProfileId,
  listWorkspaceAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { forgeWarn } from '../../lib/forge-log';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';
import { formatSessionError } from '../../lib/ui-errors';
import {
  deriveAgentRunSections,
  deriveNextActions,
  deriveWorkbenchSummary,
  latestPlanEvent,
} from '../../lib/agent-workbench';
import { TerminalPane } from './WorkspaceTerminalPane';
import { AgentChatPanel } from '../agent/AgentChatPanel';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceComposer, type ComposerSettings } from './WorkspaceComposer';
import type { PromptTemplate } from '../../types/prompt-template';
import { useSyncedRef } from '../../lib/hooks/useSyncedRef';
import { useWorkspaceTerminalOutput } from './useWorkspaceTerminalOutput';
import { WorkspaceTerminalEmptyState } from './WorkspaceTerminalEmptyState';
import { WorkspaceContextFooter } from './WorkspaceContextFooter';

interface WorkspaceTerminalProps {
  workspace: Workspace | null;
  onOpenInCursor?: () => void;
}

export function WorkspaceTerminal({ workspace, onOpenInCursor }: WorkspaceTerminalProps) {
  const [visibleSessions, setVisibleSessions] = useState<TerminalSession[]>([]);
  const [allSessions, setAllSessions] = useState<TerminalSession[]>([]);
  const [chatSessions, setChatSessions] = useState<AgentChatSession[]>([]);
  const [chatEvents, setChatEvents] = useState<Record<string, AgentChatEvent[]>>({});
  const [focusedChatId, setFocusedChatId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [ports, setPorts] = useState<WorkspacePort[]>([]);
  const [portsBusy, setPortsBusy] = useState(false);
  const [promptTemplateWarning, setPromptTemplateWarning] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [agentContext, setAgentContext] = useState<WorkspaceAgentContext | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [changedFiles, setChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [reviewCockpit, setReviewCockpit] = useState<WorkspaceReviewCockpit | null>(null);
  const [acceptedPlans, setAcceptedPlans] = useState<Record<string, string>>({});
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useAgentProfile();
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>({
    selectedClaudeAgent: 'general-purpose',
    selectedModel: 'claude-sonnet-4-6',
    selectedTaskMode: 'Act',
    selectedReasoning: 'Default',
    sendBehavior: 'send_now',
  });
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const {
    outputs,
    appendOutput,
    enqueueOutput,
    getNextSeq,
    setNextSeq,
    bumpNextSeqFromChunk,
    removeSessionOutput,
    resetOutputState,
  } = useWorkspaceTerminalOutput();
  const focusedIdRef = useSyncedRef(focusedId);
  const focusedChatIdRef = useSyncedRef(focusedChatId);
  const visibleSessionsRef = useSyncedRef(visibleSessions);
  const chatSessionsRef = useSyncedRef(chatSessions);
  const metadataPollTickRef = useRef(0);
  /** Serializes agent prompt writes so rapid Enter / Send do not race attach + PTY. */
  const promptSendChainRef = useRef(Promise.resolve());
  const workspaceId = workspace?.id ?? null;

  const setActionError = useCallback((err: unknown) => {
    const msg = formatSessionError(err);
    forgeWarn('terminal', 'action error', { err, message: msg });
    setError(msg);
  }, []);

  const focusedSession = useMemo(
    () => visibleSessions.find((session) => session.id === focusedId) ?? visibleSessions[0] ?? null,
    [focusedId, visibleSessions],
  );
  const localAgentProfiles = useMemo(
    () => agentProfiles.filter((profile) => profile.agent === 'local_llm' || profile.local),
    [agentProfiles],
  );
  const focusedChatSession = useMemo(
    () => chatSessions.find((session) => session.id === focusedChatId) ?? null,
    [chatSessions, focusedChatId],
  );
  const focusedIsAgent = !!focusedChatSession || focusedSession?.terminalKind === 'agent' || focusedSession?.sessionRole === 'agent';
  const focusedChatEvents = useMemo(
    () => focusedChatSession ? (chatEvents[focusedChatSession.id] ?? []) : [],
    [chatEvents, focusedChatSession],
  );
  const focusedRunSections = useMemo(
    () => deriveAgentRunSections(focusedChatEvents),
    [focusedChatEvents],
  );
  const focusedWorkbenchSummary = useMemo(
    () => deriveWorkbenchSummary(workspaceReadiness, changedFiles, reviewCockpit),
    [changedFiles, reviewCockpit, workspaceReadiness],
  );
  const focusedNextActions = useMemo(
    () => focusedChatSession ? deriveNextActions({
      session: focusedChatSession,
      events: focusedChatEvents,
      readiness: workspaceReadiness,
      changedFiles,
      reviewCockpit,
      hasRunCommands: (forgeConfig?.run.length ?? 0) > 0,
      hasPr: !!workspace?.prNumber,
    }) : [],
    [changedFiles, focusedChatEvents, focusedChatSession, forgeConfig?.run.length, reviewCockpit, workspace?.prNumber, workspaceReadiness],
  );

  /** Running sessions not shown in the main panes (for the attach overflow strip only). */
  const dockOverflowSessions = useMemo(() => {
    const visibleIds = new Set(visibleSessions.map((s) => s.id));
    return allSessions.filter((s) => !s.closedAt && !visibleIds.has(s.id));
  }, [allSessions, visibleSessions]);

  const refreshSessions = useCallback(async (fetchOutput = false, preferredFocusId?: string | null) => {
    if (!workspaceId) return;
    setError(null);
    try {
      const [visible, history] = await Promise.all([
        listWorkspaceVisibleTerminalSessions(workspaceId),
        listWorkspaceTerminalSessions(workspaceId),
      ]);
      const desiredFocusId = preferredFocusId ?? focusedIdRef.current;
      const nextFocusedId = desiredFocusId && visible.some((session) => session.id === desiredFocusId)
        ? desiredFocusId
        : visible[0]?.id ?? null;
      const focused = nextFocusedId ? visible.find((session) => session.id === nextFocusedId) ?? null : null;

      setVisibleSessions(visible);
      setAllSessions(history);
      focusedIdRef.current = nextFocusedId;
      setFocusedId(nextFocusedId);

      if (fetchOutput && focused) {
        const output = await getWorkspaceTerminalOutputForSession(
          workspaceId,
          focused.id,
          getNextSeq(focused.id),
        );
        setNextSeq(focused.id, output.nextSeq);
        appendOutput(focused.id, output.chunks);
      }
    } catch (err) {
      setActionError(err);
    }
  }, [appendOutput, focusedIdRef, getNextSeq, setActionError, setNextSeq, workspaceId]);

  const refreshChatSessions = useCallback(async (
    preferredFocusId?: string | null,
    scope: 'all' | 'active' = 'all',
  ) => {
    if (!workspaceId) return;
    try {
      const sessions = await listAgentChatSessions(workspaceId);
      chatSessionsRef.current = sessions;
      setChatSessions(sessions);
      const nextFocusedChatId = preferredFocusId ?? focusedChatIdRef.current;
      const focused = nextFocusedChatId && sessions.some((session) => session.id === nextFocusedChatId)
        ? nextFocusedChatId
        : sessions[0]?.id ?? null;
      focusedChatIdRef.current = focused;
      setFocusedChatId(focused);

      const sessionsNeedingEvents = scope === 'all'
        ? sessions.slice(0, 12)
        : sessions
            .filter((session) => session.id === focused || session.status === 'running')
            .slice(0, 4);

      if (sessionsNeedingEvents.length === 0) return;
      const eventPairs = await Promise.all(
        sessionsNeedingEvents.map(async (session) => [session.id, await listAgentChatEvents(session.id)] as const),
      );
      setChatEvents((current) => ({ ...current, ...Object.fromEntries(eventPairs) }));
    } catch (err) {
      setActionError(err);
    }
  }, [chatSessionsRef, focusedChatIdRef, setActionError, workspaceId]);

  const refreshForgeConfig = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setForgeConfig(await getWorkspaceForgeConfig(workspaceId));
    } catch (err) {
      setForgeConfig({
        exists: false,
        setup: [],
        run: [],
        teardown: [],
        agentProfiles: [],
        mcpServers: [],
        mcpWarnings: [],
        warning: formatSessionError(err),
      });
    }
  }, [workspaceId]);

  const refreshPorts = useCallback(async () => {
    if (!workspaceId) return;
    setPortsBusy(true);
    try {
      setPorts(await listWorkspacePorts(workspaceId));
    } catch (err) {
      forgeWarn('ports', 'scan error', { err });
      setPorts([]);
    } finally {
      setPortsBusy(false);
    }
  }, [workspaceId]);

  const refreshPromptTemplates = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const result = await listWorkspacePromptTemplates(workspaceId);
      setPromptTemplates(result.templates);
      setPromptTemplateWarning(result.warning ?? null);
    } catch (err) {
      forgeWarn('prompt-templates', 'load error', { err });
      setPromptTemplates([]);
      setPromptTemplateWarning(formatSessionError(err));
    }
  }, [workspaceId]);

  const refreshAgentContext = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setAgentContext(await getWorkspaceAgentContext(workspaceId));
    } catch (err) {
      forgeWarn('agent-context', 'load error', { err });
      setAgentContext(null);
    }
  }, [workspaceId]);

  const refreshHealth = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setWorkspaceHealth(await getWorkspaceHealth(workspaceId));
    } catch (err) {
      forgeWarn('workspace-health', 'load error', { err });
      setWorkspaceHealth(null);
      setWorkspaceReadiness(null);
    }
  }, [workspaceId]);

  const recoverSessions = async () => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      [
        'Recover stale or unhealthy sessions?',
        '',
        'Forge will close stale, detached, stuck, failed, or interrupted terminal sessions in the active view while preserving their history.',
        'After recovery, start a fresh agent tab when you are ready.',
      ].join('\n'),
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await recoverWorkspaceSessions(workspaceId);
      const warning = result.warnings.length > 0 ? ` ${result.warnings[0]}` : '';
      setError(`Recovered ${result.closedSessions} session(s); skipped ${result.skippedSessions}.${warning}`);
      await Promise.all([refreshSessions(), refreshHealth()]);
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshReadiness = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setWorkspaceReadiness(await getWorkspaceReadiness(workspaceId));
    } catch (err) {
      forgeWarn('workspace-readiness', 'load error', { err });
      setWorkspaceReadiness(null);
    }
  }, [workspaceId]);

  const refreshWorkbenchState = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [files, cockpit] = await Promise.all([
        getWorkspaceChangedFiles(workspaceId).catch(() => []),
        getWorkspaceReviewCockpit(workspaceId, null).catch(() => null),
      ]);
      setChangedFiles(files);
      setReviewCockpit(cockpit);
    } catch (err) {
      forgeWarn('agent-workbench', 'load error', { err });
      setChangedFiles([]);
      setReviewCockpit(null);
    }
  }, [workspaceId]);

  const refreshAgentProfiles = useCallback(async () => {
    try {
      const profiles = await listWorkspaceAgentProfiles(workspaceId);
      setAgentProfiles(profiles);
      setSelectedProfileId((current) =>
        profiles.some((profile) => profile.id === current) ? current : defaultWorkspaceAgentProfileId(profiles),
      );
    } catch (err) {
      forgeWarn('agent-profiles', 'load error', { err });
      setAgentProfiles([]);
    }
  }, [setSelectedProfileId, workspaceId]);

  const refreshModelSettings = useCallback(async () => {
    try {
      const settings = await getAiModelSettings();
      setComposerSettings((current) => ({ ...current, selectedModel: settings.agentModel }));
    } catch (err) {
      forgeWarn('agent-models', 'load error', { err });
    }
  }, []);

  const resetWorkspaceState = useCallback(() => {
    resetOutputState();
    promptSendChainRef.current = Promise.resolve();
    focusedIdRef.current = null;
    focusedChatIdRef.current = null;
    setVisibleSessions([]);
    setAllSessions([]);
    setChatSessions([]);
    setChatEvents({});
    setFocusedChatId(null);
    setForgeConfig(null);
    setPorts([]);
    setPromptTemplateWarning(null);
    setAgentContext(null);
    setWorkspaceHealth(null);
    setWorkspaceReadiness(null);
    setChangedFiles([]);
    setReviewCockpit(null);
    setAcceptedPlans({});
    setFocusedId(null);
    setError(null);
    setComposerSettings((current) => ({ ...current, selectedClaudeAgent: 'general-purpose' }));
  }, [focusedChatIdRef, focusedIdRef, resetOutputState]);

  useEffect(() => {
    resetWorkspaceState();
    if (workspaceId) {
      void refreshForgeConfig();
      void refreshPromptTemplates();
      void refreshAgentContext();
      void refreshAgentProfiles();
      void refreshModelSettings();
      void refreshSessions(true);
      void refreshChatSessions(undefined, 'all');
      void refreshWorkbenchState();
      const timer = window.setTimeout(() => {
        if (document.hidden) return;
        void refreshHealth();
        void refreshReadiness();
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [refreshAgentContext, refreshAgentProfiles, refreshChatSessions, refreshForgeConfig, refreshHealth, refreshModelSettings, refreshReadiness, refreshPromptTemplates, refreshSessions, refreshWorkbenchState, resetWorkspaceState, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      metadataPollTickRef.current += 1;
      const hasRunningTerminal = visibleSessionsRef.current.some((session) => session.status === 'running');
      const hasRunningChat = chatSessionsRef.current.some((session) => session.status === 'running');
      const hasRunningSession = hasRunningTerminal || hasRunningChat;

      // Idle workspaces still reconcile occasionally, but avoid doing every metadata fetch
      // on every 5s tick when there is no active session to follow.
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
  }, [chatSessionsRef, refreshChatSessions, refreshHealth, refreshReadiness, refreshSessions, refreshWorkbenchState, visibleSessionsRef, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let unlisten: UnlistenFn | undefined;
    let unlistenApproval: UnlistenFn | undefined;
    let unlistenAgentChat: UnlistenFn | undefined;
    let disposed = false;

    void listen<PendingCommand>('forge://command-approval-required', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      setPendingCommand(event.payload);
    }).then((fn) => { unlistenApproval = fn; }).catch(() => undefined);

    void listen<TerminalOutputEvent>('forge://terminal-output', (event) => {
      if (disposed || event.payload.workspaceId !== workspaceId) return;
      const chunk = event.payload.chunk;
      enqueueOutput(chunk.sessionId, [chunk]);
      bumpNextSeqFromChunk(chunk.sessionId, chunk.seq);
    }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
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
    return () => {
      disposed = true;
      if (unlisten) unlisten();
      if (unlistenApproval) unlistenApproval();
      if (unlistenAgentChat) unlistenAgentChat();
    };
  }, [bumpNextSeqFromChunk, enqueueOutput, refreshChatSessions, refreshReadiness, refreshWorkbenchState, workspaceId]);

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

  const createChatSession = async (provider: 'claude_code' | 'codex', title?: string) => {
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
      const remaining = chatSessions.filter((session) => session.id !== sessionId);
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
    if (!focusedSession) return;
    setBusy(true);
    setError(null);
    try {
      await interruptWorkspaceTerminalSessionById(focusedSession.id);
      await refreshSessions(false);
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

  const togglePlanMode = () => {
    setComposerSettings((current) => {
      const next = current.selectedTaskMode === 'Plan' ? 'Act' : 'Plan';
      return { ...current, selectedTaskMode: next, selectedClaudeAgent: next === 'Plan' ? 'Plan' : 'general-purpose' };
    });
  };

  const sendChatInstruction = async (
    text: string,
    overrides?: Partial<{
      claudeAgent: string;
      taskMode: string;
      reasoning: string;
      model: string;
    }>,
  ) => {
    if (!focusedChatSession || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendAgentChatMessage({
        sessionId: focusedChatSession.id,
        prompt: text.trim(),
        profileId: selectedProfileId,
        taskMode: overrides?.taskMode ?? composerSettings.selectedTaskMode,
        reasoning: overrides?.reasoning ?? composerSettings.selectedReasoning,
        claudeAgent: overrides?.claudeAgent ?? composerSettings.selectedClaudeAgent,
        model: overrides?.model ?? composerSettings.selectedModel,
      });
      await refreshChatSessions(focusedChatSession.id);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleWorkbenchAction = async (action: AgentChatNextAction, event?: AgentChatEvent) => {
    if (!focusedChatSession) return;
    switch (action.kind) {
      case 'accept_plan': {
        const plan = event ?? latestPlanEvent(focusedChatEvents);
        if (plan?.body) {
          setAcceptedPlans((current) => ({ ...current, [focusedChatSession.id]: plan.body }));
          setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Act', selectedClaudeAgent: 'general-purpose' }));
        }
        return;
      }
      case 'switch_to_act':
        setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Act', selectedClaudeAgent: 'general-purpose' }));
        return;
      case 'copy_plan': {
        const plan = event ?? latestPlanEvent(focusedChatEvents);
        if (plan?.body) await navigator.clipboard.writeText(plan.body).catch(setActionError);
        return;
      }
      case 'review_diff':
        await refreshWorkbenchState();
        return;
      case 'run_tests':
        if (forgeConfig?.run[0]) void startRunCommand(0);
        return;
      case 'ask_reviewer':
        setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Review', selectedClaudeAgent: 'superpowers:code-reviewer' }));
        await sendChatInstruction(
          'Review the current workspace changes. Focus on correctness, tests, merge risk, and actionable issues. Do not make edits unless a fix is clearly necessary.',
          { claudeAgent: 'superpowers:code-reviewer', taskMode: 'Review' },
        );
        return;
      case 'create_pr':
        if (workspaceId) {
          setBusy(true);
          setError(null);
          try {
            await createWorkspacePr(workspaceId);
            await refreshWorkbenchState();
            await refreshReadiness();
          } catch (err) {
            setActionError(err);
          } finally {
            setBusy(false);
          }
        }
        return;
      case 'send_failure':
        await sendChatInstruction('The previous run failed. Inspect the diagnostics, explain the failure, and propose the smallest safe fix.');
        return;
      case 'refresh_comments':
        if (workspaceId) {
          const cockpit = await refreshWorkspacePrComments(workspaceId).catch((err) => {
            setActionError(err);
            return null;
          });
          if (cockpit) setReviewCockpit(cockpit);
        }
        return;
      case 'archive_chat':
        void closeChatSession(focusedChatSession.id);
        return;
      default:
        return;
    }
  };

  const applyWorkflowPreset = (_preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => {
    void defaultPrompt;
    if (_preset === 'plan-act' || _preset === 'plan-codex-review') {
      setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Plan', selectedClaudeAgent: 'Plan' }));
    } else {
      setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Act', selectedClaudeAgent: 'general-purpose' }));
    }
  };

  const sendPrompt = (text: string) => {
    if (!workspaceId || !text.trim()) return;
    const { sendBehavior, selectedTaskMode, selectedReasoning, selectedClaudeAgent, selectedModel } = composerSettings;

    const work = async () => {
      setBusy(true);
      setError(null);
      try {
        if (focusedChatSession) {
          let prompt = text;
          const acceptedPlan = acceptedPlans[focusedChatSession.id];
          if (acceptedPlan && selectedTaskMode !== 'Plan' && !prompt.includes('Accepted implementation plan:')) {
            prompt = `Accepted implementation plan:\n${acceptedPlan}\n\nNow continue with this user request:\n${prompt}`;
          }
          if (sendBehavior === 'interrupt_send' && focusedChatSession.status === 'running') {
            await interruptAgentChatSession(focusedChatSession.id).catch(() => undefined);
          }
          await sendAgentChatMessage({
            sessionId: focusedChatSession.id,
            prompt,
            profileId: selectedProfileId,
            taskMode: selectedTaskMode,
            reasoning: selectedReasoning,
            claudeAgent: selectedClaudeAgent,
            model: selectedModel,
          });
          await refreshChatSessions(focusedChatSession.id);
          return;
        }
        if (sendBehavior === 'interrupt_send' && focusedSession) {
          await interruptWorkspaceTerminalSessionById(focusedSession.id).catch(() => undefined);
        }
        const terminalProfileId = focusedSession?.terminalKind === 'agent' ? focusedSession.profile : selectedProfileId;
        await queueWorkspaceAgentPrompt({
          workspaceId,
          prompt: text,
          profileId: terminalProfileId,
          taskMode: selectedTaskMode,
          reasoning: selectedReasoning,
        });
      } catch (err) {
        setActionError(err);
      } finally {
        setBusy(false);
      }
    };

    promptSendChainRef.current = promptSendChainRef.current.catch(() => undefined).then(work);
    void promptSendChainRef.current;
  };

  if (!workspace) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center p-8">
        <div className="text-center">
          <TerminalIcon className="mx-auto mb-3 h-8 w-8 text-forge-muted" />
          <p className="text-sm text-forge-muted">Select a workspace to start a terminal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-forge-bg">
      {pendingCommand && (
        <CommandApprovalModal
          pending={pendingCommand}
          onDismiss={() => setPendingCommand(null)}
        />
      )}
      <WorkspaceHeader
        workspace={workspace}
        ports={ports}
        portsBusy={portsBusy}
        forgeConfig={forgeConfig}
        commandBusy={commandBusy}
        workspaceHealth={workspaceHealth}
        workspaceReadiness={workspaceReadiness}
        visibleSessions={visibleSessions}
        chatSessions={chatSessions}
        dockOverflowSessions={dockOverflowSessions}
        busy={busy}
        error={error}
        focusedSession={focusedSession}
        focusedChatId={focusedChatId}
        agentProfiles={agentProfiles}
        onOpenInCursor={onOpenInCursor}
        onCreateChatSession={(provider, title) => void createChatSession(provider, title)}
        onCreateTerminal={(kind, profile, title, profileId) => void createTerminal(kind, profile, title, profileId)}
        onCopyFocusedOutput={() => void copyFocusedOutput()}
        onInterruptFocusedAgent={() => void interruptFocusedAgent()}
        onRunSetup={() => void runSetup()}
        onStartRunCommand={(index, restart) => void startRunCommand(index, restart)}
        onStopRunCommands={() => void stopRunCommands()}
        onRefreshPorts={() => void refreshPorts()}
        onOpenPort={(port) => void openPort(port)}
        onKillPort={(port) => void killPort(port)}
        onRefreshHealth={() => void refreshHealth()}
        onRecoverSessions={() => void recoverSessions()}
        onCloseTerminal={(sessionId) => void closeTerminal(sessionId)}
        onCloseChatSession={(sessionId) => void closeChatSession(sessionId)}
        onStartShell={() => void createTerminal('shell', 'shell', 'Shell')}
        onAttachTerminal={(session) => void attachTerminal(session)}
        onAttachChatSession={(sessionId) => {
          focusedChatIdRef.current = sessionId;
          setFocusedChatId(sessionId);
          focusedIdRef.current = null;
          setFocusedId(null);
          if (!chatEvents[sessionId]) void listAgentChatEvents(sessionId).then((events) => setChatEvents((current) => ({ ...current, [sessionId]: events })));
        }}
        onSetError={setError}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* Main content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {visibleSessions.length === 0 && chatSessions.length === 0 ? (
            <WorkspaceTerminalEmptyState
              busy={busy}
              localAgentProfiles={localAgentProfiles}
              onStartClaude={() => void createChatSession('claude_code', 'Claude Chat')}
              onStartCodex={() => void createChatSession('codex', 'Codex Chat')}
              onStartLocalProfile={(profile) => void createTerminal('agent', profile.agent as TerminalProfile, profile.label, profile.id)}
              onStartShell={() => void createTerminal('shell', 'shell', 'Shell')}
            />
          ) : (
            <>
              {/* Content */}
              {focusedChatSession ? (
                <AgentChatPanel
                  session={focusedChatSession}
                  events={focusedChatEvents}
                  sections={focusedRunSections}
                  summary={focusedWorkbenchSummary.changedFileCount > 0 || focusedChatSession.status === 'succeeded' ? focusedWorkbenchSummary : null}
                  nextActions={focusedNextActions}
                  acceptedPlanId={acceptedPlans[focusedChatSession.id] ? latestPlanEvent(focusedChatEvents)?.id ?? null : null}
                  onAction={(action, event) => void handleWorkbenchAction(action, event)}
                />
              ) : focusedSession ? (
                <TerminalPane
                  key={focusedSession.id}
                  session={focusedSession}
                  chunks={outputs[focusedSession.id] ?? []}
                  focused
                  stuckSince={workspaceHealth?.terminals.find((t) => t.sessionId === focusedSession.id)?.stuckSince ?? null}
                  onFocus={() => { focusedIdRef.current = focusedSession.id; setFocusedId(focusedSession.id); }}
                  onStop={() => void stopTerminal(focusedSession.id)}
                  onClose={() => void closeTerminal(focusedSession.id)}
                  onData={(data) => void writeWorkspaceTerminalSessionInput(focusedSession.id, data).catch(setActionError)}
                  onResize={(cols, rows) => void resizeWorkspaceTerminalSession(focusedSession.id, cols, rows).catch(() => undefined)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-forge-muted">
                  Select a session above.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <WorkspaceContextFooter workspaceId={workspace.id} />

      {focusedIsAgent && (
        <WorkspaceComposer
          workspaceId={workspace.id}
          focusedChatSession={focusedChatSession}
          busy={busy}
          promptTemplateWarning={promptTemplateWarning}
          promptTemplates={promptTemplates}
          agentContext={agentContext}
          settings={composerSettings}
          onSettingsChange={(patch) => setComposerSettings((current) => ({ ...current, ...patch }))}
          onSend={sendPrompt}
          onTogglePlanMode={togglePlanMode}
          onApplyWorkflowPreset={applyWorkflowPreset}
        />
      )}
    </div>
  );
}
