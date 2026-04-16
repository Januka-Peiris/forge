import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, Copy, ExternalLink, FileText, Globe2, Link2, MoreHorizontal, Play, PlugZap, RefreshCw, RotateCcw, Settings2, Square, Terminal as TerminalIcon, Trash2, Wrench, X, Zap } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { AgentProfile, AgentPromptEntry, ForgeWorkspaceConfig, PromptTemplate, TerminalOutputChunk, TerminalOutputEvent, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceContextPreview, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import {
  attachWorkspaceTerminalSession,
  closeWorkspaceTerminalSessionById,
  createWorkspaceTerminal,
  getWorkspaceTerminalOutputForSession,
  interruptWorkspaceTerminalSessionById,
  listWorkspaceAgentPrompts,
  listWorkspaceTerminalSessions,
  listWorkspaceVisibleTerminalSessions,
  queueWorkspaceAgentPrompt,
  resizeWorkspaceTerminalSession,
  runNextWorkspaceAgentPrompt,
  stopWorkspaceTerminalSessionById,
  writeWorkspaceTerminalSessionInput,
} from '../../lib/tauri-api/terminal';
import { PromptQueueStrip } from './PromptQueueStrip';
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

interface WorkspaceTerminalProps {
  workspace: Workspace | null;
  onOpenInCursor?: () => void;
}

type OutputMap = Record<string, TerminalOutputChunk[]>;

const profileLabels: Record<TerminalProfile, string> = {
  shell: 'Shell',
  codex: 'Codex',
  claude_code: 'Claude',
};

const OUTPUT_RETENTION_CHUNKS = 1200;
const AGENT_COMPOSER_HEIGHT_KEY = 'forge:agent-composer-height';

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
  const [promptEntries, setPromptEntries] = useState<AgentPromptEntry[]>([]);
  const [agentContext, setAgentContext] = useState<WorkspaceAgentContext | null>(null);
  const [contextPreview, setContextPreview] = useState<WorkspaceContextPreview | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useAgentProfile();
  const [selectedTaskMode, setSelectedTaskMode] = useState('Act');
  const [selectedReasoning, setSelectedReasoning] = useState('Default');
  const [sendBehavior, setSendBehavior] = useState<'send_now' | 'queue' | 'interrupt_send'>('send_now');
  const [error, setError] = useState<string | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [activeHeaderTab, setActiveHeaderTab] = useState<null | 'commands' | 'ports' | 'readiness' | 'health'>(null);
  const [showComposerSettings, setShowComposerSettings] = useState(false);
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const raw = window.localStorage.getItem(AGENT_COMPOSER_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(420, Math.max(120, parsed)) : 200;
  });
  const overflowRef = useRef<HTMLDivElement>(null);
  const composerSettingsRef = useRef<HTMLDivElement>(null);
  const nextSeqRef = useRef<Record<string, number>>({});
  const pendingOutputRef = useRef<Record<string, TerminalOutputChunk[]>>({});
  const outputFlushRafRef = useRef<number | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const metadataPollTickRef = useRef(0);
  /** Serializes agent prompt writes so rapid Enter / Send queues instead of racing attach + PTY. */
  const promptSendChainRef = useRef(Promise.resolve());
  /** Tracks whether there was a 'sent' entry last poll — used to detect cycle completion. */
  const hadSentPromptRef = useRef(false);
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

  const refreshPromptEntries = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setPromptEntries(await listWorkspaceAgentPrompts(workspaceId, 20));
    } catch {
      // non-critical; silently skip
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
    hadSentPromptRef.current = false;
    focusedIdRef.current = null;
    setOutputs({});
    setVisibleSessions([]);
    setAllSessions([]);
    setForgeConfig(null);
    setPorts([]);
    setPromptTemplates([]);
    setPromptTemplateWarning(null);
    setPromptEntries([]);
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
      void refreshPromptEntries();
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
  }, [refreshAgentContext, refreshAgentProfiles, refreshForgeConfig, refreshHealth, refreshReadiness, refreshPromptEntries, refreshPromptTemplates, refreshSessions, resetWorkspaceState, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      metadataPollTickRef.current += 1;
      const shouldBackfillOutput = metadataPollTickRef.current % 6 === 0;
      const shouldRefreshExpensiveState = metadataPollTickRef.current % 3 === 0;
      void refreshSessions(false, shouldBackfillOutput);
      void refreshPromptEntries();
      if (shouldRefreshExpensiveState) {
        void refreshHealth();
        void refreshReadiness();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth, refreshPromptEntries, refreshReadiness, refreshSessions, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
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

  const ensureAgentSessionAttached = async (session: TerminalSession) => {
    if (!workspaceId || session.status !== 'running') return;
    await attachWorkspaceTerminalSession({ workspaceId, sessionId: session.id });
  };

  const continueFocusedAgent = async () => {
    if (!focusedSession) return;
    setBusy(true);
    setError(null);
    try {
      await ensureAgentSessionAttached(focusedSession);
      await writeWorkspaceTerminalSessionInput(focusedSession.id, 'continue\r\n');
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

  const previewRepoContext = async () => {
    if (!workspaceId) return;
    setContextBusy(true);
    setError(null);
    try {
      setContextPreview(await getWorkspaceContextPreview(workspaceId));
    } catch (err) {
      setActionError(err);
      setContextPreview(null);
    } finally {
      setContextBusy(false);
    }
  };

  const refreshRepoContext = async () => {
    if (!workspaceId) return;
    setContextBusy(true);
    setError(null);
    try {
      setContextPreview(await refreshWorkspaceRepoContext(workspaceId));
    } catch (err) {
      setActionError(err);
    } finally {
      setContextBusy(false);
    }
  };

  const injectRepoContext = async () => {
    if (!workspaceId) return;
    let preview = contextPreview;
    if (!preview) {
      setContextBusy(true);
      setError(null);
      try {
        preview = await getWorkspaceContextPreview(workspaceId);
        setContextPreview(preview);
      } catch (err) {
        setActionError(err);
        setContextBusy(false);
        return;
      } finally {
        setContextBusy(false);
      }
    }
    if (!preview?.promptContext.trim()) return;
    setPromptInput((current) => {
      if (current.includes('Forge repo context:')) return current;
      const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
      return `${preview.promptContext}${suffix}`;
    });
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

  const sendPrompt = (mode: 'send_now' | 'queue' | 'interrupt_send' = sendBehavior) => {
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
          mode: mode === 'queue' ? 'queue' : 'send_now',
          profileId: selectedProfileId,
          taskMode: selectedTaskMode,
          reasoning: selectedReasoning,
        });
        await refreshPromptEntries();
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

  const runNextPrompt = async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await runNextWorkspaceAgentPrompt(workspaceId);
      await refreshPromptEntries();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  };

  const startComposerResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setComposerHeight(Math.min(420, Math.max(120, startHeight + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Auto-dispatch: when the agent finishes a cycle (sent → terminal state) and there are
  // queued messages waiting, automatically send the next one — just like Cursor does.
  useEffect(() => {
    const hasSent = promptEntries.some((e) => e.status === 'sent');
    const hasQueued = promptEntries.some((e) => e.status === 'queued');

    if (hadSentPromptRef.current && !hasSent && hasQueued) {
      void runNextPrompt();
    }

    hadSentPromptRef.current = hasSent;
    // runNextPrompt is stable enough via workspaceId dependency — intentionally omitted
    // to avoid re-triggering on its own reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptEntries]);

  if (!workspace) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center p-8">
        <div className="text-center">
          <TerminalIcon className="mx-auto mb-3 h-8 w-8 text-forge-muted" />
          <p className="text-[13px] text-forge-muted">Select a workspace to start a persistent terminal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-forge-bg">
      <div className="sticky top-0 z-10 shrink-0 border-b border-forge-border bg-forge-surface/95 px-4 py-2.5 backdrop-blur">
        {/* Title + primary actions row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TerminalIcon className="h-4 w-4 shrink-0 text-forge-orange" />
            <h1 className="truncate text-[15px] font-bold text-forge-text">{workspace.name}</h1>
            <span className="shrink-0 rounded-full border border-forge-border bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-forge-muted">
              {visibleSessions.filter((session) => session.status === 'running').length} running
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button disabled={busy} onClick={() => void createTerminal('shell', 'shell', 'Shell')} className="rounded-lg border border-forge-border bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-forge-text/85 hover:bg-white/10 disabled:opacity-50">
              New Shell
            </button>
            <button disabled={busy} onClick={() => void createTerminal('agent', 'codex', 'Codex')} className="rounded-lg border border-forge-blue/30 bg-forge-blue/10 px-2.5 py-1.5 text-[11px] font-semibold text-forge-blue hover:bg-forge-blue/20 disabled:opacity-50">
              New Codex
            </button>
            <button disabled={busy} onClick={() => void createTerminal('agent', 'claude_code', 'Claude')} className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-2.5 py-1.5 text-[11px] font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50">
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New shell tab
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { void createTerminal('agent', 'codex', 'Codex'); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New Codex tab
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { void createTerminal('agent', 'claude_code', 'Claude'); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    New Claude tab
                  </button>
                  <button
                    disabled={!focusedSession}
                    onClick={() => { void copyFocusedOutput(); setShowOverflow(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-forge-text/85 hover:bg-white/5 disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy output
                  </button>
                  {onOpenInCursor && (
                    <button
                      onClick={() => { try { onOpenInCursor(); } catch (err) { setError(formatCursorOpenError(err)); } setShowOverflow(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-forge-blue hover:bg-white/5"
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
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
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
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${activeHeaderTab === 'commands' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <Wrench className="h-3 w-3" />
                Commands
                {forgeConfig.warning && <span className="rounded-full border border-forge-yellow/25 bg-forge-yellow/10 px-1 text-[9px] text-forge-yellow">!</span>}
                {forgeConfig.exists && !forgeConfig.warning && <span className="rounded-full border border-forge-green/25 bg-forge-green/10 px-1 text-[9px] text-forge-green">✓</span>}
                {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length > 0 && (
                  <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-[9px] text-forge-blue">
                    {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length}
                  </span>
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'commands' ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveHeaderTab((v) => v === 'ports' ? null : 'ports')}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${activeHeaderTab === 'ports' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
            >
              <Globe2 className="h-3 w-3" />
              Testing
              {ports.length > 0 && (
                <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-[9px] text-forge-blue">
                  {ports.length}
                </span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'ports' ? 'rotate-180' : ''}`} />
            </button>
            {workspaceReadiness !== null && (
              <button
                onClick={() => setActiveHeaderTab((v) => v === 'readiness' ? null : 'readiness')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${activeHeaderTab === 'readiness' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <RotateCcw className="h-3 w-3" />
                Readiness
                <ChevronDown className={`h-3 w-3 transition-transform ${activeHeaderTab === 'readiness' ? 'rotate-180' : ''}`} />
              </button>
            )}
            {workspaceHealth !== null && (
              <button
                onClick={() => setActiveHeaderTab((v) => v === 'health' ? null : 'health')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${activeHeaderTab === 'health' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
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
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-forge-red/20 bg-forge-red/10 px-3 py-2 text-[12px] text-forge-red">
            <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {dockOverflowSessions.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {dockOverflowSessions.slice(0, 12).map((session) => (
              <button key={session.id} onClick={() => void attachTerminal(session)} className="shrink-0 rounded border border-forge-border bg-white/5 px-2 py-1 text-[10px] text-forge-muted hover:bg-white/10">
                {session.title || profileLabels[session.profile as TerminalProfile] || session.profile} · {session.status}
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
              <h2 className="text-[15px] font-bold text-forge-text">Start a persistent workspace terminal</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-forge-muted">
                Forge uses tmux-backed terminals so agents, shells, and dev servers survive app restarts.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button disabled={busy} onClick={() => void createTerminal('agent', 'claude_code', 'Claude')} className="rounded-lg bg-forge-orange px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">Start Claude</button>
                <button disabled={busy} onClick={() => void createTerminal('agent', 'codex', 'Codex')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-[12px] font-semibold text-forge-text disabled:opacity-50">Start Codex</button>
                <button disabled={busy} onClick={() => void createTerminal('shell', 'shell', 'Shell')} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-[12px] font-semibold text-forge-text disabled:opacity-50">New Shell</button>
              </div>
            </div>
          </div>
        ) : focusedSession ? (
          <>
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-forge-border bg-forge-surface/85 p-1">
              {visibleSessions.map((session) => {
                const title = session.title || profileLabels[session.profile as TerminalProfile] || session.profile;
                const active = focusedSession.id === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => void attachTerminal(session)}
                    className={`group flex max-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${active ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-text' : 'border-transparent bg-transparent text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
                    title={`${title} · ${session.status} · ${session.cwd}`}
                  >
                    <span className="truncate text-[11px] font-semibold">{title}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase ${terminalStatusBadgeClass(session)}`}>
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
          <div className="flex h-full items-center justify-center rounded-xl border border-forge-border bg-forge-bg p-8 text-center text-[12px] text-forge-muted">
            No terminal tab selected.
          </div>
        )}
      </div>

      {focusedIsAgent && (
        <div className="shrink-0 border-t border-forge-border bg-forge-surface" style={{ height: `${composerHeight}px` }}>
          <div
            role="separator"
            aria-label="Resize message panel"
            onMouseDown={startComposerResize}
            className="h-1 cursor-row-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
          />
          <div className="h-[calc(100%-4px)] overflow-y-auto p-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* Profile select — always visible */}
            <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className="rounded-md border border-forge-border bg-forge-bg px-2 py-1 text-[10px] font-semibold text-forge-text">
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
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${showComposerSettings ? 'border-forge-orange/30 bg-forge-orange/10 text-forge-orange' : 'border-forge-border bg-white/5 text-forge-muted hover:bg-white/10 hover:text-forge-text/80'}`}
              >
                <Settings2 className="h-3 w-3" />
                <span>{selectedTaskMode}</span>
              </button>
              {showComposerSettings && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-forge-border bg-forge-surface p-3 shadow-lg">
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-forge-muted">Agent Settings</p>
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-forge-muted">Task mode</label>
                      <select value={selectedTaskMode} onChange={(event) => setSelectedTaskMode(event.target.value)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] text-forge-text">
                        {['Act', 'Plan', 'Review', 'Fix'].map((mode) => <option key={mode}>{mode}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-forge-muted">Reasoning</label>
                      <select value={selectedReasoning} onChange={(event) => setSelectedReasoning(event.target.value)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] text-forge-text">
                        {['Default', 'Low', 'Medium', 'High'].map((level) => <option key={level}>{level}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-forge-muted">Send behavior</label>
                      <select value={sendBehavior} onChange={(event) => setSendBehavior(event.target.value as typeof sendBehavior)} className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] text-forge-text">
                        <option value="send_now">Send now</option>
                        <option value="queue">Queue</option>
                        <option value="interrupt_send">Interrupt + send</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {focusedSession && (
              <>
                <button disabled={busy} onClick={() => void interruptFocusedAgent()} className="rounded-md border border-forge-yellow/25 bg-forge-yellow/10 px-2 py-1 text-[10px] font-semibold text-forge-yellow hover:bg-forge-yellow/15 disabled:opacity-50">
                  <Square className="inline h-3 w-3" /> Interrupt
                </button>
                <button disabled={busy} onClick={() => void continueFocusedAgent()} className="rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50">
                  <Play className="inline h-3 w-3" /> Continue
                </button>
              </>
            )}
            {promptTemplates.slice(0, 5).map((template) => (
              <button key={template.id} onClick={() => injectTemplate(template)} title={template.source} className="max-w-[180px] truncate rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10">
                <FileText className="inline h-3 w-3" /> {template.title}
              </button>
            ))}
            {!!agentContext?.linkedWorktrees.length && (
              <button onClick={injectLinkedContext} className="max-w-[220px] truncate rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/15" title={agentContext.linkedWorktrees.map((item) => item.path).join('\n')}>
                <Link2 className="inline h-3 w-3" /> Insert linked context ({agentContext.linkedWorktrees.length})
              </button>
            )}
            <button disabled={contextBusy} onClick={() => void previewRepoContext()} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              <FileText className="inline h-3 w-3" /> {contextBusy ? 'Loading context…' : 'Preview context'}
            </button>
            <button disabled={contextBusy} onClick={() => void injectRepoContext()} className="rounded-md border border-forge-green/25 bg-forge-green/10 px-2 py-1 text-[10px] font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50">
              <Link2 className="inline h-3 w-3" /> Insert repo context
            </button>
            <button disabled={contextBusy} onClick={() => void refreshRepoContext()} title="Refresh .forge/context repo map" className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`inline h-3 w-3 ${contextBusy ? 'animate-spin' : ''}`} /> Refresh map
            </button>
            {promptTemplateWarning && (
              <span className="text-[10px] text-forge-yellow">{promptTemplateWarning}</span>
            )}
          </div>

          {contextPreview && (
            <div className="mb-2 rounded-lg border border-forge-border bg-forge-bg/80 p-2 text-[10px] text-forge-muted">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-bold uppercase tracking-widest text-forge-text">Context being sent</span>
                <span className={`rounded-full border px-1.5 py-0.5 ${contextPreview.status === 'fresh' ? 'border-forge-green/25 bg-forge-green/10 text-forge-green' : 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'}`}>
                  {contextPreview.status}
                </span>
                <span>{contextPreview.defaultBranch}@{contextPreview.commitHash.slice(0, 8)}</span>
                <span>{contextPreview.approxChars.toLocaleString()} / {contextPreview.maxChars.toLocaleString()} chars</span>
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

          <PromptQueueStrip
            entries={promptEntries}
            busy={busy}
            onRunNext={() => void runNextPrompt()}
          />

          <div className="flex items-start gap-2">
            <textarea
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              rows={2}
              placeholder="Send instruction to agent (Enter to send, Shift+Enter for newline)..."
              className="min-h-[52px] flex-1 resize-none rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-[12px] text-forge-text placeholder:text-forge-muted focus:border-forge-orange/40 focus:outline-none"
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                if ('isComposing' in event.nativeEvent && event.nativeEvent.isComposing) return;
                event.preventDefault();
                sendPrompt('send_now');
              }}
            />
            <div className="flex flex-col gap-1.5">
              <button
                disabled={busy || !promptInput.trim()}
                onClick={() => sendPrompt(sendBehavior)}
                className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-3 py-2 text-[12px] font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50"
                title="Send now (Enter)"
              >
                <Zap className="inline h-3.5 w-3.5" /> Send
              </button>
              <button
                disabled={busy || !promptInput.trim()}
                onClick={() => sendPrompt('queue')}
                className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-[12px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50"
                title="Add to queue without sending"
              >
                <Clock className="inline h-3.5 w-3.5" /> Queue
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}



function WorkspaceReadinessStrip({ readiness }: { readiness: WorkspaceReadiness }) {
  const tone = readiness.status === 'needs_attention'
    ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'
    : readiness.status === 'running'
      ? 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue'
      : readiness.status === 'review'
        ? 'border-forge-orange/25 bg-forge-orange/10 text-forge-orange'
        : 'border-forge-border bg-white/5 text-forge-muted';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2 text-[11px]">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{readiness.status.replace('_', ' ')}</span>
      <span className="min-w-0 flex-1 truncate text-forge-muted">{readiness.summary}</span>
    </div>
  );
}

function WorkspaceHealthStrip({
  health,
  displayPortCount,
  busy,
  onRefresh,
  onRecover,
  onClose,
  onStartShell,
}: {
  health: WorkspaceHealth;
  /** From on-demand Testing tab scan (`list_workspace_ports`); health payload no longer runs port discovery. */
  displayPortCount: number;
  busy: boolean;
  onRefresh: () => void;
  onRecover: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onStartShell: () => void;
}) {
  const running = health.terminals.filter((terminal) => terminal.status === 'running').length;
  const stale = health.terminals.filter((terminal) => terminal.stale || terminal.recommendedAction.includes('fresh')).length;
  const unattached = health.terminals.filter((terminal) => terminal.recommendedAction === 'reattach');
  const failed = health.terminals.filter((terminal) => terminal.status === 'failed' || terminal.status === 'interrupted');
  const statusClasses = health.status === 'needs_attention'
    ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'
    : health.status === 'healthy'
      ? 'border-forge-green/25 bg-forge-green/10 text-forge-green'
      : 'border-forge-border bg-white/5 text-forge-muted';

  return (
    <div className="mt-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <PlugZap className="h-3.5 w-3.5 text-forge-muted" />
        <span className="font-semibold text-forge-text">Health</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClasses}`}>
          {health.status === 'needs_attention' ? 'Needs attention' : health.status === 'healthy' ? 'Healthy' : 'Idle'}
        </span>
        <span className="text-forge-muted" title="Port count updates when you use Testing → Refresh ports">
          {running} running · {displayPortCount} port{displayPortCount === 1 ? '' : 's'} · {stale} stale
        </span>
        {health.warnings.slice(0, 1).map((warning) => (
          <span key={warning} className="min-w-0 flex-1 truncate text-forge-yellow" title={warning}>{warning}</span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {unattached.slice(0, 2).map((terminal) => (
            <button key={terminal.sessionId} disabled={busy} onClick={() => onRecover(terminal.sessionId)} className="rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50">
              Reattach {terminal.title || terminal.kind}
            </button>
          ))}
          {failed.slice(0, 2).map((terminal) => (
            <button key={terminal.sessionId} disabled={busy} onClick={() => onClose(terminal.sessionId)} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              Close {terminal.title || terminal.kind}
            </button>
          ))}
          {health.terminals.length === 0 && (
            <button disabled={busy} onClick={onStartShell} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              Start shell
            </button>
          )}
          <button disabled={busy} onClick={onRefresh} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className="inline h-3 w-3" /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceCommandsStrip({
  config,
  runningRunCount,
  busy,
  commandBusy,
  onRunSetup,
  onStartRun,
  onRestartRun,
  onStopRuns,
}: {
  config: ForgeWorkspaceConfig | null;
  runningRunCount: number;
  busy: boolean;
  commandBusy: string | null;
  onRunSetup: () => void;
  onStartRun: (index: number) => void;
  onRestartRun: (index: number) => void;
  onStopRuns: () => void;
}) {
  if (!config) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-forge-border/70 bg-white/[0.03] px-3 py-2 text-[11px] text-forge-muted">
        <Wrench className="h-3.5 w-3.5" />
        Loading workspace commands…
      </div>
    );
  }

  const hasCommands = config.setup.length > 0 || config.run.length > 0;
  return (
    <div className="mt-3 rounded-lg border border-forge-border/70 bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <Wrench className="h-3.5 w-3.5 text-forge-muted" />
          <span className="font-semibold text-forge-text">Workspace Commands</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${config.warning ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow' : config.exists ? 'border-forge-green/25 bg-forge-green/10 text-forge-green' : 'border-forge-border bg-white/5 text-forge-muted'}`}>
            {config.warning ? 'config warning' : config.exists ? '.forge/config.json' : 'No Forge config found'}
          </span>
          {runningRunCount > 0 && (
            <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-2 py-0.5 text-[10px] text-forge-blue">
              {runningRunCount} run active
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {config.setup.length > 0 && (
            <button disabled={busy} onClick={onRunSetup} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              <Play className="inline h-3 w-3" /> {commandBusy === 'setup' ? 'Starting setup…' : 'Run setup'}
            </button>
          )}
          {config.run.map((command, index) => (
            <div key={`${index}-${command}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <button disabled={busy} onClick={() => onStartRun(index)} title={command} className="max-w-[220px] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-forge-orange hover:bg-forge-orange/10 disabled:opacity-50">
                <Play className="inline h-3 w-3" /> {commandBusy === `run-${index}` ? 'Starting…' : command}
              </button>
              <button disabled={busy} onClick={() => onRestartRun(index)} title={`Restart ${command}`} className="rounded px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-white/10 disabled:opacity-50">
                <RotateCcw className="inline h-3 w-3" /> Restart
              </button>
            </div>
          ))}
          {runningRunCount > 0 && (
            <button disabled={busy} onClick={onStopRuns} className="rounded-md border border-forge-red/20 bg-forge-red/10 px-2 py-1 text-[10px] font-semibold text-forge-red hover:bg-forge-red/15 disabled:opacity-50">
              <Square className="inline h-3 w-3" /> {commandBusy === 'stop-all-runs' ? 'Stopping…' : 'Stop runs'}
            </button>
          )}
        </div>
      </div>
      {config.warning && (
        <p className="mt-2 text-[11px] text-forge-yellow">{config.warning}</p>
      )}
      {!hasCommands && !config.warning && (
        <p className="mt-1 text-[11px] text-forge-muted">
          Add setup/run commands at <span className="font-mono">.forge/config.json</span> to make this workspace one-click runnable.
        </p>
      )}
    </div>
  );
}

function WorkspacePortsStrip({
  ports,
  busy,
  onRefresh,
  onOpen,
  onKill,
}: {
  ports: WorkspacePort[];
  busy: boolean;
  onRefresh: () => void;
  onOpen: (port: number) => void;
  onKill: (port: WorkspacePort) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <Globe2 className="h-3.5 w-3.5 text-forge-muted" />
          <span className="font-semibold text-forge-text">Testing</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ports.length > 0 ? 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue' : 'border-forge-border bg-white/5 text-forge-muted'}`}>
            {ports.length > 0 ? `${ports.length} port${ports.length === 1 ? '' : 's'}` : 'No workspace ports'}
          </span>
        </div>
        <button disabled={busy} onClick={onRefresh} className="ml-auto rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
          <RefreshCw className="inline h-3 w-3" /> {busy ? 'Scanning…' : 'Refresh ports'}
        </button>
      </div>
      {ports.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ports.map((port) => (
            <div key={`${port.pid}-${port.port}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <button onClick={() => onOpen(port.port)} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/10" title={port.cwd ?? port.address}>
                <ExternalLink className="inline h-3 w-3" /> localhost:{port.port}
              </button>
              <span className="max-w-[140px] truncate font-mono text-[10px] text-forge-text/85">
                {port.command} · pid {port.pid}
              </span>
              <button disabled={busy} onClick={() => onKill(port)} className="rounded px-1.5 py-0.5 text-[10px] text-forge-red hover:bg-forge-red/10 disabled:opacity-50" title={`Kill process ${port.pid}`}>
                <Trash2 className="inline h-3 w-3" /> Kill
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-forge-muted">
          Start a dev server from this workspace, then refresh to open or stop it here.
        </p>
      )}
    </div>
  );
}

function terminalStatusBadgeClass(session: TerminalSession) {
  if (session.stale) return 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow';
  if (session.status === 'running') return 'border-forge-green/25 bg-forge-green/10 text-forge-green';
  if (session.status === 'failed' || session.status === 'interrupted') return 'border-forge-red/25 bg-forge-red/10 text-forge-red';
  return 'border-forge-border bg-white/5 text-forge-muted';
}

function TerminalPane({
  session,
  chunks,
  focused,
  onFocus,
  onAttach,
  onStop,
  onClose,
  onData,
  onResize,
}: {
  session: TerminalSession;
  chunks: TerminalOutputChunk[];
  focused: boolean;
  onFocus: () => void;
  onAttach: () => void;
  onStop: () => void;
  onClose: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastRenderedSeqRef = useRef<number>(-1);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 2500,
      theme: {
        background: '#08090c',
        foreground: '#d7dce5',
        cursor: '#ff6a00',
        selectionBackground: '#ff6a0040',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    lastRenderedSeqRef.current = -1;

    const disposable = terminal.onData((data) => onDataRef.current(data));
    const fit = () => {
      try {
        fitAddon.fit();
        if (terminal.cols > 0 && terminal.rows > 0) onResizeRef.current(terminal.cols, terminal.rows);
      } catch {
        // xterm can throw before layout settles.
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    window.setTimeout(fit, 30);
    return () => {
      disposable.dispose();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session.id]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const next = chunks.filter((chunk) => chunk.seq > lastRenderedSeqRef.current);
    for (const chunk of next) {
      terminal.write(chunk.data);
      lastRenderedSeqRef.current = Math.max(lastRenderedSeqRef.current, chunk.seq);
    }
  }, [chunks]);

  useEffect(() => {
    if (focused) terminalRef.current?.focus();
  }, [focused]);

  const title = session.title || profileLabels[session.profile as TerminalProfile] || session.profile;
  const running = session.status === 'running';
  return (
    <section onMouseDown={onFocus} className={`flex min-h-0 flex-1 flex-col rounded-xl border bg-[#08090c] ${focused ? 'border-forge-orange/50 shadow-lg shadow-orange-950/20' : 'border-forge-border'}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-forge-border/70 bg-forge-surface px-2 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-bold text-forge-text">{title}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${terminalStatusBadgeClass(session)}`}>{session.stale ? 'stale' : session.status}</span>
            <span className="rounded-full border border-forge-border bg-white/5 px-1.5 py-0.5 text-[9px] uppercase text-forge-muted">{session.backend}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-forge-text/82">{session.cwd}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={(event) => { event.stopPropagation(); onAttach(); }} className="rounded px-2 py-1 text-[10px] text-forge-muted hover:bg-white/10"><RefreshCw className="inline h-3 w-3" /> Attach</button>
          {running && <button onClick={(event) => { event.stopPropagation(); onStop(); }} className="rounded px-2 py-1 text-[10px] text-forge-red hover:bg-forge-red/10"><Square className="inline h-3 w-3" /> Stop</button>}
          <button onClick={(event) => { event.stopPropagation(); onClose(); }} className="rounded px-2 py-1 text-[10px] text-forge-muted hover:bg-white/10"><X className="inline h-3 w-3" /> Close</button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-[180px] flex-1 overflow-hidden p-2" />
      {chunks.length === 0 && (
        <div className="pointer-events-none absolute hidden">Waiting for terminal output...</div>
      )}
    </section>
  );
}
