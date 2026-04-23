import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createWorkspacePr } from '../../lib/tauri-api/pr-draft';
import { refreshWorkspacePrComments } from '../../lib/tauri-api/review-cockpit';
import { sendAgentChatMessage, interruptAgentChatSession } from '../../lib/tauri-api/agent-chat';
import { interruptWorkspaceTerminalSessionById, queueWorkspaceAgentPrompt } from '../../lib/tauri-api/terminal';
import { stepWorkspaceCoordinator } from '../../lib/tauri-api/coordinator';
import { latestPlanEvent } from '../../lib/agent-workbench';
import { formatSessionError } from '../../lib/ui-errors';
import type { AgentChatEvent, AgentChatNextAction, AgentChatSession } from '../../types/agent-chat';
import type { ForgeWorkspaceConfig, TerminalSession } from '../../types';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import type { ComposerSettings } from './WorkspaceComposer';

interface UseWorkspaceTerminalComposerActionsParams {
  workspaceId: string | null;
  focusedChatSession: AgentChatSession | null;
  focusedSession: TerminalSession | null;
  focusedChatEvents: AgentChatEvent[];
  selectedProfileId: string;
  composerSettings: ComposerSettings;
  acceptedPlans: Record<string, string>;
  forgeConfig: ForgeWorkspaceConfig | null;
  refreshChatSessions: (preferredFocusId?: string | null, scope?: 'all' | 'active') => Promise<void>;
  refreshWorkbenchState: () => Promise<void>;
  refreshReadiness: () => Promise<void>;
  refreshCoordinatorStatus: () => Promise<void>;
  closeChatSession: (sessionId: string) => Promise<void>;
  startRunCommand: (index: number, restart?: boolean) => Promise<void>;
  setReviewCockpit: (cockpit: WorkspaceReviewCockpit | null) => void;
  setAcceptedPlans: Dispatch<SetStateAction<Record<string, string>>>;
  setComposerSettings: Dispatch<SetStateAction<ComposerSettings>>;
  setQueuedPrompts: Dispatch<SetStateAction<Record<string, string[]>>>;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setActionError: (err: unknown) => void;
  onCoordinatorInfo?: (message: string) => void;
  promptSendChainRef: MutableRefObject<Promise<void>>;
}

export function useWorkspaceTerminalComposerActions({
  workspaceId,
  focusedChatSession,
  focusedSession,
  focusedChatEvents,
  selectedProfileId,
  composerSettings,
  acceptedPlans,
  forgeConfig,
  refreshChatSessions,
  refreshWorkbenchState,
  refreshReadiness,
  refreshCoordinatorStatus,
  closeChatSession,
  startRunCommand,
  setReviewCockpit,
  setAcceptedPlans,
  setComposerSettings,
  setQueuedPrompts,
  setBusy,
  setError,
  setActionError,
  onCoordinatorInfo,
  promptSendChainRef,
}: UseWorkspaceTerminalComposerActionsParams) {
  const togglePlanMode = () => {
    setComposerSettings((current) => {
      const next = current.selectedTaskMode === 'Plan' ? 'Act' : 'Plan';
      if (focusedChatSession?.provider === 'claude_code') {
        return { ...current, selectedTaskMode: next, selectedClaudeAgent: next === 'Plan' ? 'Plan' : 'general-purpose' };
      }
      return { ...current, selectedTaskMode: next };
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

  const sendPrompt = (text: string, opts?: { forceImmediate?: boolean }) => {
    if (!workspaceId || !text.trim()) return;
    const { sendBehavior, selectedTaskMode, selectedReasoning, selectedClaudeAgent, selectedModel } = composerSettings;
    const effectiveBehavior = opts?.forceImmediate ? 'send_now' : sendBehavior;

    const work = async () => {
      setBusy(true);
      setError(null);
      try {
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
        if (focusedChatSession) {
          if (focusedChatSession.status === 'running' && effectiveBehavior === 'queue_send') {
            setQueuedPrompts((current) => ({
              ...current,
              [focusedChatSession.id]: [...(current[focusedChatSession.id] ?? []), text.trim()],
            }));
            return;
          }
          if (focusedChatSession.status === 'running' && effectiveBehavior === 'send_now') {
            setError('Agent is still running. Use Interrupt + send or Queue if running.');
            return;
          }
          let prompt = text;
          const acceptedPlan = acceptedPlans[focusedChatSession.id];
          if (acceptedPlan && selectedTaskMode !== 'Plan' && !prompt.includes('Accepted implementation plan:')) {
            prompt = `Accepted implementation plan:\n${acceptedPlan}\n\nNow continue with this user request:\n${prompt}`;
          }
          if (effectiveBehavior === 'interrupt_send' && focusedChatSession.status === 'running') {
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
          await refreshCoordinatorStatus().catch(() => undefined);
          return;
        }
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
    sendChatInstruction,
    handleWorkbenchAction,
    applyWorkflowPreset,
    sendPrompt,
  };
}
