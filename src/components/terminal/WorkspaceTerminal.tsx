import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentProfile, ForgeWorkspaceConfig, TerminalOutputChunk, TerminalOutputEvent, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
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
import { getContextStatus } from '../../lib/tauri-api/context';
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
import {
  OUTPUT_RETENTION_CHUNKS,
  PROFILE_LABELS,
  type OutputMap,
} from './workspace-terminal-constants';
import { TerminalPane } from './WorkspaceTerminalPane';
import { AgentChatPanel } from '../agent/AgentChatPanel';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceComposer, type ComposerSettings } from './WorkspaceComposer';
import type { PromptTemplate } from '../../types/prompt-template';

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
  const [outputs, setOutputs] = useState<OutputMap>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shellRailOpen, setShellRailOpen] = useState(true);
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
  const nextSeqRef = useRef<Record<string, number>>({});
  const pendingOutputRef = useRef<Record<string, TerminalOutputChunk[]>>({});
  const outputFlushRafRef = useRef<number | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const focusedChatIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

  useEffect(() => {
    focusedChatIdRef.current = focusedChatId;
  }, [focusedChatId]);

  const appendOutput = useCallback((sessionId: string, chunks: TerminalOutputChunk[], reset = false) => {
    if (chunks.length === 0 && !reset) return;
    setOutputs((current) => ({
      ...current,
      [sessionId]: reset ? chunks : [...(current[sessionId] ?? []), ...chunks].slice(-OUTPUT_RETENTION_CHUNKS),
    }));
  }, []);

  const enqueueOutput = useCallback((sessionId: string, chunks: TerminalOutputChunk[]) => {
    if (chunks.length === 0) return;
    pendingOutputRef.current[sessionId] = [
      ...(pendingOutputRef.current[sessionId] ?? []),
      ...chunks,
    ];
    if (outputFlushRafRef.current !== null) return;
    outputFlushRafRef.current = window.requestAnimationFrame(() => {
      outputFlushRafRef.current = null;
      const pending = pendingOutputRef.current;
      pendingOutputRef.current = {};
      setOutputs((current) => {
        let next = current;
        for (const [pendingSessionId, pendingChunks] of Object.entries(pending)) {
          if (pendingChunks.length === 0) continue;
          if (next === current) next = { ...current };
          next[pendingSessionId] = [...(next[pendingSessionId] ?? []), ...pendingChunks].slice(-OUTPUT_RETENTION_CHUNKS);
        }
        return next;
      });
    });
  }, []);

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
          nextSeqRef.current[focused.id] ?? 0,
        );
        nextSeqRef.current[focused.id] = output.nextSeq;
        appendOutput(focused.id, output.chunks);
      }
    } catch (err) {
      setActionError(err);
    }
  }, [appendOutput, setActionError, workspaceId]);

  const refreshChatSessions = useCallback(async (preferredFocusId?: string | null) => {
    if (!workspaceId) return;
    try {
      const sessions = await listAgentChatSessions(workspaceId);
      setChatSessions(sessions);
      const nextFocusedChatId = preferredFocusId ?? focusedChatIdRef.current;
      const focused = nextFocusedChatId && sessions.some((session) => session.id === nextFocusedChatId)
        ? nextFocusedChatId
        : sessions[0]?.id ?? null;
      setFocusedChatId(focused);
      const eventPairs = await Promise.all(
        sessions.slice(0, 12).map(async (session) => [session.id, await listAgentChatEvents(session.id)] as const),
      );
      setChatEvents((current) => ({ ...current, ...Object.fromEntries(eventPairs) }));
    } catch (err) {
      setActionError(err);
    }
  }, [setActionError, workspaceId]);

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
    nextSeqRef.current = {};
    pendingOutputRef.current = {};
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
    promptSendChainRef.current = Promise.resolve();
    focusedIdRef.current = null;
    focusedChatIdRef.current = null;
    setOutputs({});
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
  }, []);

  useEffect(() => {
    resetWorkspaceState();
    if (workspaceId) {
      void refreshForgeConfig();
      void refreshPromptTemplates();
      void refreshAgentContext();
      void refreshAgentProfiles();
      void refreshModelSettings();
      void refreshSessions(true);
      void refreshChatSessions();
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
      const shouldBackfillOutput = metadataPollTickRef.current % 6 === 0;
      const shouldRefreshExpensiveState = metadataPollTickRef.current % 3 === 0;
      void refreshSessions(shouldBackfillOutput);
      void refreshChatSessions();
      if (shouldRefreshExpensiveState) {
        void refreshHealth();
        void refreshReadiness();
        void refreshWorkbenchState();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshChatSessions, refreshHealth, refreshReadiness, refreshSessions, refreshWorkbenchState, workspaceId]);

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
      nextSeqRef.current[chunk.sessionId] = Math.max(nextSeqRef.current[chunk.sessionId] ?? 0, chunk.seq + 1);
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
          void refreshChatSessions();
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
  }, [enqueueOutput, refreshChatSessions, refreshReadiness, refreshWorkbenchState, workspaceId]);

  const createTerminal = async (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createWorkspaceTerminal({ workspaceId, kind, profile, profileId, title });
      nextSeqRef.current[session.id] = 0;
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
        nextSeqRef.current[sessions[0].id] = 0;
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
      nextSeqRef.current[session.id] = 0;
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
      nextSeqRef.current[session.id] = 0;
      const output = await getWorkspaceTerminalOutputForSession(workspaceId, session.id, 0);
      nextSeqRef.current[session.id] = output.nextSeq;
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
      delete nextSeqRef.current[sessionId];
      setOutputs((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
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
        await queueWorkspaceAgentPrompt({
          workspaceId,
          prompt: text,
          profileId: selectedProfileId,
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
        allSessions={allSessions}
        dockOverflowSessions={dockOverflowSessions}
        busy={busy}
        error={error}
        focusedSession={focusedSession}
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
        onStartShell={() => void createTerminal('shell', 'shell', 'Shell')}
        onAttachTerminal={(session) => void attachTerminal(session)}
        onSetError={setError}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* Shell / run session rail — left column, only when shells exist */}
        {visibleSessions.length > 0 && (
          shellRailOpen ? (
            <div
              className="flex w-44 shrink-0 flex-col border-r border-forge-border/50 pr-2"
              onKeyDown={(e) => { if (e.key === 'Escape') setShellRailOpen(false); }}
            >
              <div className="mb-1 flex shrink-0 items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-forge-muted/50">Shells</span>
                <button
                  onClick={() => void createTerminal('shell', 'shell', 'Shell')}
                  className="rounded p-0.5 text-forge-muted/50 hover:bg-white/5 hover:text-forge-orange"
                  title="New shell"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-col gap-0.5 overflow-y-auto">
                {visibleSessions.map((session) => {
                  const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
                  const isActive = !focusedChatSession && focusedSession?.id === session.id;
                  const statusColor = session.status === 'running' ? 'text-forge-green' : session.status === 'failed' || session.status === 'interrupted' ? 'text-forge-red' : 'text-forge-muted/50';
                  return (
                    <div key={session.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void attachTerminal(session)}
                        className={`w-full rounded px-2 py-1.5 text-left transition-colors ${isActive ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
                        title={`${title} · ${session.status}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <TerminalIcon className={`h-3 w-3 shrink-0 ${isActive ? 'text-forge-orange' : 'text-forge-muted/50'}`} />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
                          <span className={`shrink-0 text-[10px] ${statusColor}`}>
                            {session.status === 'running' ? '●' : session.status === 'failed' ? '✕' : '○'}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void closeTerminal(session.id); }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 hidden rounded p-0.5 text-forge-muted hover:text-forge-red group-hover:block"
                        title={`Close ${title}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 flex-col items-center gap-1 border-r border-forge-border/50 pr-2">
              <button
                onClick={() => setShellRailOpen(true)}
                className="rounded p-1 text-forge-muted/50 hover:bg-white/5 hover:text-forge-text"
                title="Expand shell panel"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              {visibleSessions.map((session) => {
                const isActive = !focusedChatSession && focusedSession?.id === session.id;
                const iconColor = session.status === 'running' ? 'text-forge-green' : session.status === 'failed' || session.status === 'interrupted' ? 'text-forge-red' : 'text-forge-muted/40';
                return (
                  <button
                    key={session.id}
                    onClick={() => void attachTerminal(session)}
                    className={`rounded p-1 ${isActive ? 'text-forge-orange' : `${iconColor} hover:text-forge-text`}`}
                    title={session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile}
                  >
                    <TerminalIcon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* Main content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {visibleSessions.length === 0 && chatSessions.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-forge-border bg-forge-bg p-8 text-center">
              <div className="max-w-md">
                <TerminalIcon className="mx-auto mb-3 h-9 w-9 text-forge-muted" />
                <h2 className="text-base font-bold text-forge-text">Start a workspace terminal</h2>
                <p className="mt-1 text-sm leading-relaxed text-forge-muted">Launch agents, shells, and dev servers for this workspace.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button disabled={busy} onClick={() => void createChatSession('claude_code', 'Claude Chat')} className="rounded-lg bg-forge-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Start Claude</button>
                  <button disabled={busy} onClick={() => void createChatSession('codex', 'Codex Chat')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">Start Codex</button>
                  {agentProfiles.filter((profile) => profile.agent === 'local_llm' || profile.local).slice(0, 2).map((profile) => (
                    <button
                      key={profile.id}
                      disabled={busy}
                      onClick={() => void createTerminal('agent', profile.agent as TerminalProfile, profile.label, profile.id)}
                      className="rounded-lg border border-forge-green/30 bg-forge-green/10 px-3 py-2 text-sm font-semibold text-forge-green disabled:opacity-50"
                    >
                      Start {profile.label}
                    </button>
                  ))}
                  <button disabled={busy} onClick={() => void createTerminal('shell', 'shell', 'Shell')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">New Shell</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* AI chat tab bar */}
              {chatSessions.length > 0 && (
                <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-1 pb-1">
                  {chatSessions.map((session) => {
                    const active = focusedChatSession?.id === session.id;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          focusedChatIdRef.current = session.id;
                          setFocusedChatId(session.id);
                          focusedIdRef.current = null;
                          setFocusedId(null);
                          if (!chatEvents[session.id]) void listAgentChatEvents(session.id).then((events) => setChatEvents((current) => ({ ...current, [session.id]: events })));
                        }}
                        className={`group flex max-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${active ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-text' : 'border-transparent bg-transparent text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
                        title={`${session.title} · ${session.status} · ${session.cwd}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.status === 'running' ? 'bg-forge-green' : session.status === 'failed' || session.status === 'interrupted' ? 'bg-forge-red' : 'bg-forge-muted/50'}`} />
                        <span className="truncate text-sm font-semibold">{session.title}</span>
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(event) => { event.stopPropagation(); void closeChatSession(session.id); }}
                          className="rounded p-0.5 text-forge-muted opacity-70 hover:bg-white/10 hover:text-forge-text group-hover:opacity-100"
                          title={`Close ${session.title}`}
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Content */}
              {focusedChatSession ? (
                <AgentChatPanel
                  session={focusedChatSession}
                  events={focusedChatEvents}
                  sections={focusedRunSections}
                  summary={focusedWorkbenchSummary.changedFileCount > 0 || focusedChatSession.status === 'succeeded' ? focusedWorkbenchSummary : null}
                  nextActions={focusedNextActions}
                  acceptedPlanId={acceptedPlans[focusedChatSession.id] ? latestPlanEvent(focusedChatEvents)?.id ?? null : null}
                  onInterrupt={() => void interruptAgentChatSession(focusedChatSession.id).then((session) => {
                    setChatSessions((current) => current.map((item) => item.id === session.id ? session : item));
                    void refreshChatSessions(session.id);
                  }).catch(setActionError)}
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
                  Select a session above or open a shell on the left.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ContextFooter workspaceId={workspace.id} />

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

function ContextFooter({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = React.useState<{ stale: boolean; tokens: number; engine: string } | null>(null);

  React.useEffect(() => {
    getContextStatus(workspaceId)
      .then((s) => {
        setStatus({ stale: s.stale, tokens: (s.symbolCount ?? 0) * 3, engine: s.engine });
      })
      .catch(() => {});
  }, [workspaceId]);

  if (!status) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-0.5 border-t border-white/5 text-xs text-white/30">
      <span>ctx {status.engine}</span>
      {status.stale && (
        <span className="text-amber-400/70">[stale]</span>
      )}
    </div>
  );
}
