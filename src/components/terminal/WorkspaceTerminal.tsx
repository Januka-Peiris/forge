import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, FileText, Globe2, Link2, MoreHorizontal, PlugZap, RefreshCw, RotateCcw, Settings2, Square, Terminal as TerminalIcon, Wrench, X, Zap } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentProfile, ForgeWorkspaceConfig, PromptTemplate, TerminalOutputChunk, TerminalOutputEvent, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceContextPreview, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import {
  attachWorkspaceTerminalSession,
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
import { getWorkspaceAgentContext, getWorkspaceContextPreview, refreshWorkspaceRepoContext } from '../../lib/tauri-api/agent-context';
import { getWorkspaceHealth } from '../../lib/tauri-api/workspace-health';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import {
  agentProfilesForPromptPicker,
  defaultWorkspaceAgentProfileId,
  listWorkspaceAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { forgeWarn } from '../../lib/forge-log';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';
import { measureAsync } from '../../lib/perf';
import { formatCursorOpenError, formatSessionError } from '../../lib/ui-errors';
import {
  AGENT_COMPOSER_DEFAULT_PX,
  AGENT_COMPOSER_HEIGHT_KEY,
  AGENT_COMPOSER_MAX_PX,
  AGENT_COMPOSER_MIN_PX,
  OUTPUT_RETENTION_CHUNKS,
  PROFILE_LABELS,
  roughTokenEstimateFromChars,
  type OutputMap,
} from './workspace-terminal-constants';
import {
  WorkspaceCommandsStrip,
  WorkspaceHealthStrip,
  WorkspacePortsStrip,
  WorkspaceReadinessStrip,
} from './WorkspaceTerminalStrips';
import { TerminalPane, terminalStatusBadgeClass } from './WorkspaceTerminalPane';

interface WorkspaceTerminalProps {
  workspace: Workspace | null;
  onOpenInCursor?: () => void;
}

export function WorkspaceTerminal({ workspace, onOpenInCursor }: WorkspaceTerminalProps) {
  const [visibleSessions, setVisibleSessions] = useState<TerminalSession[]>([]);
  const [allSessions, setAllSessions] = useState<TerminalSession[]>([]);
  const [outputs, setOutputs] = useState<OutputMap>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [ports, setPorts] = useState<WorkspacePort[]>([]);
  const [portsBusy, setPortsBusy] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [promptTemplateWarning, setPromptTemplateWarning] = useState<string | null>(null);
  const [agentContext, setAgentContext] = useState<WorkspaceAgentContext | null>(null);
  const [contextPreview, setContextPreview] = useState<WorkspaceContextPreview | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useAgentProfile();
  const [selectedTaskMode, setSelectedTaskMode] = useState('Act');
  const [selectedReasoning, setSelectedReasoning] = useState('Default');
  const [sendBehavior, setSendBehavior] = useState<'send_now' | 'interrupt_send'>('send_now');
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [activeHeaderTab, setActiveHeaderTab] = useState<null | 'commands' | 'ports' | 'readiness' | 'health'>(null);
  const [showComposerSettings, setShowComposerSettings] = useState(false);
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const raw = window.localStorage.getItem(AGENT_COMPOSER_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed)
      ? Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, parsed))
      : AGENT_COMPOSER_DEFAULT_PX;
  });
  const overflowRef = useRef<HTMLDivElement>(null);
  const composerSettingsRef = useRef<HTMLDivElement>(null);
  const nextSeqRef = useRef<Record<string, number>>({});
  const pendingOutputRef = useRef<Record<string, TerminalOutputChunk[]>>({});
  const outputFlushRafRef = useRef<number | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const metadataPollTickRef = useRef(0);
  /** Serializes agent prompt writes so rapid Enter / Send do not race attach + PTY. */
  const promptSendChainRef = useRef(Promise.resolve());
  /** Sum of UTF-16 code units sent via this composer for the current workspace (client-side). */
  const promptSessionCharsRef = useRef(0);
  const [promptMeter, setPromptMeter] = useState<{
    lastChars: number;
    lastEstTokens: number;
    sessionChars: number;
    sessionEstTokens: number;
  } | null>(null);
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
  const focusedIsAgent = focusedSession?.terminalKind === 'agent' || focusedSession?.sessionRole === 'agent';

  /** Running sessions not shown in the main panes (for the attach overflow strip only). */
  const dockOverflowSessions = useMemo(() => {
    const visibleIds = new Set(visibleSessions.map((s) => s.id));
    return allSessions.filter((s) => !s.closedAt && !visibleIds.has(s.id));
  }, [allSessions, visibleSessions]);

  useEffect(() => {
    if (!showOverflow) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOverflow]);

  useEffect(() => {
    if (!showComposerSettings) return;
    function handleClick(e: MouseEvent) {
      if (composerSettingsRef.current && !composerSettingsRef.current.contains(e.target as Node)) {
        setShowComposerSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showComposerSettings]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AGENT_COMPOSER_HEIGHT_KEY, String(composerHeight));
  }, [composerHeight]);

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

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

  const refreshSessions = useCallback(async (attachDisplayed = false, fetchOutput = attachDisplayed, preferredFocusId?: string | null) => {
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

      if (attachDisplayed && focused?.status === 'running') {
        await attachWorkspaceTerminalSession({ workspaceId, sessionId: focused.id }).catch(() => undefined);
      }

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

  const refreshReadiness = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setWorkspaceReadiness(await getWorkspaceReadiness(workspaceId));
    } catch (err) {
      forgeWarn('workspace-readiness', 'load error', { err });
      setWorkspaceReadiness(null);
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

  const resetWorkspaceState = useCallback(() => {
    nextSeqRef.current = {};
    pendingOutputRef.current = {};
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
    promptSendChainRef.current = Promise.resolve();
    promptSessionCharsRef.current = 0;
    setPromptMeter(null);
    focusedIdRef.current = null;
    setOutputs({});
    setVisibleSessions([]);
    setAllSessions([]);
    setForgeConfig(null);
    setPorts([]);
    setPromptTemplates([]);
    setPromptTemplateWarning(null);
    setAgentContext(null);
    setContextPreview(null);
    setContextBusy(false);
    setWorkspaceHealth(null);
    setWorkspaceReadiness(null);
    setFocusedId(null);
    setPromptInput('');
    setError(null);
  }, []);

  useEffect(() => {
    resetWorkspaceState();
    if (workspaceId) {
      void refreshForgeConfig();
      void refreshPromptTemplates();
      void refreshAgentContext();
      void refreshAgentProfiles();
      void refreshSessions(false, true);
      const timer = window.setTimeout(() => {
        if (document.hidden) return;
        void refreshHealth();
        void refreshReadiness();
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [refreshAgentContext, refreshAgentProfiles, refreshForgeConfig, refreshHealth, refreshReadiness, refreshPromptTemplates, refreshSessions, resetWorkspaceState, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      metadataPollTickRef.current += 1;
      const shouldBackfillOutput = metadataPollTickRef.current % 6 === 0;
      const shouldRefreshExpensiveState = metadataPollTickRef.current % 3 === 0;
      void refreshSessions(false, shouldBackfillOutput);
      if (shouldRefreshExpensiveState) {
        void refreshHealth();
        void refreshReadiness();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth, refreshReadiness, refreshSessions, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let unlisten: UnlistenFn | undefined;
    let unlistenApproval: UnlistenFn | undefined;
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
    return () => {
      disposed = true;
      if (unlisten) unlisten();
      if (unlistenApproval) unlistenApproval();
    };
  }, [enqueueOutput, workspaceId]);

  const createTerminal = async (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createWorkspaceTerminal({ workspaceId, kind, profile, profileId, title });
      nextSeqRef.current[session.id] = 0;
      focusedIdRef.current = session.id;
      setFocusedId(session.id);
      await refreshSessions(true, true, session.id);
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
      await refreshSessions(true, true, sessions[0]?.id ?? null);
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
      await refreshSessions(true, true, session.id);
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

  const injectTemplate = (template: PromptTemplate) => {
    setPromptInput((current) => {
      const prefix = current.trim().length > 0 ? `${current.trim()}\n\n` : '';
      return `${prefix}${template.body.trim()}`;
    });
  };

  const injectLinkedContext = () => {
    if (!agentContext?.promptPreamble.trim()) return;
    setPromptInput((current) => {
      if (current.includes('Forge linked repository context:')) return current;
      const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
      return `${agentContext.promptPreamble}${suffix}`;
    });
  };

  /** Loads repo context (paths + changed-file diffs), shows preview, appends to prompt once. */
  const addRepoContextToPrompt = async () => {
    if (!workspaceId) return;
    setContextBusy(true);
    setError(null);
    try {
      const preview = await getWorkspaceContextPreview(workspaceId);
      setContextPreview(preview);
      if (!preview.promptContext.trim()) return;
      setPromptInput((current) => {
        if (current.includes('Forge repo context:')) return current;
        const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
        return `${preview.promptContext}${suffix}`;
      });
      setShowComposerSettings(false);
    } catch (err) {
      setActionError(err);
      setContextPreview(null);
    } finally {
      setContextBusy(false);
    }
  };

  /** Regenerates cached path list from git, then refreshes preview (does not inject). */
  const refreshRepoPathMap = async () => {
    if (!workspaceId) return;
    setContextBusy(true);
    setError(null);
    try {
      const preview = await refreshWorkspaceRepoContext(workspaceId);
      setContextPreview(preview);
      setShowComposerSettings(false);
    } catch (err) {
      setActionError(err);
    } finally {
      setContextBusy(false);
    }
  };

  const attachTerminal = async (session: TerminalSession) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      focusedIdRef.current = session.id;
      setFocusedId(session.id);
      if (session.status === 'running') {
        await measureAsync('terminal:attach', () => attachWorkspaceTerminalSession({ workspaceId, sessionId: session.id }));
      }
      nextSeqRef.current[session.id] = 0;
      const output = await getWorkspaceTerminalOutputForSession(workspaceId, session.id, 0);
      nextSeqRef.current[session.id] = output.nextSeq;
      appendOutput(session.id, output.chunks, true);
      await refreshSessions(false, false, session.id);
      await refreshHealth();
      await refreshReadiness();
    } catch (err) {
      setActionError(err);
      await refreshSessions(false, false, session.id);
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

  const sendPrompt = (mode: 'send_now' | 'interrupt_send' = sendBehavior) => {
    if (!workspaceId || !promptInput.trim()) return;
    const text = promptInput.trim();
    setPromptInput('');

    const work = async () => {
      setBusy(true);
      setError(null);
      try {
        if (mode === 'interrupt_send' && focusedSession) {
          await interruptWorkspaceTerminalSessionById(focusedSession.id).catch(() => undefined);
        }
        await queueWorkspaceAgentPrompt({
          workspaceId,
          prompt: text,
          profileId: selectedProfileId,
          taskMode: selectedTaskMode,
          reasoning: selectedReasoning,
        });
        const charCount = text.length;
        promptSessionCharsRef.current += charCount;
        const sessionChars = promptSessionCharsRef.current;
        setPromptMeter({
          lastChars: charCount,
          lastEstTokens: roughTokenEstimateFromChars(charCount),
          sessionChars,
          sessionEstTokens: roughTokenEstimateFromChars(sessionChars),
        });
      } catch (err) {
        setPromptInput((prev) => (prev.trim() ? `${text}\n\n${prev}` : text));
        setActionError(err);
      } finally {
        setBusy(false);
      }
    };

    promptSendChainRef.current = promptSendChainRef.current.catch(() => undefined).then(work);
    void promptSendChainRef.current;
  };

  const startComposerResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setComposerHeight(Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, startHeight + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
      <div className="sticky top-0 z-10 shrink-0 border-b border-forge-border bg-forge-surface/95 px-4 py-2.5 backdrop-blur">
        {/* Title + primary actions row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TerminalIcon className="h-4 w-4 shrink-0 text-forge-orange" />
            <h1 className="truncate text-base font-bold text-forge-text">{workspace.name}</h1>
            <span className="shrink-0 rounded-full border border-forge-border bg-white/5 px-2 py-0.5 text-xs font-bold uppercase text-forge-muted">
              {visibleSessions.filter((session) => session.status === 'running').length} running
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button disabled={busy} onClick={() => void createTerminal('shell', 'shell', 'Shell')} className="rounded-lg border border-forge-border bg-white/5 px-2.5 py-1.5 text-sm font-semibold text-forge-text/85 hover:bg-white/10 disabled:opacity-50">
              New Shell
            </button>
            <button disabled={busy} onClick={() => void createTerminal('agent', 'codex', 'Codex')} className="rounded-lg border border-forge-blue/30 bg-forge-blue/10 px-2.5 py-1.5 text-sm font-semibold text-forge-blue hover:bg-forge-blue/20 disabled:opacity-50">
              New Codex
            </button>
            <button disabled={busy} onClick={() => void createTerminal('agent', 'claude_code', 'Claude')} className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-2.5 py-1.5 text-sm font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50">
              New Claude
            </button>
            {/* Overflow menu */}
            <div ref={overflowRef} className="relative">
              <button
                onClick={() => setShowOverflow((v) => !v)}
                className="rounded-lg border border-forge-border bg-white/5 p-1.5 text-forge-muted hover:bg-white/10 hover:text-forge-text"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showOverflow && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-forge-border bg-forge-surface shadow-lg">
                  <button
                    disabled={busy}
                    onClick={() => { void createTerminal('shell', 'shell', 'Shell'); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New shell tab
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { void createTerminal('agent', 'codex', 'Codex'); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New Codex tab
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { void createTerminal('agent', 'claude_code', 'Claude'); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New Claude tab
                  </button>
                  <button
                    disabled={!focusedSession}
                    onClick={() => { void copyFocusedOutput(); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy output
                  </button>
                  <button
                    disabled={busy || !focusedSession}
                    title="Sends interrupt (e.g. Ctrl+C) to the focused terminal tab"
                    onClick={() => {
                      void interruptFocusedAgent();
                      setShowOverflow(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    <Square className="h-3.5 w-3.5 text-forge-yellow" /> Interrupt terminal
                  </button>
                  {onOpenInCursor && (
                    <button
                      onClick={() => { try { onOpenInCursor(); } catch (err) { setError(formatCursorOpenError(err)); } setShowOverflow(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-forge-blue hover:bg-white/5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open in Cursor
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact status line */}
        <div className="mt-1.5 flex items-center gap-2 text-sm">
          <p className="min-w-0 flex-1 truncate font-mono text-forge-muted">
            {workspace.repo} / {workspace.branch} · {workspace.workspaceRootPath ?? workspace.selectedWorktreePath ?? 'no root'}
          </p>
        </div>

        {/* Header tab bar — only shown when there's at least one strip to show */}
        {(forgeConfig !== null || workspaceId !== null || workspaceReadiness !== null || workspaceHealth !== null) && (
          <div className="mt-2 flex items-center gap-0.5">
            {forgeConfig !== null && (
              <button
                onClick={() => setActiveHeaderTab((v) => v === 'commands' ? null : 'commands')}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition-colors ${activeHeaderTab === 'commands' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <Wrench className="h-3 w-3" />
                Commands
                {forgeConfig.warning && <span className="rounded-full border border-forge-yellow/25 bg-forge-yellow/10 px-1 text-xs text-forge-yellow">!</span>}
                {forgeConfig.exists && !forgeConfig.warning && <span className="rounded-full border border-forge-green/25 bg-forge-green/10 px-1 text-xs text-forge-green">✓</span>}
                {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length > 0 && (
                  <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-xs text-forge-blue">
                    {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length}
                  </span>
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'commands' ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveHeaderTab((v) => v === 'ports' ? null : 'ports')}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition-colors ${activeHeaderTab === 'ports' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
            >
              <Globe2 className="h-3 w-3" />
              Testing
              {ports.length > 0 && (
                <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-xs text-forge-blue">
                  {ports.length}
                </span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'ports' ? 'rotate-180' : ''}`} />
            </button>
            {workspaceReadiness !== null && (
              <button
                onClick={() => setActiveHeaderTab((v) => v === 'readiness' ? null : 'readiness')}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition-colors ${activeHeaderTab === 'readiness' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <RotateCcw className="h-3 w-3" />
                Readiness
                <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'readiness' ? 'rotate-180' : ''}`} />
              </button>
            )}
            {workspaceHealth !== null && (
              <button
                onClick={() => setActiveHeaderTab((v) => v === 'health' ? null : 'health')}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition-colors ${activeHeaderTab === 'health' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <RefreshCw className="h-3 w-3" />
                Health
                <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'health' ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        {/* Active strip content */}
        {activeHeaderTab === 'commands' && (
          <WorkspaceCommandsStrip
            config={forgeConfig}
            runningRunCount={visibleSessions.filter((session) => session.terminalKind === 'run' && session.status === 'running').length}
            busy={busy || commandBusy !== null}
            commandBusy={commandBusy}
            onRunSetup={() => void runSetup()}
            onStartRun={(index) => void startRunCommand(index)}
            onRestartRun={(index) => void startRunCommand(index, true)}
            onStopRuns={() => void stopRunCommands()}
          />
        )}
        {activeHeaderTab === 'ports' && (
          <WorkspacePortsStrip
            ports={ports}
            busy={portsBusy}
            onRefresh={() => void refreshPorts()}
            onOpen={(port) => void openPort(port)}
            onKill={(port) => void killPort(port)}
          />
        )}
        {activeHeaderTab === 'readiness' && workspaceReadiness && (
          <WorkspaceReadinessStrip readiness={workspaceReadiness} />
        )}
        {activeHeaderTab === 'health' && workspaceHealth && (
          <WorkspaceHealthStrip
            health={workspaceHealth}
            displayPortCount={ports.length}
            busy={busy}
            onRefresh={() => void refreshHealth()}
            onRecover={(sessionId) => {
              const session = allSessions.find((item) => item.id === sessionId);
              if (session) void attachTerminal(session);
            }}
            onClose={(sessionId) => void closeTerminal(sessionId)}
            onStartShell={() => void createTerminal('shell', 'shell', 'Shell')}
          />
        )}

        {error && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-forge-red/20 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">
            <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {dockOverflowSessions.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {dockOverflowSessions.slice(0, 12).map((session) => (
              <button key={session.id} onClick={() => void attachTerminal(session)} className="shrink-0 rounded border border-forge-border bg-white/5 px-2 py-1 text-xs text-forge-muted hover:bg-white/10">
                {session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile} · {session.status}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {visibleSessions.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-forge-border bg-forge-bg p-8 text-center">
            <div className="max-w-md">
              <TerminalIcon className="mx-auto mb-3 h-9 w-9 text-forge-muted" />
              <h2 className="text-base font-bold text-forge-text">Start a workspace terminal</h2>
              <p className="mt-1 text-sm leading-relaxed text-forge-muted">
                Launch agents, shells, and dev servers for this workspace.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button disabled={busy} onClick={() => void createTerminal('agent', 'claude_code', 'Claude')} className="rounded-lg bg-forge-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Start Claude</button>
                <button disabled={busy} onClick={() => void createTerminal('agent', 'codex', 'Codex')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">Start Codex</button>
                <button disabled={busy} onClick={() => void createTerminal('shell', 'shell', 'Shell')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">New Shell</button>
              </div>
            </div>
          </div>
        ) : focusedSession ? (
          <>
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-forge-border bg-forge-surface/85 p-1">
              {visibleSessions.map((session) => {
                const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
                const active = focusedSession.id === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => void attachTerminal(session)}
                    className={`group flex max-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${active ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-text' : 'border-transparent bg-transparent text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
                    title={`${title} · ${session.status} · ${session.cwd}`}
                  >
                    <span className="truncate text-sm font-semibold">{title}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-xs font-bold uppercase ${terminalStatusBadgeClass(session)}`}>
                      {session.stale ? 'stale' : session.status}
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => { event.stopPropagation(); void closeTerminal(session.id); }}
                      className="rounded p-0.5 text-forge-muted opacity-70 hover:bg-white/10 hover:text-forge-text group-hover:opacity-100"
                      title={`Close ${title}`}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
            <TerminalPane
              key={focusedSession.id}
              session={focusedSession}
              chunks={outputs[focusedSession.id] ?? []}
              focused
              stuckSince={workspaceHealth?.terminals.find((t) => t.sessionId === focusedSession.id)?.stuckSince ?? null}
              onFocus={() => {
                focusedIdRef.current = focusedSession.id;
                setFocusedId(focusedSession.id);
              }}
              onAttach={() => void attachTerminal(focusedSession)}
              onStop={() => void stopTerminal(focusedSession.id)}
              onClose={() => void closeTerminal(focusedSession.id)}
              onData={(data) => void writeWorkspaceTerminalSessionInput(focusedSession.id, data).catch(setActionError)}
              onResize={(cols, rows) => void resizeWorkspaceTerminalSession(focusedSession.id, cols, rows).catch(() => undefined)}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-forge-border bg-forge-bg p-8 text-center text-sm text-forge-muted">
            No terminal tab selected.
          </div>
        )}
      </div>

      <ContextFooter workspaceId={workspace.id} />

      {focusedIsAgent && (
        <div className="shrink-0 border-t border-forge-border bg-forge-surface" style={{ height: `${composerHeight}px` }}>
          <div
            role="separator"
            aria-label="Resize message panel"
            onMouseDown={startComposerResize}
            className="h-1 cursor-row-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
          />
          <div className="flex h-[calc(100%-4px)] min-h-0 flex-col gap-2 overflow-hidden p-2">
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            {/* Profile select — always visible */}
            <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className="rounded-md border border-forge-border bg-forge-bg px-2 py-1 text-xs font-semibold text-forge-text">
              {agentProfilesForPromptPicker(agentProfiles).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>

            {/* Gear popover for secondary settings */}
            <div ref={composerSettingsRef} className="relative">
              <button
                onClick={() => setShowComposerSettings((v) => !v)}
                title="Agent settings"
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${showComposerSettings ? 'border-forge-orange/30 bg-forge-orange/10 text-forge-orange' : 'border-forge-border bg-white/5 text-forge-muted hover:bg-white/10 hover:text-forge-text/80'}`}
              >
                <Settings2 className="h-3 w-3" />
                <span>{selectedTaskMode}</span>
              </button>
              {showComposerSettings && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[240px] rounded-lg border border-forge-border bg-forge-surface p-3 shadow-lg">
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forge-muted">Agent Settings</p>
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-xs text-forge-muted">Task mode</label>
                      <select value={selectedTaskMode} onChange={(event) => setSelectedTaskMode(event.target.value)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-text">
                        {['Act', 'Plan', 'Review', 'Fix'].map((mode) => <option key={mode}>{mode}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-forge-muted">Reasoning</label>
                      <select value={selectedReasoning} onChange={(event) => setSelectedReasoning(event.target.value)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-text">
                        {['Default', 'Low', 'Medium', 'High'].map((level) => <option key={level}>{level}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-forge-muted">Send behavior</label>
                      <select value={sendBehavior} onChange={(event) => setSendBehavior(event.target.value as typeof sendBehavior)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-text">
                        <option value="send_now">Send now</option>
                        <option value="interrupt_send">Interrupt + send</option>
                      </select>
                      <p className="mt-1.5 text-xs leading-snug text-forge-muted">
                        Stop the focused tab any time: header <span className="font-mono text-forge-text/70">⋯</span> menu → Interrupt terminal.
                      </p>
                    </div>
                    <div className="border-t border-forge-border/60 pt-2">
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-forge-muted">Repo context</p>
                      <p className="mb-2 text-xs leading-snug text-forge-muted">
                        Git paths + changed-file diffs (not a full aider-style map). Forge does not cap size—large repos can produce very large context. Use after changing branches or large file moves.
                      </p>
                      <button
                        type="button"
                        disabled={contextBusy}
                        onClick={() => void addRepoContextToPrompt()}
                        className="mb-1.5 w-full rounded-md border border-forge-green/30 bg-forge-green/10 px-2 py-1.5 text-xs font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50"
                        title="Fetch context, show summary below, append to prompt if not already present"
                      >
                        {contextBusy ? 'Working…' : 'Add repo context to prompt'}
                      </button>
                      <button
                        type="button"
                        disabled={contextBusy}
                        onClick={() => void refreshRepoPathMap()}
                        className="flex w-full items-center justify-center gap-1 rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50"
                        title="Regenerate .forge/context path list from git (then update preview only)"
                      >
                        <RefreshCw className={`h-3 w-3 ${contextBusy ? 'animate-spin' : ''}`} />
                        Refresh path map
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {promptTemplates.slice(0, 5).map((template) => (
              <button key={template.id} onClick={() => injectTemplate(template)} title={template.source} className="max-w-[180px] truncate rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10">
                <FileText className="inline h-3 w-3" /> {template.title}
              </button>
            ))}
            {!!agentContext?.linkedWorktrees.length && (
              <button onClick={injectLinkedContext} className="max-w-[220px] truncate rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-xs font-semibold text-forge-blue hover:bg-forge-blue/15" title={agentContext.linkedWorktrees.map((item) => item.path).join('\n')}>
                <Link2 className="inline h-3 w-3" /> Insert linked context ({agentContext.linkedWorktrees.length})
              </button>
            )}
            {promptTemplateWarning && (
              <span className="text-xs text-forge-yellow">{promptTemplateWarning}</span>
            )}
          </div>

          {contextPreview && (
            <div className="shrink-0 rounded-lg border border-forge-border bg-forge-bg/80 p-2 text-xs text-forge-muted">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-bold uppercase tracking-widest text-forge-text">Repo context preview</span>
                <span className={`rounded-full border px-1.5 py-0.5 ${contextPreview.status === 'fresh' ? 'border-forge-green/25 bg-forge-green/10 text-forge-green' : 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'}`}>
                  {contextPreview.status}
                </span>
                <span>{contextPreview.defaultBranch}@{contextPreview.commitHash.slice(0, 8)}</span>
                <span>
                  {contextPreview.maxChars === 0 ? (
                    <>
                      {contextPreview.approxChars.toLocaleString()} chars
                      <span className="text-forge-muted">
                        {' '}
                        (~{roughTokenEstimateFromChars(contextPreview.approxChars).toLocaleString()} tok est.)
                      </span>
                      <span className="text-forge-muted"> · no Forge cap</span>
                    </>
                  ) : (
                    <>
                      {contextPreview.approxChars.toLocaleString()} / {contextPreview.maxChars.toLocaleString()} chars
                    </>
                  )}
                </span>
                {contextPreview.trimmed && <span className="text-forge-yellow">trimmed</span>}
              </div>
              {contextPreview.warning && <div className="mb-1 text-forge-yellow">{contextPreview.warning}</div>}
              <div className="flex flex-wrap gap-1">
                {contextPreview.items.slice(0, 18).map((item, index) => (
                  <span
                    key={`${item.kind}-${item.path ?? item.label}-${index}`}
                    title={`${item.path ?? item.label} · ${item.chars.toLocaleString()} chars${item.trimmed ? ' · trimmed' : ''}`}
                    className={`max-w-[220px] truncate rounded border px-1.5 py-0.5 ${item.included ? 'border-forge-blue/20 bg-forge-blue/10 text-forge-blue' : 'border-forge-border bg-white/5 text-forge-muted line-through'}`}
                  >
                    {item.label}{item.trimmed ? ' …' : ''}
                  </span>
                ))}
                {contextPreview.items.length > 18 && (
                  <span className="rounded border border-forge-border bg-white/5 px-1.5 py-0.5">+{contextPreview.items.length - 18} more</span>
                )}
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 gap-2">
            <textarea
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              rows={5}
              placeholder={
                sendBehavior === 'interrupt_send'
                  ? 'Send instruction to agent (Enter interrupts agent if needed then sends, Shift+Enter for newline)…'
                  : 'Send instruction to agent (Enter to send, Shift+Enter for newline)…'
              }
              className="h-full min-h-0 w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm leading-relaxed text-forge-text placeholder:text-forge-muted focus:border-forge-orange/40 focus:outline-none"
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                if ('isComposing' in event.nativeEvent && event.nativeEvent.isComposing) return;
                event.preventDefault();
                sendPrompt(sendBehavior);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <button
                disabled={busy || !promptInput.trim()}
                onClick={() => sendPrompt(sendBehavior)}
                className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-3 py-2 text-sm font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50"
                title={
                  sendBehavior === 'interrupt_send'
                    ? 'Matches Agent settings: interrupt then send (same as Enter)'
                    : 'Matches Agent settings: send now (same as Enter)'
                }
              >
                <Zap className="inline h-3.5 w-3.5" /> Send
              </button>
            </div>
          </div>

          {(promptMeter !== null || (workspace.agentSession?.tokenCount ?? 0) > 0) && (
            <p className="mt-1 text-xs leading-snug text-forge-muted">
              {promptMeter !== null && (
                <>
                  Last prompt: {promptMeter.lastChars.toLocaleString()} chars (~{promptMeter.lastEstTokens.toLocaleString()}{' '}
                  tok est.) · Session sends (Forge est.): {promptMeter.sessionChars.toLocaleString()} chars (~
                  {promptMeter.sessionEstTokens.toLocaleString()} tok est.)
                </>
              )}
              {(workspace.agentSession?.tokenCount ?? 0) > 0 && workspace.agentSession && (
                <>
                  {promptMeter !== null ? ' · ' : null}
                  Workspace record: {workspace.agentSession.tokenCount.toLocaleString()} tok
                  {workspace.agentSession.estimatedCost ? ` · ${workspace.agentSession.estimatedCost}` : ''}
                </>
              )}
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextFooter({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = React.useState<{ stale: boolean; tokens: number; engine: string } | null>(null);

  React.useEffect(() => {
    import('../../lib/tauri-api/context').then(({ getContextStatus }) => {
      getContextStatus(workspaceId).then(s => {
        setStatus({ stale: s.stale, tokens: (s.symbolCount ?? 0) * 3, engine: s.engine });
      }).catch(() => {});
    });
  }, [workspaceId]);

  if (!status) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 border-t border-white/5 text-sm text-white/30">
      <span>ctx {status.engine}</span>
      {status.stale && (
        <span className="text-amber-400/70">[stale]</span>
      )}
    </div>
  );
}
