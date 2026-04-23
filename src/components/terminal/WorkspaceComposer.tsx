import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, ListChecks, Zap } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { AgentChatSession, AgentProfile, WorkspaceAgentContext, WorkspaceContextPreview, WorkspaceCoordinatorStatus } from '../../types';
import type { PromptTemplate } from '../../types/prompt-template';
import { getWorkspaceContextPreview, refreshWorkspaceRepoContext } from '../../lib/tauri-api/agent-context';
import { agentProfilesForCoordinatorPicker } from '../../lib/tauri-api/agent-profiles';
import { formatSessionError } from '../../lib/ui-errors';
import {
  AGENT_COMPOSER_DEFAULT_PX,
  AGENT_COMPOSER_HEIGHT_KEY,
  AGENT_COMPOSER_MAX_PX,
  AGENT_COMPOSER_MIN_PX,
  roughTokenEstimateFromChars,
} from './workspace-terminal-constants';
import { WorkspaceComposerSettingsPopover } from './WorkspaceComposerSettingsPopover';

const COORDINATOR_PROVIDER_OPTIONS = [
  { value: 'claude_code', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'codex', label: 'Codex' },
  { value: 'kimi_code', label: 'Kimi' },
  { value: 'local_llm', label: 'Local' },
];

const CLAUDE_AGENT_OPTIONS = [
  { value: 'general-purpose', label: 'general-purpose', hint: 'default' },
  { value: 'Plan', label: 'Plan', hint: 'planning' },
  { value: 'Explore', label: 'Explore', hint: 'haiku' },
  { value: 'superpowers:code-reviewer', label: 'code-reviewer', hint: 'review' },
];

const CLAUDE_THINKING_OPTIONS = [
  { value: 'Default', label: 'Default', hint: 'Claude default' },
  { value: 'Low', label: 'Low', hint: 'faster' },
  { value: 'Medium', label: 'Medium', hint: 'balanced' },
  { value: 'High', label: 'High', hint: 'deeper' },
  { value: 'Extra High', label: 'Extra High', hint: 'xhigh' },
  { value: 'Max', label: 'Max', hint: 'maximum' },
];

const CLAUDE_MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-7[1m]', label: 'Opus 4.7 · 1M context' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6 · 1M context' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

const CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4 (Flagship)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Spark' },
  { value: 'o4-mini', label: 'o4-mini' },
];

const CODEX_REASONING_OPTIONS = [
  { value: 'low', label: 'Low', hint: 'faster response' },
  { value: 'medium', label: 'Medium', hint: 'balanced' },
  { value: 'high', label: 'High', hint: 'deep thinking' },
  { value: 'xhigh', label: 'Extra High', hint: 'maximum reasoning' },
];

const KIMI_MODEL_OPTIONS = [
  { value: 'kimi-for-coding', label: 'Kimi for Coding' },
  { value: 'kimi-k2.6', label: 'Kimi K2.6' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5' },
];

const KIMI_THINKING_OPTIONS = [
  { value: 'default', label: 'Default', hint: 'session default' },
  { value: 'on', label: 'On', hint: 'enable --thinking' },
  { value: 'off', label: 'Off', hint: 'enable --no-thinking' },
];

const OPENAI_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4 (Flagship)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'o4-mini', label: 'o4-mini' },
];

const OPENAI_REASONING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
];

