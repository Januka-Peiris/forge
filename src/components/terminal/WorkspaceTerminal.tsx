import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Terminal as TerminalIcon } from 'lucide-react';
import type { AgentProfile, ForgeWorkspaceConfig, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import type { AgentChatNextAction } from '../../types/agent-chat';
import type { WorkspaceCoordinatorStatus } from '../../types/coordinator';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import {
  getWorkspaceTerminalOutputForSession,
  listWorkspaceTerminalSessions,
  listWorkspaceVisibleTerminalSessions,
  resizeWorkspaceTerminalSession,
  writeWorkspaceTerminalSessionInput,
} from '../../lib/tauri-api/terminal';
import { CommandApprovalModal, type PendingCommand } from '../modals/CommandApprovalModal';
import {
  getWorkspaceForgeConfig,
} from '../../lib/tauri-api/workspace-scripts';
import { listWorkspacePromptTemplates } from '../../lib/tauri-api/prompt-templates';
import { getWorkspaceAgentContext } from '../../lib/tauri-api/agent-context';
import { getWorkspaceHealth } from '../../lib/tauri-api/workspace-health';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { getWorkspaceChangedFiles } from '../../lib/tauri-api/git-review';
import { getWorkspaceReviewCockpit } from '../../lib/tauri-api/review-cockpit';
import { createWorkspacePr } from '../../lib/tauri-api/pr-draft';
import { getAiModelSettings } from '../../lib/tauri-api/settings';
import {
  getWorkspaceCoordinatorStatus,
  stepWorkspaceCoordinator,
  replayWorkspaceCoordinatorAction,
  stopWorkspaceCoordinator,
} from '../../lib/tauri-api/coordinator';
import {
  defaultWorkspaceAgentProfileId,
  listWorkspaceAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { forgeWarn } from '../../lib/forge-log';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';
import { formatSessionError } from '../../lib/ui-errors';
import { TerminalPane } from './WorkspaceTerminalPane';
import { TileLayout } from '../layout/TileLayout';
import { useTileLayoutState } from '../layout/useTileLayoutState';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceComposer, type ComposerSettings } from './WorkspaceComposer';
import type { PromptTemplate } from '../../types/prompt-template';
import { useSyncedRef } from '../../lib/hooks/useSyncedRef';
import { useWorkspaceTerminalOutput } from './useWorkspaceTerminalOutput';
import { WorkspaceTerminalEmptyState } from './WorkspaceTerminalEmptyState';
import { WorkspaceContextFooter } from './WorkspaceContextFooter';
import { CoordinatorTimeline } from './CoordinatorTimeline';
import { useWorkspaceTerminalComposerActions } from './useWorkspaceTerminalComposerActions';
import { useWorkspaceTerminalSessionActions } from './useWorkspaceTerminalSessionActions';
import { useWorkspaceTerminalPolling } from './useWorkspaceTerminalPolling';
import { useWorkspaceTerminalEvents } from './useWorkspaceTerminalEvents';
import { WorkspaceTerminalEditorPanel, type EditorTab } from './WorkspaceTerminalEditorPanel';
import { readWorkspaceFile, writeWorkspaceFile } from '../../lib/tauri-api/workspace-file-tree';
import type { TileContent, TileLeaf } from '../../types/tile-layout';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_KIMI_MODEL = 'kimi-for-coding';
const CLAUDE_REASONING_VALUES = new Set(['Default', 'Low', 'Medium', 'High', 'Extra High', 'Max']);

const FILE_PREVIEW_WIDTH_KEY = 'forge:file-preview-width';
const COMPOSER_SETTINGS_KEY = 'forge:composer-settings';

const COMPOSER_SETTINGS_DEFAULTS: ComposerSettings = {
  selectedModel: '',
  selectedTaskMode: 'Act',
  selectedReasoning: 'Default',
  sendBehavior: 'send_now',
  promptMode: 'direct',
  coordinatorBrainProvider: 'claude_code',
  coordinatorCoderProvider: 'claude_code',
  coordinatorBrainProfileId: '',
  coordinatorCoderProfileId: '',
  coordinatorBrainModel: '',
  coordinatorCoderModel: '',
  coordinatorBrainReasoning: '',
  coordinatorCoderReasoning: '',
  coordinatorAutoStepOnWorkerComplete: false,
  coordinatorAutoStepTrigger: 'terminal_completion',
  coordinatorAutoStepCooldownSeconds: 3,
};

function loadComposerSettings(): ComposerSettings {
  try {
    const raw = window.localStorage.getItem(COMPOSER_SETTINGS_KEY);
    if (raw) return { ...COMPOSER_SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore corrupt data
  }
  return { ...COMPOSER_SETTINGS_DEFAULTS };
}

interface WorkspaceTerminalProps {
  workspace: Workspace | null;
  requestedFilePath: string | null;
  onRequestedFilePathHandled: () => void;
  onActiveEditorFileChange?: (path: string | null) => void;
  onOpenInCursor?: () => void;
  onOpenReviewCockpit?: (path?: string | null) => void;
}

export function WorkspaceTerminal({
  workspace,
  requestedFilePath,
  onRequestedFilePathHandled,
  onActiveEditorFileChange,
  onOpenInCursor,
  onOpenReviewCockpit,
}: WorkspaceTerminalProps) {
  const [visibleSessions, setVisibleSessions] = useState<TerminalSession[]>([]);
  const [allSessions, setAllSessions] = useState<TerminalSession[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setCommandBusy] = useState<string | null>(null);
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [, setPorts] = useState<WorkspacePort[]>([]);
  const [, setPortsBusy] = useState(false);
  const [promptTemplateWarning, setPromptTemplateWarning] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [agentContext, setAgentContext] = useState<WorkspaceAgentContext | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);
  const [, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [changedFiles, setChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [, setReviewCockpit] = useState<WorkspaceReviewCockpit | null>(null);
  const [workflowHint, setWorkflowHint] = useState<string | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useAgentProfile();
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(loadComposerSettings);
  const [providerModelDefaults, setProviderModelDefaults] = useState({
    claude: DEFAULT_CLAUDE_MODEL,
    codex: DEFAULT_CODEX_MODEL,
    kimi: DEFAULT_KIMI_MODEL,
  });
  const [error, setError] = useState<string | null>(null);
  const [coordinatorStatus, setCoordinatorStatus] = useState<WorkspaceCoordinatorStatus | null>(null);
  const [coordinatorToast, setCoordinatorToast] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [openEditors, setOpenEditors] = useState<EditorTab[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  const [savingEditorPaths, setSavingEditorPaths] = useState<Set<string>>(new Set());
  const [filePreviewWidth, setFilePreviewWidth] = useState<number>(() => {
    const raw = window.localStorage.getItem(FILE_PREVIEW_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(640, Math.max(280, parsed)) : 420;
  });
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
  const visibleSessionsRef = useSyncedRef(visibleSessions);
  /** Serializes agent prompt writes so rapid Enter / Send do not race attach + PTY. */
  const promptSendChainRef = useRef(Promise.resolve());
  const lastCoordinatorAutoStepEventRef = useRef<string | null>(null);
  const coordinatorAutoStepRunningRef = useRef(false);
  const coordinatorAutoStepQueuedRef = useRef(false);
  const coordinatorAutoStepQueuedInstructionRef = useRef<string | null>(null);
  const lastCoordinatorAutoStepAtRef = useRef<number>(0);
  const coordinatorAutoStepTimerRef = useRef<number | null>(null);
  const workspaceId = workspace?.id ?? null;
  const tileLayout = useTileLayoutState(workspaceId);

  const setActionError = useCallback((err: unknown) => {
    const msg = formatSessionError(err);
    forgeWarn('terminal', 'action error', { err, message: msg });
    setError(msg);
  }, []);
  const showCoordinatorToast = useCallback((message: string) => {
    setCoordinatorToast(message);
    window.setTimeout(() => setCoordinatorToast((current) => (current === message ? null : current)), 4200);
  }, []);

  const focusedSession = useMemo(
    () => visibleSessions.find((session) => session.id === focusedId) ?? visibleSessions[0] ?? null,
    [focusedId, visibleSessions],
  );
  const localAgentProfiles = useMemo(
    () => agentProfiles.filter((profile) => profile.agent === 'local_llm' || profile.local),
    [agentProfiles],
  );
  const focusedIsAgent = focusedSession?.terminalKind === 'agent' || focusedSession?.sessionRole === 'agent';
  const hasAnyAgentSession = useMemo(
    () => allSessions.some((s) => !s.closedAt && (s.terminalKind === 'agent' || s.sessionRole === 'agent')),
    [allSessions],
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
      setVisibleSessions(visible);
      setAllSessions(history);
      focusedIdRef.current = nextFocusedId;
      setFocusedId(nextFocusedId);

      if (fetchOutput) {
        await Promise.all(visible.map(async (session) => {
          const output = await getWorkspaceTerminalOutputForSession(
            workspaceId,
            session.id,
            getNextSeq(session.id),
          );
          setNextSeq(session.id, output.nextSeq);
          appendOutput(session.id, output.chunks);
        }));
      }
    } catch (err) {
      setActionError(err);
    }
  }, [appendOutput, focusedIdRef, getNextSeq, setActionError, setNextSeq, workspaceId]);


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
        hooks: {
          preRun: [],
          postRun: [],
          preTool: [],
          postTool: [],
          preShip: [],
          postShip: [],
        },
        agentProfiles: [],
        mcpServers: [],
        mcpWarnings: [],
        warning: formatSessionError(err),
      });
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
      setComposerSettings((current) => {
        return {
          ...current,
          coordinatorBrainProfileId:
            current.coordinatorBrainProfileId && profiles.some((profile) => profile.id === current.coordinatorBrainProfileId)
              ? current.coordinatorBrainProfileId
              : '',
          coordinatorCoderProfileId:
            current.coordinatorCoderProfileId && profiles.some((profile) => profile.id === current.coordinatorCoderProfileId)
              ? current.coordinatorCoderProfileId
              : '',
        };
      });
    } catch (err) {
      forgeWarn('agent-profiles', 'load error', { err });
      setAgentProfiles([]);
    }
  }, [setSelectedProfileId, workspaceId]);

  const refreshCoordinatorStatus = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setCoordinatorStatus(await getWorkspaceCoordinatorStatus(workspaceId));
    } catch {
      setCoordinatorStatus(null);
    }
  }, [workspaceId]);

  const refreshModelSettings = useCallback(async () => {
    try {
      const settings = await getAiModelSettings();
      const claudeModel = settings.claudeAgentModel || settings.agentModel || DEFAULT_CLAUDE_MODEL;
      const codexModel = settings.codexAgentModel || DEFAULT_CODEX_MODEL;
      const kimiModel = settings.kimiAgentModel || DEFAULT_KIMI_MODEL;
      setProviderModelDefaults({ claude: claudeModel, codex: codexModel, kimi: kimiModel });
      setComposerSettings((current) => ({ ...current, selectedModel: claudeModel }));
    } catch (err) {
      forgeWarn('agent-models', 'load error', { err });
    }
  }, []);

  const openEditorFile = useCallback(async (path: string) => {
    if (!workspaceId) return;
    const normalizedPath = path.trim();
    if (!normalizedPath) return;

    setOpenEditors((current) => {
      const existing = current.find((editor) => editor.path === normalizedPath);
      if (existing) return current;
      return [
        ...current,
        {
          path: normalizedPath,
          content: '',
          savedContent: '',
          loading: true,
          error: null,
        },
      ];
    });
    setActiveEditorPath(normalizedPath);

    try {
      const content = await readWorkspaceFile(workspaceId, normalizedPath);
      setOpenEditors((current) => current.map((editor) => (
        editor.path === normalizedPath
          ? { ...editor, content, savedContent: content, loading: false, error: null }
          : editor
      )));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOpenEditors((current) => current.map((editor) => (
        editor.path === normalizedPath
          ? { ...editor, loading: false, error: message }
          : editor
      )));
    }
  }, [workspaceId]);

  const saveEditorFile = useCallback(async (path: string) => {
    if (!workspaceId) return;
    const editor = openEditors.find((item) => item.path === path);
    if (!editor || editor.loading || editor.error) return;

    setSavingEditorPaths((current) => {
      const next = new Set(current);
      next.add(path);
      return next;
    });
    try {
      await writeWorkspaceFile(workspaceId, path, editor.content);
      setOpenEditors((current) => current.map((item) => (
        item.path === path ? { ...item, savedContent: item.content, error: null } : item
      )));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOpenEditors((current) => current.map((item) => (
        item.path === path ? { ...item, error: message } : item
      )));
    } finally {
      setSavingEditorPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }, [openEditors, workspaceId]);

  const closeEditorFile = useCallback((path: string) => {
    setOpenEditors((current) => {
      const nextEditors = current.filter((item) => item.path !== path);
      setActiveEditorPath((currentActive) => {
        if (currentActive !== path) return currentActive;
        return nextEditors[0]?.path ?? null;
      });
      return nextEditors;
    });
  }, []);

  const updateEditorContent = useCallback((path: string, content: string) => {
    setOpenEditors((current) => current.map((editor) => (
      editor.path === path ? { ...editor, content, error: null } : editor
    )));
  }, []);

  const resetWorkspaceState = useCallback(() => {
    resetOutputState();
    promptSendChainRef.current = Promise.resolve();
    focusedIdRef.current = null;
    setVisibleSessions([]);
    setAllSessions([]);
    setForgeConfig(null);
    setPorts([]);
    setPromptTemplateWarning(null);
    setAgentContext(null);
    setWorkspaceHealth(null);
    setWorkspaceReadiness(null);
    setChangedFiles([]);
    setReviewCockpit(null);
    setOpenEditors([]);
    setActiveEditorPath(null);
    setSavingEditorPaths(new Set());
    setFocusedId(null);
    setError(null);
    setCoordinatorStatus(null);
    setCoordinatorToast(null);
    lastCoordinatorAutoStepEventRef.current = null;
    coordinatorAutoStepRunningRef.current = false;
    coordinatorAutoStepQueuedRef.current = false;
    coordinatorAutoStepQueuedInstructionRef.current = null;
    lastCoordinatorAutoStepAtRef.current = 0;
    if (coordinatorAutoStepTimerRef.current !== null) {
      window.clearTimeout(coordinatorAutoStepTimerRef.current);
      coordinatorAutoStepTimerRef.current = null;
    }
  }, [focusedIdRef, resetOutputState]);

  useEffect(() => {
    resetWorkspaceState();
    if (workspaceId) {
      void refreshForgeConfig();
      void refreshPromptTemplates();
      void refreshAgentContext();
      void refreshAgentProfiles();
      void refreshModelSettings();
      void refreshSessions(false);
      void refreshWorkbenchState();
      void refreshCoordinatorStatus();
      const outputTimer = window.setTimeout(() => {
        if (document.hidden) return;
        void refreshSessions(true);
      }, 250);
      const healthTimer = window.setTimeout(() => {
        if (document.hidden) return;
        void refreshHealth();
        void refreshReadiness();
      }, 1500);
      return () => {
        window.clearTimeout(outputTimer);
        window.clearTimeout(healthTimer);
      };
    }
  }, [refreshAgentContext, refreshAgentProfiles, refreshCoordinatorStatus, refreshForgeConfig, refreshHealth, refreshModelSettings, refreshReadiness, refreshPromptTemplates, refreshSessions, refreshWorkbenchState, resetWorkspaceState, workspaceId]);

  useEffect(() => {
    setComposerSettings((current) => {
      const nextModel = current.selectedModel.startsWith('claude-')
        ? current.selectedModel
        : providerModelDefaults.claude;
      const nextReasoning = CLAUDE_REASONING_VALUES.has(current.selectedReasoning)
        ? current.selectedReasoning
        : 'Default';
      if (nextModel === current.selectedModel && nextReasoning === current.selectedReasoning) return current;
      return { ...current, selectedModel: nextModel, selectedReasoning: nextReasoning };
    });
  }, [providerModelDefaults.claude]);

  useEffect(() => {
    window.localStorage.setItem(FILE_PREVIEW_WIDTH_KEY, String(filePreviewWidth));
  }, [filePreviewWidth]);

  useEffect(() => {
    const toSave = { ...composerSettings };
    delete (toSave as Partial<typeof composerSettings>).selectedModel;
    window.localStorage.setItem(COMPOSER_SETTINGS_KEY, JSON.stringify(toSave));
  }, [composerSettings]);

  useWorkspaceTerminalPolling({
    workspaceId,
    visibleSessionsRef,
    refreshSessions,
    refreshHealth,
    refreshReadiness,
    refreshWorkbenchState,
    refreshCoordinatorStatus,
  });

  const triggerCoordinatorAutoStep = useCallback((instruction: string) => {
    if (!workspaceId) return;
    coordinatorAutoStepQueuedInstructionRef.current = instruction;
    if (coordinatorAutoStepRunningRef.current) {
      coordinatorAutoStepQueuedRef.current = true;
      return;
    }
    const cooldownMs = Math.max(0, composerSettings.coordinatorAutoStepCooldownSeconds) * 1000;
    const elapsed = Date.now() - lastCoordinatorAutoStepAtRef.current;
    if (cooldownMs > 0 && elapsed < cooldownMs) {
      coordinatorAutoStepQueuedRef.current = true;
      if (coordinatorAutoStepTimerRef.current !== null) {
        window.clearTimeout(coordinatorAutoStepTimerRef.current);
      }
      coordinatorAutoStepTimerRef.current = window.setTimeout(() => {
        coordinatorAutoStepTimerRef.current = null;
        const queuedInstruction = coordinatorAutoStepQueuedInstructionRef.current;
        if (!queuedInstruction) return;
        triggerCoordinatorAutoStep(queuedInstruction);
      }, cooldownMs - elapsed);
      return;
    }
    const nextInstruction = coordinatorAutoStepQueuedInstructionRef.current;
    if (!nextInstruction) return;
    coordinatorAutoStepQueuedInstructionRef.current = null;
    coordinatorAutoStepQueuedRef.current = false;
    coordinatorAutoStepRunningRef.current = true;
    lastCoordinatorAutoStepAtRef.current = Date.now();
    void stepWorkspaceCoordinator({
      workspaceId,
      instruction: nextInstruction,
      brainProvider: composerSettings.coordinatorBrainProvider || null,
      coderProvider: composerSettings.coordinatorCoderProvider || null,
      brainProfileId: composerSettings.coordinatorBrainProfileId || null,
      coderProfileId: composerSettings.coordinatorCoderProfileId || null,
      brainModel: composerSettings.coordinatorBrainModel || null,
      coderModel: composerSettings.coordinatorCoderModel || null,
      brainReasoning: composerSettings.coordinatorBrainReasoning || null,
      coderReasoning: composerSettings.coordinatorCoderReasoning || null,
    })
      .then((next) => setCoordinatorStatus(next))
      .catch((err) => {
        const message = formatSessionError(err);
        if (message.startsWith('COORDINATOR_STEP_IN_PROGRESS:')) {
          return;
        }
        setActionError(err);
      })
      .finally(() => {
        coordinatorAutoStepRunningRef.current = false;
        if (coordinatorAutoStepQueuedRef.current && coordinatorAutoStepQueuedInstructionRef.current) {
          triggerCoordinatorAutoStep(coordinatorAutoStepQueuedInstructionRef.current);
        }
      });
  }, [
    composerSettings.coordinatorAutoStepCooldownSeconds,
    composerSettings.coordinatorBrainProvider,
    composerSettings.coordinatorCoderProvider,
    composerSettings.coordinatorBrainProfileId,
    composerSettings.coordinatorCoderProfileId,
    composerSettings.coordinatorBrainModel,
    composerSettings.coordinatorCoderModel,
    composerSettings.coordinatorBrainReasoning,
    composerSettings.coordinatorCoderReasoning,
    setActionError,
    workspaceId,
  ]);

  useEffect(() => () => {
    if (coordinatorAutoStepTimerRef.current !== null) {
      window.clearTimeout(coordinatorAutoStepTimerRef.current);
    }
  }, []);

  useWorkspaceTerminalEvents({
    workspaceId,
    enqueueOutput,
    bumpNextSeqFromChunk,
    setPendingCommand,
    refreshReadiness,
    refreshWorkbenchState,
    refreshCoordinatorStatus,
    onCoordinatorNotify: (payload) => {
      showCoordinatorToast(payload.message);
      const match = payload.message.match(/^Worker\\s+([^\\s]+)\\s+([^\\s]+)$/i);
      if (!match) return;
      if (!workspaceId) return;
      if (!composerSettings.coordinatorAutoStepOnWorkerComplete) return;
      if (composerSettings.promptMode !== 'coordinator') return;
      const workerId = match[1];
      const workerStatus = match[2].toLowerCase();
      if (
        composerSettings.coordinatorAutoStepTrigger === 'terminal_completion'
        && !['succeeded', 'failed', 'stopped', 'interrupted', 'completed'].includes(workerStatus)
      ) {
        return;
      }
      const signature = `${workerId}:${workerStatus}`;
      if (lastCoordinatorAutoStepEventRef.current === signature) return;
      lastCoordinatorAutoStepEventRef.current = signature;
      triggerCoordinatorAutoStep(
        `Worker ${workerId} reported status ${workerStatus}. Review progress, notify the user, and choose the next coordinator action.`,
      );
    },
  });

  const {
    createTerminal,
    startRunCommand,
    interruptFocusedAgent,
    attachTerminal,
    stopTerminal,
    closeTerminal,
    copyFocusedOutput,
  } = useWorkspaceTerminalSessionActions({
    workspaceId,
    setSelectedProfileId,
    focusedSession,
    focusedIdRef,
    outputs,
    setBusy,
    setError,
    setCommandBusy,
    setPortsBusy,
    setFocusedId,
    setPorts,
    setNextSeq,
    appendOutput,
    removeSessionOutput,
    refreshSessions,
    refreshHealth,
    refreshReadiness,
    setActionError,
  });

  const {
    togglePlanMode,
    handleWorkbenchAction,
    applyWorkflowPreset,
    sendPrompt,
  } = useWorkspaceTerminalComposerActions({
    workspaceId,
    focusedSession,
    selectedProfileId,
    composerSettings,
    forgeConfig,
    refreshWorkbenchState,
    refreshReadiness,
    refreshCoordinatorStatus,
    startRunCommand,
    setReviewCockpit,
    setComposerSettings,
    setBusy,
    setError,
    setActionError,
    onCoordinatorInfo: showCoordinatorToast,
    promptSendChainRef,
  });


  useEffect(() => {
    if (!workflowHint) return;
    const timeout = window.setTimeout(() => setWorkflowHint((current) => (current === workflowHint ? null : current)), 4200);
    return () => window.clearTimeout(timeout);
  }, [workflowHint]);

  const handleCoordinatorReviewDiff = useCallback(() => {
    void refreshWorkbenchState();
  }, [refreshWorkbenchState]);

  const handleCoordinatorRunTests = useCallback(() => {
    if (!forgeConfig?.run[0]) return;
    void startRunCommand(0);
  }, [forgeConfig?.run, startRunCommand]);

  const handleCoordinatorAskReviewer = useCallback(() => {
    const action: AgentChatNextAction = {
      id: 'coord-ask-reviewer',
      label: 'Ask reviewer',
      kind: 'ask_reviewer',
    };
    void handleWorkbenchAction(action);
  }, [handleWorkbenchAction]);

  const handleCoordinatorCreatePr = useCallback(() => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    void createWorkspacePr(workspaceId)
      .then(() => Promise.all([
        refreshWorkbenchState(),
        refreshReadiness(),
      ]))
      .catch(setActionError)
      .finally(() => setBusy(false));
  }, [refreshReadiness, refreshWorkbenchState, setActionError, workspaceId]);

  useEffect(() => {
    if (!requestedFilePath) return;
    void openEditorFile(requestedFilePath);
    onRequestedFilePathHandled();
  }, [onRequestedFilePathHandled, openEditorFile, requestedFilePath]);

  useEffect(() => {
    onActiveEditorFileChange?.(activeEditorPath);
  }, [activeEditorPath, onActiveEditorFileChange]);

  useEffect(() => {
    if (!workspaceId || visibleSessions.length === 0) return;
    const visibleIds = new Set(visibleSessions.map((session) => session.id));
    const layoutHasVisibleTerminal = Array.from(tileLayout.visibleTerminalSessionIds)
      .some((sessionId) => visibleIds.has(sessionId));
    if (!layoutHasVisibleTerminal) {
      const nextSessionId = focusedId ?? visibleSessions[0]?.id;
      if (nextSessionId) {
        tileLayout.resetLayout({ kind: 'terminal', sessionId: nextSessionId });
      }
      return;
    }
    if (focusedId && tileLayout.focusedLeaf && visibleIds.has(focusedId) && (
      tileLayout.focusedLeaf.content.kind === 'empty'
      || !tileLayout.visibleTerminalSessionIds.has(focusedId)
    )) {
      tileLayout.setTileContent(tileLayout.focusedLeaf.id, { kind: 'terminal', sessionId: focusedId });
    }
  }, [focusedId, tileLayout, visibleSessions, workspaceId]);

  useEffect(() => {
    if (!activeEditorPath) return;
    if (openEditors.some((editor) => editor.path === activeEditorPath)) return;
    setActiveEditorPath(openEditors[0]?.path ?? null);
  }, [activeEditorPath, openEditors]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      if (!activeEditorPath) return;
      event.preventDefault();
      void saveEditorFile(activeEditorPath);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeEditorPath, saveEditorFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (!tileLayout.focusedTileId) return;
      if (event.key === '\\') {
        event.preventDefault();
        const nextContent = nextSplitTileContent();
        tileLayout.splitTile(tileLayout.focusedTileId, 'horizontal', nextContent);
        if (nextContent.kind === 'terminal') {
          focusedIdRef.current = nextContent.sessionId;
          setFocusedId(nextContent.sessionId);
        }
      } else if (event.key === '-') {
        event.preventDefault();
        const nextContent = nextSplitTileContent();
        tileLayout.splitTile(tileLayout.focusedTileId, 'vertical', nextContent);
        if (nextContent.kind === 'terminal') {
          focusedIdRef.current = nextContent.sessionId;
          setFocusedId(nextContent.sessionId);
        }
      } else if (event.key === 'w') {
        event.preventDefault();
        tileLayout.closeTile(tileLayout.focusedTileId);
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        tileLayout.focusAdjacentTile('right');
      } else if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        tileLayout.focusAdjacentTile('left');
      } else if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        tileLayout.focusAdjacentTile('down');
      } else if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        tileLayout.focusAdjacentTile('up');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    tileLayout.focusedTileId,
    tileLayout.splitTile,
    tileLayout.closeTile,
    tileLayout.focusAdjacentTile,
    tileLayout.visibleTerminalSessionIds,
    visibleSessions,
    setFocusedId,
    focusedIdRef,
  ]);

  const nextSplitTileContent = (): TileContent => {
    const used = tileLayout.visibleTerminalSessionIds;
    const unused = visibleSessions.find((session) => !used.has(session.id));
    return unused ? { kind: 'terminal', sessionId: unused.id } : { kind: 'empty' };
  };

  const focusTerminalTile = (tile: TileLeaf, sessionId?: string) => {
    tileLayout.focusTile(tile.id);
    if (!sessionId) return;
    focusedIdRef.current = sessionId;
    setFocusedId(sessionId);
  };

  const splitTerminalTile = (tileId: string, direction: 'horizontal' | 'vertical') => {
    const nextContent = nextSplitTileContent();
    tileLayout.splitTile(tileId, direction, nextContent);
    if (nextContent.kind === 'terminal') {
      focusedIdRef.current = nextContent.sessionId;
      setFocusedId(nextContent.sessionId);
    }
  };

  const renderTileLeaf = (leaf: TileLeaf, focused: boolean) => {
    let session: TerminalSession | null = null;
    if (leaf.content.kind === 'terminal') {
      const sessionId = leaf.content.sessionId;
      session = visibleSessions.find((item) => item.id === sessionId) ?? null;
    }
    const unusedSessions = visibleSessions.filter((item) => !tileLayout.visibleTerminalSessionIds.has(item.id));

    const contextMenuProps = {
      onSplitRight: () => splitTerminalTile(leaf.id, 'horizontal'),
      onSplitDown: () => splitTerminalTile(leaf.id, 'vertical'),
      onClose: () => tileLayout.closeTile(leaf.id),
    };

    if (!session) {
      return (
        <TileContextMenu {...contextMenuProps}>
          <div
            className={`flex min-h-0 flex-1 flex-col rounded-md border bg-forge-bg p-3 ${focused ? 'border-forge-green/50 shadow-lg shadow-emerald-950/20' : 'border-forge-border'}`}
            onMouseDown={() => focusTerminalTile(leaf)}
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-forge-text">Empty tile</p>
              <p className="text-xs text-forge-muted">Attach a terminal session or right-click to split.</p>
            </div>
            <div className="grid gap-2 overflow-y-auto">
              {(unusedSessions.length > 0 ? unusedSessions : visibleSessions).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    tileLayout.setTileContent(leaf.id, { kind: 'terminal', sessionId: candidate.id });
                    focusedIdRef.current = candidate.id;
                    setFocusedId(candidate.id);
                  }}
                  className="rounded border border-forge-border bg-forge-surface px-3 py-2 text-left text-xs text-forge-muted hover:bg-white/5 hover:text-forge-text"
                >
                  <span className="font-semibold text-forge-text">{candidate.title || candidate.profile}</span>
                  <span className="ml-2 text-forge-dim">{candidate.status}</span>
                </button>
              ))}
              {visibleSessions.length === 0 && (
                <p className="text-xs text-forge-muted">No terminal sessions available.</p>
              )}
            </div>
          </div>
        </TileContextMenu>
      );
    }

    return (
      <TileContextMenu {...contextMenuProps}>
        <div className="relative flex min-h-0 flex-1">
          <TerminalPane
            key={session.id}
            session={session}
            chunks={outputs[session.id] ?? []}
            focused={focused}
            stuckSince={workspaceHealth?.terminals.find((t) => t.sessionId === session.id)?.stuckSince ?? null}
            onFocus={() => focusTerminalTile(leaf, session.id)}
            onStop={() => void stopTerminal(session.id)}
            onClose={() => void closeTerminal(session.id)}
            onData={(data) => void writeWorkspaceTerminalSessionInput(session.id, data).catch(setActionError)}
            onResize={(cols, rows) => void resizeWorkspaceTerminalSession(session.id, cols, rows).catch(() => undefined)}
          />
        </div>
      </TileContextMenu>
    );
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
        visibleSessions={visibleSessions}
        dockOverflowSessions={dockOverflowSessions}
        busy={busy}
        error={error}
        focusedSession={focusedSession}
        agentProfiles={agentProfiles}
        onOpenInCursor={onOpenInCursor}
        onCreateTerminal={(kind, profile, title, profileId) => void createTerminal(kind, profile, title, profileId)}
        onCopyFocusedOutput={() => void copyFocusedOutput()}
        onInterruptFocusedAgent={() => void interruptFocusedAgent()}
        onCloseTerminal={(sessionId) => void closeTerminal(sessionId)}
        onAttachTerminal={(session) => void attachTerminal(session)}
        onSetError={setError}
      />
      {coordinatorToast && (
        <div className="mx-2 mt-2 rounded border border-forge-blue/30 bg-forge-blue/10 px-3 py-1.5 text-xs text-forge-blue">
          {coordinatorToast}
        </div>
      )}

      <CoordinatorTimeline
        workspaceId={workspace.id}
        status={coordinatorStatus}
        agentProfiles={agentProfiles}
        onRefresh={() => void refreshCoordinatorStatus()}
        onOpenReviewCockpit={onOpenReviewCockpit}
        onReviewDiff={handleCoordinatorReviewDiff}
        onRunTests={handleCoordinatorRunTests}
        onAskReviewer={handleCoordinatorAskReviewer}
        onCreatePr={handleCoordinatorCreatePr}
        canReviewDiff={changedFiles.length > 0}
        canRunTests={Boolean(forgeConfig?.run[0])}
        canAskReviewer={false}
        canCreatePr={changedFiles.length > 0 && !workspace.prNumber}
        hasExistingPr={Boolean(workspace.prNumber)}
        onReplayAction={async (actionId, promptOverride) => {
          if (!workspaceId) return;
          try {
            const next = await replayWorkspaceCoordinatorAction({
              workspaceId,
              actionId,
              promptOverride: promptOverride ?? null,
            });
            setCoordinatorStatus(next);
          } catch (err) {
            const message = formatSessionError(err);
            if (message.startsWith('COORDINATOR_STEP_IN_PROGRESS:')) {
              showCoordinatorToast('Coordinator is busy. Try replay again after the current step finishes.');
              return;
            }
            throw err;
          }
        }}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {visibleSessions.length === 0 ? (
            <WorkspaceTerminalEmptyState
              busy={busy}
              localAgentProfiles={localAgentProfiles}
              onStartClaude={() => void createTerminal('agent', 'claude_code', 'Claude')}
              onStartCodex={() => void createTerminal('agent', 'codex', 'Codex')}
              onStartKimi={() => void createTerminal('agent', 'kimi_code', 'Kimi')}
              onStartLocalProfile={(profile) => void createTerminal('agent', profile.agent as TerminalProfile, profile.label, profile.id)}
              onStartShell={() => void createTerminal('shell', 'shell', 'Shell')}
            />
          ) : focusedSession ? (
            <TileLayout
              root={tileLayout.root}
              focusedTileId={tileLayout.focusedTileId}
              onFocusTile={tileLayout.focusTile}
              onResizeSplit={tileLayout.resizeSplit}
              renderLeaf={renderTileLeaf}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-forge-muted">
              Select a session above.
            </div>
          )}
        </div>

        <WorkspaceTerminalEditorPanel
          openEditors={openEditors}
          activeEditorPath={activeEditorPath}
          filePreviewWidth={filePreviewWidth}
          savingEditorPaths={savingEditorPaths}
          onFilePreviewWidthChange={setFilePreviewWidth}
          onActiveEditorPathChange={setActiveEditorPath}
          onCloseEditor={closeEditorFile}
          onEditorContentChange={updateEditorContent}
          onSaveEditor={(path) => void saveEditorFile(path)}
        />
      </div>

      <WorkspaceContextFooter workspaceId={workspace.id} />

      {(focusedIsAgent || hasAnyAgentSession) && (
        <WorkspaceComposer
          workspaceId={workspace.id}
          busy={busy}
          canInterrupt={focusedSession?.status === 'running' || false}
          queuedCount={0}
          promptTemplateWarning={promptTemplateWarning}
          workflowHint={workflowHint}
          promptTemplates={promptTemplates}
          agentContext={agentContext}
          agentProfiles={agentProfiles}
          coordinatorStatus={coordinatorStatus}
          settings={composerSettings}
          onSettingsChange={(patch) => setComposerSettings((current) => ({ ...current, ...patch }))}
          onSend={sendPrompt}
          onTogglePlanMode={togglePlanMode}
          onApplyWorkflowPreset={applyWorkflowPreset}
          onInterrupt={() => void interruptFocusedAgent()}
          onStopCoordinator={() => {
            void stopWorkspaceCoordinator(workspace.id)
              .then((status) => setCoordinatorStatus(status))
              .catch(setActionError);
          }}
        />
      )}
    </div>
  );
}

function TileContextMenu({
  children,
  onSplitRight,
  onSplitDown,
  onClose,
}: {
  children: ReactNode;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onClose: () => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[180px] rounded-md border border-forge-border bg-forge-surface p-1 shadow-xl shadow-black/40">
          <ContextMenu.Item
            onSelect={onSplitRight}
            className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-xs text-forge-text outline-none hover:bg-white/10"
          >
            Split Right
            <kbd className="ml-auto font-sans text-[10px] text-forge-dim">⌘\</kbd>
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onSplitDown}
            className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-xs text-forge-text outline-none hover:bg-white/10"
          >
            Split Down
            <kbd className="ml-auto font-sans text-[10px] text-forge-dim">⌘-</kbd>
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-forge-border/60" />
          <ContextMenu.Item
            onSelect={onClose}
            className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-xs text-forge-red outline-none hover:bg-forge-red/10"
          >
            Close Pane
            <kbd className="ml-auto font-sans text-[10px] text-forge-dim">⌘W</kbd>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
