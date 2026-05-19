import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Terminal as TerminalIcon } from 'lucide-react';
import type { AgentProfile, DiscoveredRepository, MnemonicWorkspaceConfig, TerminalProfile, TerminalSession, Workspace, WorkspaceAgentContext, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import type { AgentChatNextAction } from '../../types/agent-chat';
import type { WorkspaceCoordinatorStatus } from '../../types/coordinator';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import type { RepositoryRelationship } from '../../types/repository-relationship';
import {
  getWorkspaceTerminalOutputForSession,
  listWorkspaceTerminalSessions,
  listWorkspaceVisibleTerminalSessions,
  resizeWorkspaceTerminalSession,
  writeWorkspaceTerminalSessionInput,
} from '../../lib/tauri-api/terminal';
import { CommandApprovalModal, type PendingCommand } from '../modals/CommandApprovalModal';
import {
  getWorkspaceMnemonicConfig,
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
import { mnWarn } from '../../lib/mn-log';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';
import { formatSessionError } from '../../lib/ui-errors';
import { TerminalPane } from './WorkspaceTerminalPane';
import { TileLayout } from '../layout/TileLayout';
import { useTileLayoutState } from '../layout/useTileLayoutState';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceComposer, type ComposerSettings } from './WorkspaceComposer';
import {
  isKnownComposerModel,
  providerModelOptions,
  providerReasoningOptions,
} from './workspace-composer-options';
import type { PromptTemplate } from '../../types/prompt-template';
import { useSyncedRef } from '../../lib/hooks/useSyncedRef';
import { useActiveAgentProviders } from '../../lib/hooks/useActiveAgentProviders';
import { isAgentProfileActive, providerForAgentProfile, type AgentProviderId } from '../../lib/active-agent-providers';
import { useWorkspaceTerminalOutput } from './useWorkspaceTerminalOutput';
import { WorkspaceTerminalEmptyState } from './WorkspaceTerminalEmptyState';
import { WorkspaceContextFooter } from './WorkspaceContextFooter';
import { CoordinatorTimeline } from './CoordinatorTimeline';
import { useWorkspaceTerminalComposerActions } from './useWorkspaceTerminalComposerActions';
import { useWorkspaceTerminalSessionActions } from './useWorkspaceTerminalSessionActions';
import { useWorkspaceTerminalPolling } from './useWorkspaceTerminalPolling';
import { useWorkspaceTerminalEvents } from './useWorkspaceTerminalEvents';
import { WorkspaceTerminalEditorPanel, type EditorTab } from './WorkspaceTerminalEditorPanel';
import { FederatedTaskCockpit } from '../federation/FederatedTaskCockpit';
import { readWorkspaceFile, writeWorkspaceFile } from '../../lib/tauri-api/workspace-file-tree';
import type { TileLeaf } from '../../types/tile-layout';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_KIMI_MODEL = 'kimi-for-coding';

const FILE_PREVIEW_WIDTH_KEY = 'mn:file-preview-width';
const COMPOSER_SETTINGS_KEY = 'mn:composer-settings';

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

function providerFromProfileRef(profileRef?: string | null): AgentProviderId | null {
  switch ((profileRef ?? '').trim()) {
    case 'claude_code':
    case 'claude-code':
    case 'claude':
      return 'claude_code';
    case 'codex':
      return 'codex';
    case 'kimi_code':
    case 'kimi-code':
    case 'kimi':
      return 'kimi_code';
    case 'local_llm':
    case 'local-llm':
      return 'local_llm';
    case 'openai':
      return 'openai';
    default:
      return null;
  }
}

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
  workspaces?: Workspace[];
  repositories?: DiscoveredRepository[];
  repositoryRelationships?: RepositoryRelationship[];
  requestedFilePath: string | null;
  onRequestedFilePathHandled: () => void;
  onActiveEditorFileChange?: (path: string | null) => void;
  onOpenInCursor?: () => void;
  onOpenReviewCockpit?: (path?: string | null) => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onCreateWorkspaceForRepo?: (repositoryId: string, parentWorkspaceId?: string, sourceWorkspaceId?: string) => void;
}

