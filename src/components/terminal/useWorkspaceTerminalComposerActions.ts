import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useRef } from 'react';
import { createWorkspacePr } from '../../lib/tauri-api/pr-draft';
import { refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import { queueWorkspaceAgentPrompt, writeWorkspaceTerminalSessionInput } from '../../lib/tauri-api/terminal';
import { stepWorkspaceCoordinator } from '../../lib/tauri-api/coordinator';
import { formatSessionError } from '../../lib/ui-errors';
import type { AgentChatNextAction } from '../../types/agent-chat';
import type { AgentProviderId } from '../../lib/active-agent-providers';
import { claudeLaunchExtraArgs } from './workspace-composer-options';

import type { MnemonicWorkspaceConfig, TerminalSession } from '../../types';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import type { ComposerSettings } from './WorkspaceComposer';

interface UseWorkspaceTerminalComposerActionsParams {
  workspaceId: string | null;
  focusedSession: TerminalSession | null;
  selectedProfileId: string;
  activePromptProvider: AgentProviderId;
  composerSettings: ComposerSettings;
  mnemonicConfig: MnemonicWorkspaceConfig | null;
  refreshSessions: (fetchOutput?: boolean) => Promise<void>;
  refreshWorkbenchState: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  refreshCoordinatorStatus: () => Promise<void>;
  startRunCommand: (index: number, restart?: boolean) => Promise<void>;
  resumeClaudeSession: (session: TerminalSession) => Promise<TerminalSession | null>;
  setReviewCockpit: (cockpit: WorkspaceReviewCockpit | null) => void;
  setComposerSettings: Dispatch<SetStateAction<ComposerSettings>>;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setActionError: (err: unknown) => void;
  onCoordinatorInfo?: (message: string) => void;
  promptSendChainRef: MutableRefObject<Promise<void>>;
}

export function useWorkspaceTerminalComposerActions({
  workspaceId,
  focusedSession,
  selectedProfileId,
  activePromptProvider,
  composerSettings,
  mnemonicConfig,
  refreshSessions,
  refreshWorkbenchState,
  refreshReadiness,
  refreshCoordinatorStatus,
  startRunCommand,
  resumeClaudeSession,
  setReviewCockpit,
  setComposerSettings,
  setBusy,
  setError,
  setActionError,
  onCoordinatorInfo,
  promptSendChainRef,
}: UseWorkspaceTerminalComposerActionsParams) {
  const focusedRunningAgentSessionId = focusedSession?.status === 'running'
    && (focusedSession.terminalKind === 'agent' || focusedSession.sessionRole === 'agent')
    ? focusedSession.id
    : null;

  const latestRef = useRef({
    workspaceId,
    focusedSession,
    selectedProfileId,
    activePromptProvider,
    composerSettings,
    mnemonicConfig,
    focusedRunningAgentSessionId,
    refreshSessions,
    refreshWorkbenchState,
    refreshReadiness,
    refreshCoordinatorStatus,
    startRunCommand,
    resumeClaudeSession,
    setReviewCockpit,
    setComposerSettings,
    setBusy,
    setError,
    setActionError,
    onCoordinatorInfo,
  });
  latestRef.current = {
    workspaceId,
    focusedSession,
    selectedProfileId,
    activePromptProvider,
    composerSettings,
    mnemonicConfig,
    focusedRunningAgentSessionId,
    refreshSessions,
    refreshWorkbenchState,
    refreshReadiness,
    refreshCoordinatorStatus,
    startRunCommand,
    resumeClaudeSession,
    setReviewCockpit,
    setComposerSettings,
    setBusy,
    setError,
    setActionError,
    onCoordinatorInfo,
  };

  const cycleAgentMode = useCallback(() => {
    const ctx = latestRef.current;
    if (ctx.focusedRunningAgentSessionId) {
      void writeWorkspaceTerminalSessionInput(ctx.focusedRunningAgentSessionId, '\x1b[Z')
        .catch((err) => ctx.setActionError(err));
      return;
    }
    ctx.setComposerSettings((current) => {
      const next = current.selectedTaskMode === 'Act'
        ? 'Accept Edits'
        : current.selectedTaskMode === 'Accept Edits'
          ? 'Plan'
          : 'Act';
      return { ...current, selectedTaskMode: next };
    });
  }, []);

  const changeModel = useCallback((model: string) => {
    const ctx = latestRef.current;
    if (
      ctx.focusedRunningAgentSessionId
      && ctx.activePromptProvider === 'claude_code'
      && model !== ctx.composerSettings.selectedModel
    ) {
      const sessionId = ctx.focusedRunningAgentSessionId;
      void (async () => {
        try {
          await writeWorkspaceTerminalSessionInput(sessionId, `/model ${model}`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          await writeWorkspaceTerminalSessionInput(sessionId, '\r');
        } catch (err) {
          ctx.setActionError(err);
        }
      })();
    }
    ctx.setComposerSettings((current) => ({ ...current, selectedModel: model }));
  }, []);

  const handleWorkbenchAction = useCallback(async (action: AgentChatNextAction) => {
    const ctx = latestRef.current;
    switch (action.kind) {
      case 'review_diff':
        await ctx.refreshWorkbenchState();
        return;
      case 'run_tests':
        if (ctx.mnemonicConfig?.run[0]) void ctx.startRunCommand(0);
        return;
      case 'create_pr':
        if (ctx.workspaceId) {
          ctx.setBusy(true);
          ctx.setError(null);
          try {
            await createWorkspacePr(ctx.workspaceId);
            await ctx.refreshWorkbenchState();
            await ctx.refreshReadiness();
          } catch (err) {
            ctx.setActionError(err);
          } finally {
            ctx.setBusy(false);
          }
        }
        return;
      case 'refresh_comments':
        if (ctx.workspaceId) {
          const cockpit = await refreshWorkspacePrComments(ctx.workspaceId).catch((err) => {
            ctx.setActionError(err);
            return null;
          });
          if (cockpit) ctx.setReviewCockpit(cockpit);
        }
        return;
      default:
        return;
    }
  }, []);

  const sendPrompt = useCallback((text: string) => {
    const ctx = latestRef.current;
    if (!ctx.workspaceId || !text.trim()) return;
    const effectivePrompt = text.trim();

    const work = async () => {
      const c = latestRef.current;
      c.setBusy(true);
      c.setError(null);
      try {
        if (c.composerSettings.promptMode === 'coordinator') {
          const brainProfileId = c.composerSettings.coordinatorBrainProfileId.trim();
          const coderProfileId = c.composerSettings.coordinatorCoderProfileId.trim();
          await stepWorkspaceCoordinator({
            workspaceId: c.workspaceId!,
            instruction: effectivePrompt,
            brainProvider: c.composerSettings.coordinatorBrainProvider || null,
            coderProvider: c.composerSettings.coordinatorCoderProvider || null,
            brainProfileId: brainProfileId.length > 0 ? brainProfileId : null,
            coderProfileId: coderProfileId.length > 0 ? coderProfileId : null,
            brainModel: c.composerSettings.coordinatorBrainModel || null,
            coderModel: c.composerSettings.coordinatorCoderModel || null,
            brainReasoning: c.composerSettings.coordinatorBrainReasoning || null,
            coderReasoning: c.composerSettings.coordinatorCoderReasoning || null,
          });
          c.refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
        let targetSession = c.focusedSession;
        const shouldAutoResumeClaude = Boolean(
          c.focusedSession
            && c.focusedSession.status !== 'running'
            && c.focusedSession.claudeSessionId
            && c.focusedSession.terminalKind === 'agent'
            && (c.focusedSession.profile === 'claude_code' || c.focusedSession.command.includes('claude')),
        );
        if (shouldAutoResumeClaude && c.focusedSession) {
          targetSession = await c.resumeClaudeSession(c.focusedSession);
        }
        const terminalProfileId = targetSession?.terminalKind === 'agent' ? targetSession.profile : c.selectedProfileId;
        await queueWorkspaceAgentPrompt({
          workspaceId: c.workspaceId!,
          sessionId: targetSession?.status === 'running' ? targetSession.id : undefined,
          prompt: effectivePrompt,
          profileId: terminalProfileId,
          extraArgs: c.activePromptProvider === 'claude_code' ? claudeLaunchExtraArgs(c.composerSettings) : undefined,
        });
      } catch (err) {
        const c2 = latestRef.current;
        const message = formatSessionError(err);
        if (message.startsWith('COORDINATOR_STEP_IN_PROGRESS:')) {
          c2.onCoordinatorInfo?.('Coordinator is already stepping. Waiting for current step to finish.');
          c2.refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
        c2.setActionError(err);
      } finally {
        latestRef.current.setBusy(false);
      }
      const c3 = latestRef.current;
      c3.refreshSessions(true).catch(() => undefined);
      c3.refreshCoordinatorStatus().catch(() => undefined);
    };

    promptSendChainRef.current = promptSendChainRef.current.catch(() => undefined).then(work);
    void promptSendChainRef.current;
  }, [promptSendChainRef]);

  return {
    cycleAgentMode,
    changeModel,
    handleWorkbenchAction,
    sendPrompt,
  };
}
