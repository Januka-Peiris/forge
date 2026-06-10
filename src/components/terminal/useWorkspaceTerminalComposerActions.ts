import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
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

  const togglePlanMode = () => {
    // For a live agent TUI, forward a real Shift+Tab (CSI Z) so the agent
    // cycles its own permission mode — the TUI footer is the source of truth.
    // The composer setting still controls --permission-mode for new sessions.
    if (focusedRunningAgentSessionId) {
      void writeWorkspaceTerminalSessionInput(focusedRunningAgentSessionId, '\x1b[Z')
        .catch((err) => setActionError(err));
    }
    setComposerSettings((current) => {
      const next = current.selectedTaskMode === 'Plan' ? 'Act' : 'Plan';
      return { ...current, selectedTaskMode: next };
    });
  };

  /**
   * Update the selected model. If a Claude session is live, also switch it
   * in-place by typing "/model <id>" into the TUI; otherwise the selection
   * applies via --model on the next session spawn.
   */
  const changeModel = (model: string) => {
    if (
      focusedRunningAgentSessionId
      && activePromptProvider === 'claude_code'
      && model !== composerSettings.selectedModel
    ) {
      const sessionId = focusedRunningAgentSessionId;
      void (async () => {
        try {
          await writeWorkspaceTerminalSessionInput(sessionId, `/model ${model}`);
          // Enter as a separate write so the TUI treats it as submit.
          await new Promise((resolve) => setTimeout(resolve, 250));
          await writeWorkspaceTerminalSessionInput(sessionId, '\r');
        } catch (err) {
          setActionError(err);
        }
      })();
    }
    setComposerSettings((current) => ({ ...current, selectedModel: model }));
  };

  const handleWorkbenchAction = async (action: AgentChatNextAction) => {
    switch (action.kind) {
      case 'review_diff':
        await refreshWorkbenchState();
        return;
      case 'run_tests':
        if (mnemonicConfig?.run[0]) void startRunCommand(0);
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
      case 'refresh_comments':
        if (workspaceId) {
          const cockpit = await refreshWorkspacePrComments(workspaceId).catch((err) => {
            setActionError(err);
            return null;
          });
          if (cockpit) setReviewCockpit(cockpit);
        }
        return;
      default:
        return;
    }
  };

  const sendPrompt = (text: string) => {
    if (!workspaceId || !text.trim()) return;
    // Plan mode is real now: new sessions get --permission-mode plan, running
    // sessions are toggled via a forwarded Shift+Tab. No prompt-text prefix.
    const effectivePrompt = text.trim();

    const work = async () => {
      setBusy(true);
      setError(null);
      try {
        // Coordinator path - intentionally kept (uses SDK credits)
        if (composerSettings.promptMode === 'coordinator') {
          const brainProfileId = composerSettings.coordinatorBrainProfileId.trim();
          const coderProfileId = composerSettings.coordinatorCoderProfileId.trim();
          await stepWorkspaceCoordinator({
            workspaceId,
            instruction: effectivePrompt,
            brainProvider: composerSettings.coordinatorBrainProvider || null,
            coderProvider: composerSettings.coordinatorCoderProvider || null,
            brainProfileId: brainProfileId.length > 0 ? brainProfileId : null,
            coderProfileId: coderProfileId.length > 0 ? coderProfileId : null,
            brainModel: composerSettings.coordinatorBrainModel || null,
            coderModel: composerSettings.coordinatorCoderModel || null,
            brainReasoning: composerSettings.coordinatorBrainReasoning || null,
            coderReasoning: composerSettings.coordinatorCoderReasoning || null,
          });
          refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
        // Terminal path - interactive claude, subscription-safe
        let targetSession = focusedSession;
        const shouldAutoResumeClaude = Boolean(
          focusedSession
            && focusedSession.status !== 'running'
            && focusedSession.claudeSessionId
            && focusedSession.terminalKind === 'agent'
            && (focusedSession.profile === 'claude_code' || focusedSession.command.includes('claude')),
        );
        if (shouldAutoResumeClaude && focusedSession) {
          targetSession = await resumeClaudeSession(focusedSession);
        }
        const terminalProfileId = targetSession?.terminalKind === 'agent' ? targetSession.profile : selectedProfileId;
        // Prompts always dispatch immediately: the agent TUI (Claude Code,
        // Codex) natively queues input submitted while it is mid-turn, so
        // there is no app-level queueing or interrupt-before-send.
        await queueWorkspaceAgentPrompt({
          workspaceId,
          sessionId: targetSession?.status === 'running' ? targetSession.id : undefined,
          prompt: effectivePrompt,
          profileId: terminalProfileId,
          extraArgs: activePromptProvider === 'claude_code' ? claudeLaunchExtraArgs(composerSettings) : undefined,
        });
      } catch (err) {
        const message = formatSessionError(err);
        if (message.startsWith('COORDINATOR_STEP_IN_PROGRESS:')) {
          onCoordinatorInfo?.('Coordinator is already stepping. Waiting for current step to finish.');
          refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
        setActionError(err);
      } finally {
        setBusy(false);
      }
      // Post-send refreshes run in background, don't block next send
      refreshSessions(true).catch(() => undefined);
      refreshCoordinatorStatus().catch(() => undefined);
    };

    promptSendChainRef.current = promptSendChainRef.current.catch(() => undefined).then(work);
    void promptSendChainRef.current;
  };

  return {
    togglePlanMode,
    changeModel,
    handleWorkbenchAction,
    sendPrompt,
  };
}