export function WorkspaceTerminal({
  workspace,
  workspaces = [],
  repositories = [],
  repositoryRelationships = [],
  requestedFilePath,
  onRequestedFilePathHandled,
  onActiveEditorFileChange,
  onOpenInCursor,
  onOpenReviewCockpit,
  onSelectWorkspace,
  onCreateWorkspaceForRepo,
}: WorkspaceTerminalProps) {
  const [visibleSessions, setVisibleSessions] = useState<TerminalSession[]>([]);
  const [allSessions, setAllSessions] = useState<TerminalSession[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setCommandBusy] = useState<string | null>(null);
  const [mnemonicConfig, setMnemonicConfig] = useState<MnemonicWorkspaceConfig | null>(null);
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
  const activeProviders = useActiveAgentProviders(agentProfiles);
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
    mnWarn('terminal', 'action error', { err, message: msg });
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
    () => agentProfiles.filter((profile) => (profile.agent === 'local_llm' || profile.local) && isAgentProfileActive(profile, activeProviders.activeProviderSet)),
    [activeProviders.activeProviderSet, agentProfiles],
  );
  const focusedIsAgent = focusedSession?.terminalKind === 'agent' || focusedSession?.sessionRole === 'agent';
  const activePromptProfileRef = focusedIsAgent ? focusedSession?.profile : selectedProfileId;
  const activePromptProfile = useMemo(
    () => {
      if (!activePromptProfileRef) return null;
      return agentProfiles.find((profile) => profile.id === activePromptProfileRef)
        ?? agentProfiles.find((profile) => profile.agent === activePromptProfileRef)
        ?? null;
    },
    [activePromptProfileRef, agentProfiles],
  );
  const activePromptProvider = useMemo<AgentProviderId>(
    () => (activePromptProfile ? providerForAgentProfile(activePromptProfile) : null)
      ?? providerFromProfileRef(activePromptProfileRef)
      ?? 'claude_code',
    [activePromptProfile, activePromptProfileRef],
  );
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


  const refreshMnemonicConfig = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setMnemonicConfig(await getWorkspaceMnemonicConfig(workspaceId));
    } catch (err) {
      setMnemonicConfig({
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
        repositoryRelationships: [],
        repositoryRelationshipWarnings: [],
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
      mnWarn('prompt-templates', 'load error', { err });
      setPromptTemplates([]);
      setPromptTemplateWarning(formatSessionError(err));
    }
  }, [workspaceId]);

  const refreshAgentContext = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setAgentContext(await getWorkspaceAgentContext(workspaceId));
    } catch (err) {
      mnWarn('agent-context', 'load error', { err });
      setAgentContext(null);
    }
  }, [workspaceId]);

  const refreshHealth = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setWorkspaceHealth(await getWorkspaceHealth(workspaceId));
    } catch (err) {
      mnWarn('workspace-health', 'load error', { err });
      setWorkspaceHealth(null);
      setWorkspaceReadiness(null);
    }
  }, [workspaceId]);

  const refreshReadiness = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setWorkspaceReadiness(await getWorkspaceReadiness(workspaceId));
    } catch (err) {
      mnWarn('workspace-readiness', 'load error', { err });
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
      mnWarn('agent-workbench', 'load error', { err });
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
      mnWarn('agent-profiles', 'load error', { err });
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
    } catch (err) {
      mnWarn('agent-models', 'load error', { err });
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
    setMnemonicConfig(null);
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
      void refreshMnemonicConfig();
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
  }, [refreshAgentContext, refreshAgentProfiles, refreshCoordinatorStatus, refreshMnemonicConfig, refreshHealth, refreshModelSettings, refreshReadiness, refreshPromptTemplates, refreshSessions, refreshWorkbenchState, resetWorkspaceState, workspaceId]);

  useEffect(() => {
    setComposerSettings((current) => {
      const modelOptions = providerModelOptions(activePromptProvider);
      const modelBelongsToProvider = modelOptions.some((option) => option.value === current.selectedModel);
      const modelIsCustom = current.selectedModel.trim().length > 0 && !isKnownComposerModel(current.selectedModel);
      const defaultModel = activePromptProvider === 'codex'
        ? providerModelDefaults.codex
        : activePromptProvider === 'kimi_code'
          ? providerModelDefaults.kimi
          : activePromptProvider === 'local_llm'
            ? activePromptProfile?.model ?? ''
            : providerModelDefaults.claude;
      const nextModel = modelBelongsToProvider || modelIsCustom ? current.selectedModel : defaultModel;

      const reasoningOptions = providerReasoningOptions(activePromptProvider);
      const defaultReasoning = activePromptProvider === 'codex' || activePromptProvider === 'openai'
        ? 'medium'
        : activePromptProvider === 'kimi_code'
          ? 'default'
          : 'Default';
      const reasoningBelongsToProvider = reasoningOptions.some((option) => option.value === current.selectedReasoning);
      const nextReasoning = reasoningOptions.length === 0 || reasoningBelongsToProvider
        ? current.selectedReasoning
        : defaultReasoning;

      if (nextModel === current.selectedModel && nextReasoning === current.selectedReasoning) return current;
      return { ...current, selectedModel: nextModel, selectedReasoning: nextReasoning };
    });
  }, [activePromptProfile?.model, activePromptProvider, providerModelDefaults]);

  useEffect(() => {
    window.localStorage.setItem(FILE_PREVIEW_WIDTH_KEY, String(filePreviewWidth));
  }, [filePreviewWidth]);

  useEffect(() => {
    window.localStorage.setItem(COMPOSER_SETTINGS_KEY, JSON.stringify(composerSettings));
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
    mnemonicConfig,
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
    if (!mnemonicConfig?.run[0]) return;
    void startRunCommand(0);
  }, [mnemonicConfig?.run, startRunCommand]);

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

  // Sync focusedId FROM the tile layout when the focused tile changes (e.g. after closeTile)
  useEffect(() => {
    if (!tileLayout.focusedLeaf) return;
    if (tileLayout.focusedLeaf.content.kind !== 'terminal') return;
    const tileSessionId = tileLayout.focusedLeaf.content.sessionId;
    if (tileSessionId && tileSessionId !== focusedId) {
      focusedIdRef.current = tileSessionId;
      setFocusedId(tileSessionId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileLayout.focusedLeaf]);

  // Sync the single tile to show the focused session (tabbed terminal model)
  const { visibleTerminalSessionIds, focusedLeaf, resetLayout, setTileContent } = tileLayout;
  useEffect(() => {
    if (!workspaceId || visibleSessions.length === 0) return;
    const visibleIds = new Set(visibleSessions.map((session) => session.id));
    const layoutHasVisibleTerminal = Array.from(visibleTerminalSessionIds)
      .some((sessionId) => visibleIds.has(sessionId));
    if (!layoutHasVisibleTerminal) {
      const nextSessionId = focusedId ?? visibleSessions[0]?.id;
      if (nextSessionId) {
        resetLayout({ kind: 'terminal', sessionId: nextSessionId });
      }
      return;
    }
    if (focusedId && focusedLeaf && visibleIds.has(focusedId)
      && !visibleTerminalSessionIds.has(focusedId)
    ) {
      setTileContent(focusedLeaf.id, { kind: 'terminal', sessionId: focusedId });
    }
  }, [focusedId, focusedLeaf, visibleTerminalSessionIds, resetLayout, setTileContent, visibleSessions, workspaceId]);

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
      if (event.key === 'w') {
        event.preventDefault();
        event.stopPropagation();
        if (focusedSession) void closeTerminal(focusedSession.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [focusedSession, closeTerminal]);

  const renderTileLeaf = (leaf: TileLeaf, focused: boolean) => {
    let session: TerminalSession | null = null;
    if (leaf.content.kind === 'terminal') {
      const sessionId = leaf.content.sessionId;
      session = visibleSessions.find((item) => item.id === sessionId) ?? null;
    }

    if (!session) {
      return (
        <div
          className={`flex min-h-0 flex-1 flex-col rounded-md border bg-mn-bg p-3 ${focused ? 'border-mn-cyan/50 shadow-lg shadow-emerald-950/20' : 'border-mn-border'}`}
        >
          <p className="text-sm text-mn-muted">No session selected. Create a terminal above.</p>
        </div>
      );
    }

    return (
      <TerminalContextMenu onKillSession={() => void closeTerminal(session.id)}>
        <div className="relative flex min-h-0 flex-1">
          <TerminalPane
            key={session.id}
            session={session}
            chunks={outputs[session.id] ?? []}
            focused={focused}
            stuckSince={workspaceHealth?.terminals.find((t) => t.sessionId === session.id)?.stuckSince ?? null}
            onFocus={() => undefined}
            onStop={() => void stopTerminal(session.id)}
            onClose={() => void closeTerminal(session.id)}
            onData={(data) => void writeWorkspaceTerminalSessionInput(session.id, data).catch(setActionError)}
            onResize={(cols, rows) => void resizeWorkspaceTerminalSession(session.id, cols, rows).catch(() => undefined)}
          />
        </div>
      </TerminalContextMenu>
    );
  };

  if (!workspace) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center p-8">
        <div className="text-center">
          <TerminalIcon className="mx-auto mb-3 h-8 w-8 text-mn-muted" />
          <p className="text-sm text-mn-muted">Select a workspace to start a terminal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-mn-bg">
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
        activeProviderIds={activeProviders.activeProviderSet}
        onOpenInCursor={onOpenInCursor}
        onCreateTerminal={(kind, profile, title, profileId) => void createTerminal(kind, profile, title, profileId)}
        onCopyFocusedOutput={() => void copyFocusedOutput()}
        onInterruptFocusedAgent={() => void interruptFocusedAgent()}
        onCloseTerminal={(sessionId) => void closeTerminal(sessionId)}
        onAttachTerminal={(session) => void attachTerminal(session)}
        onSetError={setError}
      />
      <FederatedTaskCockpit
        workspace={workspace}
        workspaces={workspaces}
        repositories={repositories}
        relationships={repositoryRelationships}
        onSelectWorkspace={onSelectWorkspace ?? (() => undefined)}
        onCreateWorkspaceForRepo={onCreateWorkspaceForRepo}
      />
      {coordinatorToast && (
        <div className="mx-2 mt-2 rounded border border-mn-blue/30 bg-mn-blue/10 px-3 py-1.5 text-xs text-mn-blue">
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
        canRunTests={Boolean(mnemonicConfig?.run[0])}
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
              activeProviderIds={activeProviders.activeProviderSet}
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
            <div className="flex h-full items-center justify-center text-sm text-mn-muted">
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
          activeProviderIds={activeProviders.activeProviderSet}
          provider={activePromptProvider}
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

function TerminalContextMenu({
  children,
  onKillSession,
}: {
  children: ReactNode;
  onKillSession: () => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[180px] rounded-md border border-mn-border bg-mn-surface p-1 shadow-xl shadow-black/40">
          <ContextMenu.Item
            onSelect={onKillSession}
            className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-xs text-mn-red outline-none hover:bg-mn-red/10"
          >
            Kill Session
            <kbd className="ml-auto font-sans text-[10px] text-mn-dim">⌘W</kbd>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