function coordinatorProviderLabel(provider: string): string {
  return COORDINATOR_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

function providerModelOptions(provider: string) {
  if (provider === 'codex') return CODEX_MODEL_OPTIONS;
  if (provider === 'kimi_code') return KIMI_MODEL_OPTIONS;
  if (provider === 'openai') return OPENAI_MODEL_OPTIONS;
  if (provider === 'local_llm') return [] as { value: string; label: string }[];
  return CLAUDE_MODEL_OPTIONS;
}

function providerReasoningOptions(provider: string) {
  if (provider === 'codex') return CODEX_REASONING_OPTIONS;
  if (provider === 'kimi_code') return KIMI_THINKING_OPTIONS;
  if (provider === 'openai') return OPENAI_REASONING_OPTIONS;
  if (provider === 'local_llm') return [] as { value: string; label: string; hint?: string }[];
  return CLAUDE_THINKING_OPTIONS;
}

function compactLabel(model: string, provider?: string) {
  if (provider === 'codex') {
    return CODEX_MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model;
  }
  if (provider === 'kimi_code') {
    return KIMI_MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model;
  }
  return CLAUDE_MODEL_OPTIONS.find((o) => o.value === model)?.label
    ?? model.replace(/^claude-/, '').replace(/-/g, ' ').replace(/\b(opus|sonnet|haiku)\b/i, (m) => m[0].toUpperCase() + m.slice(1));
}

export interface ComposerSettings {
  selectedClaudeAgent: string;
  selectedModel: string;
  selectedTaskMode: string;
  selectedReasoning: string;
  sendBehavior: 'send_now' | 'interrupt_send' | 'queue_send';
  promptMode: 'direct' | 'coordinator';
  coordinatorBrainProvider: string;
  coordinatorCoderProvider: string;
  coordinatorBrainProfileId: string;
  coordinatorCoderProfileId: string;
  coordinatorBrainModel: string;
  coordinatorCoderModel: string;
  coordinatorBrainReasoning: string;
  coordinatorCoderReasoning: string;
  coordinatorAutoStepOnWorkerComplete: boolean;
  coordinatorAutoStepTrigger: 'terminal_completion' | 'any_worker_status';
  coordinatorAutoStepCooldownSeconds: number;
}

interface WorkspaceComposerProps {
  workspaceId: string;
  focusedChatSession: AgentChatSession | null;
  busy: boolean;
  canInterrupt: boolean;
  queuedCount: number;
  promptTemplateWarning: string | null;
  promptTemplates: PromptTemplate[];
  agentContext: WorkspaceAgentContext | null;
  agentProfiles: AgentProfile[];
  coordinatorStatus: WorkspaceCoordinatorStatus | null;
  settings: ComposerSettings;
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  onSend: (text: string) => void;
  onTogglePlanMode: () => void;
  onApplyWorkflowPreset: (preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => void;
  onInterrupt: () => void;
  onStopCoordinator: () => void;
}

export function WorkspaceComposer({
  workspaceId,
  focusedChatSession,
  busy,
  canInterrupt,
  queuedCount,
  promptTemplateWarning,
  promptTemplates,
  agentContext,
  agentProfiles,
  coordinatorStatus,
  settings,
  onSettingsChange,
  onSend,
  onTogglePlanMode,
  onApplyWorkflowPreset,
  onInterrupt,
  onStopCoordinator,
}: WorkspaceComposerProps) {
  const [promptInput, setPromptInput] = useState('');
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const raw = window.localStorage.getItem(AGENT_COMPOSER_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, parsed)) : AGENT_COMPOSER_DEFAULT_PX;
  });
  const [contextPreview, setContextPreview] = useState<WorkspaceContextPreview | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [coordinatorModelsOpen, setCoordinatorModelsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(AGENT_COMPOSER_HEIGHT_KEY, String(composerHeight));
  }, [composerHeight]);

  useEffect(() => {
    const onFocusComposer = () => textareaRef.current?.focus();
    window.addEventListener('forge:focus-composer', onFocusComposer);
    return () => window.removeEventListener('forge:focus-composer', onFocusComposer);
  }, []);

  useEffect(() => {
    const handleTogglePlanMode = () => onTogglePlanMode();
    window.addEventListener('forge:toggle-plan-mode', handleTogglePlanMode);
    return () => window.removeEventListener('forge:toggle-plan-mode', handleTogglePlanMode);
  }, [onTogglePlanMode]);

  const promptMeter = useMemo(() => {
    if (!promptInput.trim()) return null;
    return { sessionEstTokens: roughTokenEstimateFromChars(promptInput.length) };
  }, [promptInput]);

  const workflowOptions = useMemo(() => {
    const builtIns = [
      {
        id: 'preset-plan-act',
        title: 'Plan → Act',
        source: 'Forge workflow',
        body: 'Create a concise implementation plan for this workspace. Do not edit files yet.',
        preset: 'plan-act' as const,
      },
      {
        id: 'preset-plan-codex-review',
        title: 'Plan → Codex → Review',
        source: 'Forge workflow',
        body: 'Plan the implementation. After the plan is accepted, Forge will route implementation/review follow-up.',
        preset: 'plan-codex-review' as const,
      },
      {
        id: 'preset-implement-review-pr',
        title: 'Implement → Review → PR',
        source: 'Forge workflow',
        body: 'Implement the requested change, then summarize changed files, tests, and PR readiness.',
        preset: 'implement-review-pr' as const,
      },
    ];
    return [
      ...builtIns,
      ...promptTemplates.map((template) => ({
        id: `template-${template.id}`,
        title: template.title,
        source: template.source,
        body: template.body,
        preset: null,
      })),
    ];
  }, [promptTemplates]);

  const slashQuery = promptInput.trimStart().startsWith('/')
    ? promptInput.trimStart().slice(1).toLowerCase()
    : null;
  const slashMatches = slashQuery === null
    ? []
    : workflowOptions
      .filter((option) => option.title.toLowerCase().includes(slashQuery))
      .slice(0, 7);

  const startComposerResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const onMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      setComposerHeight(Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, startHeight + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const addRepoContextToPrompt = async () => {
    setContextBusy(true);
    setContextError(null);
    try {
      const preview = await getWorkspaceContextPreview(workspaceId);
      setContextPreview(preview);
      if (!preview.promptContext.trim()) return;
      setPromptInput((current) => {
        if (current.includes('Forge repo context:')) return current;
        const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
        return `${preview.promptContext}${suffix}`;
      });
    } catch (err) {
      setContextError(formatSessionError(err));
    } finally {
      setContextBusy(false);
    }
  };

  const refreshRepoPathMap = async () => {
    setContextBusy(true);
    setContextError(null);
    try {
      const preview = await refreshWorkspaceRepoContext(workspaceId);
      setContextPreview(preview);
    } catch (err) {
      setContextError(formatSessionError(err));
    } finally {
      setContextBusy(false);
    }
  };

  const injectLinkedContext = () => {
    if (!agentContext?.promptPreamble.trim()) return;
    setPromptInput((current) => {
      if (current.includes('Forge linked repository context:')) return current;
      const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
      return `${agentContext.promptPreamble}${suffix}`;
    });
  };

  const handleSend = () => {
    if (!promptInput.trim() || busy) return;
    const text = promptInput.trim();
    setPromptInput('');
    onSend(text);
  };

  const applyPreset = (preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => {
    setPromptInput((current) => current.trimStart().startsWith('/') || !current ? defaultPrompt : current);
    onApplyWorkflowPreset(preset, defaultPrompt);
  };

  const applyWorkflowOption = (option: (typeof workflowOptions)[number]) => {
    if (option.preset) {
      applyPreset(option.preset, option.body);
      return;
    }
    setPromptInput(option.body);
  };

  const provider = focusedChatSession?.provider ?? 'claude_code';
  const providerLabel = provider === 'codex' ? 'Codex' : provider === 'kimi_code' ? 'Kimi' : 'Claude';
  const modelOptions = provider === 'codex'
    ? CODEX_MODEL_OPTIONS
    : provider === 'kimi_code'
      ? KIMI_MODEL_OPTIONS
      : CLAUDE_MODEL_OPTIONS;
  const thinkingOptions = provider === 'codex'
    ? CODEX_REASONING_OPTIONS
    : provider === 'kimi_code'
      ? KIMI_THINKING_OPTIONS
      : CLAUDE_THINKING_OPTIONS;

  const coordinatorWorkerCount = coordinatorStatus?.workers.filter((worker) => worker.status === 'running').length ?? 0;
  const coordinatorProfiles = useMemo(
    () => agentProfilesForCoordinatorPicker(agentProfiles),
    [agentProfiles],
  );
  const coordinatorBrainProviderModelOptions = providerModelOptions(settings.coordinatorBrainProvider);
  const coordinatorCoderProviderModelOptions = providerModelOptions(settings.coordinatorCoderProvider);
  const coordinatorBrainProviderReasoningOptions = providerReasoningOptions(settings.coordinatorBrainProvider);
  const coordinatorCoderProviderReasoningOptions = providerReasoningOptions(settings.coordinatorCoderProvider);
  const latestPlannerDiagnostic = coordinatorStatus?.plannerLastMessage
    ?? coordinatorStatus?.recentActions.find((action) => action.actionKind === 'planner')?.message
    ?? null;

  return (
    <div className="shrink-0 border-t border-forge-border bg-forge-surface" style={{ height: `${composerHeight}px` }}>
      <div
        role="separator"
        aria-label="Resize message panel"
        onMouseDown={startComposerResize}
        className="h-1 cursor-row-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
      />
      <div className="flex h-[calc(100%-4px)] min-h-0 flex-col gap-2 overflow-hidden p-2">
        <div className="shrink-0 flex items-center gap-2 overflow-x-auto">
          <div className="flex shrink-0 items-center gap-1 rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-muted">
            <span className="text-forge-dim">Mode</span>
            <Select value={settings.promptMode} onValueChange={(value) => onSettingsChange({ promptMode: value as ComposerSettings['promptMode'] })}>
              <SelectTrigger compact className={settings.promptMode === 'coordinator' ? 'text-forge-orange' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="coordinator">Coordinator</SelectItem>
              </SelectContent>
            </Select>
            {settings.promptMode === 'coordinator' && (
              <>
                <span>·</span>
                <Select
                  value={settings.coordinatorBrainProvider}
                  onValueChange={(value) => onSettingsChange({ coordinatorBrainProvider: value, coordinatorBrainProfileId: '' })}
                >
                  <SelectTrigger compact title="Coordinator brain provider"><SelectValue placeholder="Brain provider" /></SelectTrigger>
                  <SelectContent>
                    {COORDINATOR_PROVIDER_OPTIONS.map((providerOption) => (
                      <SelectItem key={`composer-brain-provider-${providerOption.value}`} value={providerOption.value}>{providerOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>→</span>
                <Select
                  value={settings.coordinatorCoderProvider}
                  onValueChange={(value) => onSettingsChange({ coordinatorCoderProvider: value, coordinatorCoderProfileId: '' })}
                >
                  <SelectTrigger compact title="Coordinator coder provider"><SelectValue placeholder="Coder provider" /></SelectTrigger>
                  <SelectContent>
                    {COORDINATOR_PROVIDER_OPTIONS.map((providerOption) => (
                      <SelectItem key={`composer-coder-provider-${providerOption.value}`} value={providerOption.value}>{providerOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="rounded border border-forge-blue/30 bg-forge-blue/10 px-1.5 py-0.5 text-[10px] text-forge-blue">
                  brain {coordinatorProviderLabel(settings.coordinatorBrainProvider)}
                </span>
                <span className="rounded border border-forge-violet/30 bg-forge-violet/10 px-1.5 py-0.5 text-[10px] text-forge-violet">
                  coder {coordinatorProviderLabel(settings.coordinatorCoderProvider)}
                </span>
                <Popover open={coordinatorModelsOpen} onOpenChange={setCoordinatorModelsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="rounded border border-forge-border bg-black/10 px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-white/10"
                      title="Coordinator provider model settings"
                    >
                      Models
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[420px] max-w-[calc(100vw-24px)]">
                    <p className="mb-2 text-xs font-semibold text-forge-text">Coordinator models & overrides</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded border border-forge-border/70 bg-black/10 p-2">
                        <p className="mb-2 text-[11px] font-semibold text-forge-text">Brain ({coordinatorProviderLabel(settings.coordinatorBrainProvider)})</p>
                        <label className="mb-1 block text-[10px] uppercase tracking-widest text-forge-muted">Model</label>
                        <Select value={settings.coordinatorBrainModel || '__default__'} onValueChange={(value) => onSettingsChange({ coordinatorBrainModel: value === '__default__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Default model" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Default model</SelectItem>
                            {coordinatorBrainProviderModelOptions.map((option) => (
                              <SelectItem key={`coord-brain-model-${option.value}`} value={option.value}>{option.label}</SelectItem>
                            ))}
                            {settings.coordinatorBrainModel && !coordinatorBrainProviderModelOptions.some((option) => option.value === settings.coordinatorBrainModel) && (
                              <SelectItem value={settings.coordinatorBrainModel}>{settings.coordinatorBrainModel}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <label className="mb-1 mt-2 block text-[10px] uppercase tracking-widest text-forge-muted">Reasoning</label>
                        <Select value={settings.coordinatorBrainReasoning || '__default__'} onValueChange={(value) => onSettingsChange({ coordinatorBrainReasoning: value === '__default__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Default reasoning" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Default reasoning</SelectItem>
                            {coordinatorBrainProviderReasoningOptions.map((option) => (
                              <SelectItem key={`coord-brain-reasoning-${option.value}`} value={option.value}>{option.label}</SelectItem>
                            ))}
                            {settings.coordinatorBrainReasoning && !coordinatorBrainProviderReasoningOptions.some((option) => option.value === settings.coordinatorBrainReasoning) && (
                              <SelectItem value={settings.coordinatorBrainReasoning}>{settings.coordinatorBrainReasoning}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <label className="mb-1 mt-2 block text-[10px] uppercase tracking-widest text-forge-muted">Advanced profile override</label>
                        <Select value={settings.coordinatorBrainProfileId || '__none__'} onValueChange={(value) => onSettingsChange({ coordinatorBrainProfileId: value === '__none__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="None (provider default)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None (provider default)</SelectItem>
                            {coordinatorProfiles.map((profile) => (
                              <SelectItem key={`coord-brain-profile-${profile.id}`} value={profile.id}>{profile.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded border border-forge-border/70 bg-black/10 p-2">
                        <p className="mb-2 text-[11px] font-semibold text-forge-text">Coder ({coordinatorProviderLabel(settings.coordinatorCoderProvider)})</p>
                        <label className="mb-1 block text-[10px] uppercase tracking-widest text-forge-muted">Model</label>
                        <Select value={settings.coordinatorCoderModel || '__default__'} onValueChange={(value) => onSettingsChange({ coordinatorCoderModel: value === '__default__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Default model" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Default model</SelectItem>
                            {coordinatorCoderProviderModelOptions.map((option) => (
                              <SelectItem key={`coord-coder-model-${option.value}`} value={option.value}>{option.label}</SelectItem>
                            ))}
                            {settings.coordinatorCoderModel && !coordinatorCoderProviderModelOptions.some((option) => option.value === settings.coordinatorCoderModel) && (
                              <SelectItem value={settings.coordinatorCoderModel}>{settings.coordinatorCoderModel}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <label className="mb-1 mt-2 block text-[10px] uppercase tracking-widest text-forge-muted">Reasoning</label>
                        <Select value={settings.coordinatorCoderReasoning || '__default__'} onValueChange={(value) => onSettingsChange({ coordinatorCoderReasoning: value === '__default__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Default reasoning" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Default reasoning</SelectItem>
                            {coordinatorCoderProviderReasoningOptions.map((option) => (
                              <SelectItem key={`coord-coder-reasoning-${option.value}`} value={option.value}>{option.label}</SelectItem>
                            ))}
                            {settings.coordinatorCoderReasoning && !coordinatorCoderProviderReasoningOptions.some((option) => option.value === settings.coordinatorCoderReasoning) && (
                              <SelectItem value={settings.coordinatorCoderReasoning}>{settings.coordinatorCoderReasoning}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <label className="mb-1 mt-2 block text-[10px] uppercase tracking-widest text-forge-muted">Advanced profile override</label>
                        <Select value={settings.coordinatorCoderProfileId || '__none__'} onValueChange={(value) => onSettingsChange({ coordinatorCoderProfileId: value === '__none__' ? '' : value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="None (provider default)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None (provider default)</SelectItem>
                            {coordinatorProfiles.map((profile) => (
                              <SelectItem key={`coord-coder-profile-${profile.id}`} value={profile.id}>{profile.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-forge-muted">Built-in providers are always available. Profile override is optional.</p>
                  </PopoverContent>
                </Popover>
                <span>·</span>
                <span className={coordinatorStatus?.activeRun ? 'text-forge-orange' : 'text-forge-muted'}>
                  {coordinatorStatus?.activeRun ? `running (${coordinatorWorkerCount} workers)` : 'idle'}
                </span>
                <button
                  type="button"
                  onClick={() => onSettingsChange({ coordinatorAutoStepOnWorkerComplete: !settings.coordinatorAutoStepOnWorkerComplete })}
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${
                    settings.coordinatorAutoStepOnWorkerComplete
                      ? 'border-forge-green/30 bg-forge-green/10 text-forge-green'
                      : 'border-forge-border bg-black/10 text-forge-muted'
                  }`}
                  title="Automatically run a coordinator step when a worker completes"
                >
                  Auto-step {settings.coordinatorAutoStepOnWorkerComplete ? 'on' : 'off'}
                </button>
                {settings.coordinatorAutoStepOnWorkerComplete && (
                  <>
                    <Select
                      value={settings.coordinatorAutoStepTrigger}
                      onValueChange={(value) => onSettingsChange({ coordinatorAutoStepTrigger: value as ComposerSettings['coordinatorAutoStepTrigger'] })}
                    >
                      <SelectTrigger compact title="Auto-step trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="terminal_completion">on complete</SelectItem>
                        <SelectItem value="any_worker_status">on any update</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(settings.coordinatorAutoStepCooldownSeconds)}
                      onValueChange={(value) => {
                        const next = Number.parseInt(value, 10);
                        onSettingsChange({
                          coordinatorAutoStepCooldownSeconds: Number.isFinite(next) ? next : 3,
                        });
                      }}
                    >
                      <SelectTrigger compact title="Auto-step cooldown"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0s</SelectItem>
                        <SelectItem value="3">3s</SelectItem>
                        <SelectItem value="5">5s</SelectItem>
                        <SelectItem value="10">10s</SelectItem>
                        <SelectItem value="20">20s</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                {latestPlannerDiagnostic && (
                  <>
                    <span>·</span>
                    <span className="max-w-[280px] truncate text-forge-dim" title={latestPlannerDiagnostic}>
                      {latestPlannerDiagnostic}
                    </span>
                  </>
                )}
                {coordinatorStatus?.activeRun && (
                  <button
                    type="button"
                    onClick={onStopCoordinator}
                    className="rounded border border-forge-yellow/30 bg-forge-yellow/10 px-1.5 py-0.5 text-[10px] text-forge-yellow hover:bg-forge-yellow/20"
                    title="Stop active coordinator run"
                  >
                    Stop
                  </button>
                )}
              </>
            )}
          </div>

          {focusedChatSession && (
            <div className="flex shrink-0 items-center gap-1 rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-muted">
              {(provider === 'claude_code' || provider === 'codex' || provider === 'kimi_code') && (
                <>
                  <button
                    onClick={onTogglePlanMode}
                    title="Toggle Plan mode (Shift+Tab)"
                    className={`flex items-center gap-1 rounded px-1 py-0.5 transition-colors ${settings.selectedTaskMode === 'Plan' ? 'text-forge-blue' : 'text-forge-muted/40 hover:text-forge-muted'}`}
                  >
                    <ListChecks className="h-3 w-3" />
                    {settings.selectedTaskMode === 'Plan' && <span className="font-semibold">Plan</span>}
                  </button>
                  <span>·</span>
                </>
              )}
              <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
                <SelectTrigger compact title={`${providerLabel} model`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>{compactLabel(model.value, provider)}</SelectItem>
                  ))}
                  {!modelOptions.some((m) => m.value === settings.selectedModel) && (
                    <SelectItem value={settings.selectedModel}>{compactLabel(settings.selectedModel, provider)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <span>·</span>
              <Select
                value={settings.selectedReasoning}
                onValueChange={(v) => onSettingsChange({ selectedReasoning: v })}
              >
                <SelectTrigger
                  compact
                  title={`${providerLabel} thinking / effort`}
                  className={settings.selectedReasoning === 'Default' || settings.selectedReasoning === 'default' || settings.selectedReasoning === 'medium' ? 'text-forge-muted' : settings.selectedReasoning === 'Max' || settings.selectedReasoning === 'Extra High' || settings.selectedReasoning === 'high' || settings.selectedReasoning === 'on' ? 'bg-forge-violet/15 text-forge-violet' : 'bg-forge-blue/10 text-forge-blue'}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {thinkingOptions.map((level) => (
                    <SelectItem key={level.value} value={level.value}>{provider === 'codex' ? '' : 'Thinking: '}{level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {promptMeter && (
                <>
                  <span>·</span>
                  <span className="text-forge-dim">{promptMeter.sessionEstTokens.toLocaleString()} tok</span>
                </>
              )}
              {contextPreview && (
                <>
                  <span>·</span>
                  <span className={contextPreview.status === 'fresh' ? 'text-forge-green' : 'text-forge-yellow'}>
                    repo {contextPreview.status}
                  </span>
                </>
              )}
            </div>
          )}

          <WorkspaceComposerSettingsPopover
            provider={provider}
            providerLabel={providerLabel}
            settings={settings}
            onSettingsChange={onSettingsChange}
            onApplyPreset={applyPreset}
            onAddRepoContext={() => void addRepoContextToPrompt()}
            onRefreshRepoPathMap={() => void refreshRepoPathMap()}
            contextBusy={contextBusy}
            contextError={contextError}
            modelOptions={modelOptions}
            thinkingOptions={thinkingOptions}
            claudeAgentOptions={CLAUDE_AGENT_OPTIONS}
          />

          {!!agentContext?.linkedWorktrees.length && (
            <button onClick={injectLinkedContext} className="max-w-[220px] truncate rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-xs font-semibold text-forge-blue hover:bg-forge-blue/15" title={agentContext.linkedWorktrees.map((item) => item.path).join('\n')}>
              <Link2 className="inline h-3 w-3" /> Insert linked context ({agentContext.linkedWorktrees.length})
            </button>
          )}
          {contextPreview && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex shrink-0 items-center gap-1 rounded border border-forge-border/50 bg-forge-bg px-2 py-1 text-xs text-forge-muted hover:bg-white/5">
                  <span className={contextPreview.status === 'fresh' ? 'text-forge-green' : 'text-forge-yellow'}>@</span>
                  {contextPreview.items.filter((i) => i.included).length} files · {contextPreview.status}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-w-sm">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold uppercase tracking-widest text-forge-text">Repo context</span>
                  <span className={`rounded-full border px-1.5 py-0.5 ${contextPreview.status === 'fresh' ? 'border-forge-green/25 bg-forge-green/10 text-forge-green' : 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'}`}>
                    {contextPreview.status}
                  </span>
                  <span className="text-forge-muted">{contextPreview.defaultBranch}@{contextPreview.commitHash.slice(0, 8)}</span>
                  <span className="text-forge-muted">
                    {contextPreview.maxChars === 0
                      ? <>{contextPreview.approxChars.toLocaleString()} chars · ~{roughTokenEstimateFromChars(contextPreview.approxChars).toLocaleString()} tok</>
                      : <>{contextPreview.approxChars.toLocaleString()} / {contextPreview.maxChars.toLocaleString()} chars</>
                    }
                  </span>
                  {contextPreview.trimmed && <span className="text-forge-yellow">trimmed</span>}
                </div>
                {contextPreview.warning && <div className="mb-1.5 text-xs text-forge-yellow">{contextPreview.warning}</div>}
                <div className="flex flex-wrap gap-1">
                  {contextPreview.items.slice(0, 18).map((item, index) => (
                    <span
                      key={`${item.kind}-${item.path ?? item.label}-${index}`}
                      title={`${item.path ?? item.label} · ${item.chars.toLocaleString()} chars${item.trimmed ? ' · trimmed' : ''}`}
                      className={`max-w-[220px] truncate rounded border px-1.5 py-0.5 text-xs ${item.included ? 'border-forge-blue/20 bg-forge-blue/10 text-forge-blue' : 'border-forge-border bg-white/5 text-forge-muted line-through'}`}
                    >
                      {item.label}{item.trimmed ? ' …' : ''}
                    </span>
                  ))}
                  {contextPreview.items.length > 18 && (
                    <span className="rounded border border-forge-border bg-white/5 px-1.5 py-0.5 text-xs">+{contextPreview.items.length - 18} more</span>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {promptTemplateWarning && (
            <span className="text-xs text-forge-yellow">{promptTemplateWarning}</span>
          )}
          <span className="text-xs text-forge-muted">Type <span className="font-mono text-forge-text/80">/</span> for workflows (e.g. <span className="font-mono text-forge-text/80">/plan-act</span>)</span>
        </div>

        {slashMatches.length > 0 && (
          <div className="shrink-0 rounded-lg border border-forge-border bg-forge-card/95 p-1 shadow-xl">
            <div className="mb-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-forge-muted">
              Workflows & prompt templates
            </div>
            <div className="grid gap-1">
              {slashMatches.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyWorkflowOption(option)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-forge-text">{option.title}</span>
                    <span className="block truncate text-[10px] text-forge-muted">{option.source}</span>
                  </span>
                  <span className="shrink-0 rounded border border-forge-border/70 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-forge-muted">
                    /{option.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-2">
          <textarea
            ref={textareaRef}
            data-forge-composer="true"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            rows={5}
            placeholder={
              settings.sendBehavior === 'interrupt_send'
                ? 'Send instruction to agent (Enter interrupts agent if needed then sends, Shift+Enter for newline)…'
                : 'Send instruction to agent (Enter to send, Shift+Enter for newline)…'
            }
            className="h-full min-h-0 w-0 flex-1 resize-none overflow-y-auto rounded-chat border border-forge-border bg-forge-bg px-3 py-2 text-sm leading-relaxed text-forge-text placeholder:text-forge-muted focus:border-forge-green/40 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.currentTarget.blur(); return; }
              if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onTogglePlanMode(); return; }
              if (e.key !== 'Enter' || e.shiftKey) return;
              if ('isComposing' in e.nativeEvent && e.nativeEvent.isComposing) return;
              e.preventDefault();
              handleSend();
            }}
          />
          <div className="flex flex-col gap-1.5">
            {canInterrupt && (
              <button
                type="button"
                onClick={onInterrupt}
                className="rounded-btn border border-forge-yellow/30 bg-forge-yellow/10 px-3 py-2 text-xs font-semibold text-forge-yellow hover:bg-forge-yellow/20"
                title="Interrupt the running agent turn"
              >
                Interrupt
              </button>
            )}
            <button
              disabled={busy || !promptInput.trim()}
              onClick={handleSend}
              className="rounded-btn border border-forge-green/30 bg-forge-green/5 px-3 py-2 text-sm font-semibold text-forge-green/80 hover:bg-forge-green/10 disabled:opacity-50"
              title={settings.sendBehavior === 'interrupt_send' ? 'Interrupt then send (same as Enter)' : 'Send now (same as Enter)'}
            >
              <Zap className="inline h-3.5 w-3.5" /> Send
            </button>
            {queuedCount > 0 && (
              <div className="rounded-btn border border-forge-border/60 bg-black/20 px-2 py-1 text-center text-[11px] text-forge-muted">
                {queuedCount} queued
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
