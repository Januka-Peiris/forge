import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createWorkspacePr } from '../../lib/tauri-api/pr-draft';
import { refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import { interruptWorkspaceTerminalSessionById, queueWorkspaceAgentPrompt } from '../../lib/tauri-api/terminal';
import { stepWorkspaceCoordinator } from '../../lib/tauri-api/coordinator';
import { formatSessionError } from '../../lib/ui-errors';
import type { AgentChatNextAction } from '../../types/agent-chat';

import type { ForgeWorkspaceConfig, TerminalSession } from '../../types';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import type { ComposerSettings } from './WorkspaceComposer';

interface UseWorkspaceTerminalComposerActionsParams {
  workspaceId: string | null;
  focusedSession: TerminalSession | null;
  selectedProfileId: string;
  composerSettings: ComposerSettings;
  forgeConfig: ForgeWorkspaceConfig | null;
  refreshWorkbenchState: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  refreshCoordinatorStatus: () => Promise<void>;
  startRunCommand: (index: number, restart?: boolean) => Promise<void>;
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
  onCoordinatorInfo,
  promptSendChainRef,
}: UseWorkspaceTerminalComposerActionsParams) {
  const togglePlanMode = () => {
    setComposerSettings((current) => {
      const next = current.selectedTaskMode === 'Plan' ? 'Act' : 'Plan';
      return { ...current, selectedTaskMode: next };
    });
  };

  const handleWorkbenchAction = async (action: AgentChatNextAction) => {
    switch (action.kind) {
      case 'review_diff':
        await refreshWorkbenchState();
        return;
      case 'run_tests':
        if (forgeConfig?.run[0]) void startRunCommand(0);
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

  const applyWorkflowPreset = (_preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => {
    void defaultPrompt;
    if (_preset === 'plan-act' || _preset === 'plan-codex-review') {
      setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Plan' }));
    } else {
      setComposerSettings((current) => ({ ...current, selectedTaskMode: 'Act' }));
    }
  };

  const sendPrompt = (text: string, opts?: { forceImmediate?: boolean }) => {
    if (!workspaceId || !text.trim()) return;
    const { sendBehavior, selectedTaskMode, selectedReasoning } = composerSettings;
    const effectiveBehavior = opts?.forceImmediate ? 'send_now' : sendBehavior;

    const work = async () => {
      setBusy(true);
      setError(null);
      try {
        // Coordinator path — intentionally kept (uses SDK credits)
        if (composerSettings.promptMode === 'coordinator') {
          const brainProfileId = composerSettings.coordinatorBrainProfileId.trim();
          const coderProfileId = composerSettings.coordinatorCoderProfileId.trim();
          await stepWorkspaceCoordinator({
            workspaceId,
            instruction: text,
            brainProvider: composerSettings.coordinatorBrainProvider || null,
            coderProvider: composerSettings.coordinatorCoderProvider || null,
            brainProfileId: brainProfileId.length > 0 ? brainProfileId : null,
            coderProfileId: coderProfileId.length > 0 ? coderProfileId : null,
            brainModel: composerSettings.coordinatorBrainModel || null,
            coderModel: composerSettings.coordinatorCoderModel || null,
            brainReasoning: composerSettings.coordinatorBrainReasoning || null,
            coderReasoning: composerSettings.coordinatorCoderReasoning || null,
          });
          await refreshCoordinatorStatus();
          return;
        }
        // Terminal path — interactive claude, subscription-safe
        if (effectiveBehavior === 'interrupt_send' && focusedSession) {
          await interruptWorkspaceTerminalSessionById(focusedSession.id).catch(() => undefined);
        }
        const terminalProfileId = focusedSession?.terminalKind === 'agent' ? focusedSession.profile : selectedProfileId;
        await queueWorkspaceAgentPrompt({
          workspaceId,
          prompt: text,
          profileId: terminalProfileId,
          taskMode: selectedTaskMode,
          reasoning: selectedReasoning,
          model: composerSettings.selectedModel,
        });
        await refreshCoordinatorStatus().catch(() => undefined);
      } catch (err) {
        const message = formatSessionError(err);
        if (message.startsWith('COORDINATOR_STEP_IN_PROGRESS:')) {
          onCoordinatorInfo?.('Coordinator is already stepping. Waiting for current step to finish…');
          await refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
        setActionError(err);
      } finally {
        setBusy(false);
      }
    };

    promptSendChainRef.current = promptSendChainRef.current.catch(() => undefined).then(work);
    void promptSendChainRef.current;
  };

  return {
    togglePlanMode,
    handleWorkbenchAction,
    applyWorkflowPreset,
    sendPrompt,
  };
}
