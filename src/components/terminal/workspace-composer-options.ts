export type ComposerModelOption = { value: string; label: string };
export type ComposerReasoningOption = { value: string; label: string; hint?: string };

export const CLAUDE_THINKING_OPTIONS: ComposerReasoningOption[] = [
  { value: 'Default', label: 'Default', hint: 'Claude default' },
  { value: 'Low', label: 'Low', hint: 'faster' },
  { value: 'Medium', label: 'Medium', hint: 'balanced' },
  { value: 'High', label: 'High', hint: 'deeper' },
  { value: 'Extra High', label: 'Extra High', hint: 'xhigh' },
  { value: 'Max', label: 'Max', hint: 'maximum' },
];

export const CLAUDE_MODEL_OPTIONS: ComposerModelOption[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-opus-4-8[1m]', label: 'Opus 4.8 · 1M context' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-7[1m]', label: 'Opus 4.7 · 1M context' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6 · 1M context' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

export const CODEX_MODEL_OPTIONS: ComposerModelOption[] = [
  { value: 'gpt-5.4', label: 'GPT-5.4 (Flagship)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Spark' },
  { value: 'o4-mini', label: 'o4-mini' },
];

export const CODEX_REASONING_OPTIONS: ComposerReasoningOption[] = [
  { value: 'low', label: 'Low', hint: 'faster response' },
  { value: 'medium', label: 'Medium', hint: 'balanced' },
  { value: 'high', label: 'High', hint: 'deep thinking' },
  { value: 'xhigh', label: 'Extra High', hint: 'maximum reasoning' },
];

export const OPENAI_MODEL_OPTIONS: ComposerModelOption[] = [
  { value: 'gpt-5.4', label: 'GPT-5.4 (Flagship)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'o4-mini', label: 'o4-mini' },
];

export const OPENAI_REASONING_OPTIONS: ComposerReasoningOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
];

export function providerModelOptions(provider: string): ComposerModelOption[] {
  if (provider === 'codex') return CODEX_MODEL_OPTIONS;
  if (provider === 'openai') return OPENAI_MODEL_OPTIONS;
  return CLAUDE_MODEL_OPTIONS;
}

export function providerReasoningOptions(provider: string): ComposerReasoningOption[] {
  if (provider === 'codex') return CODEX_REASONING_OPTIONS;
  if (provider === 'openai') return OPENAI_REASONING_OPTIONS;
  return CLAUDE_THINKING_OPTIONS;
}

const CLAUDE_EFFORT_BY_REASONING: Record<string, string> = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  'Extra High': 'xhigh',
  Max: 'max',
};

/**
 * CLI args for launching a new Claude Code session that reflect the composer
 * selections: --model, --effort, and real plan mode via --permission-mode.
 * Only used at session spawn; running sessions keep their launch settings.
 */
export function claudeLaunchExtraArgs(settings: {
  selectedModel: string;
  selectedReasoning: string;
  selectedTaskMode: string;
}): string[] | undefined {
  const args: string[] = [];
  if (settings.selectedModel.trim()) {
    args.push('--model', settings.selectedModel.trim());
  }
  const effort = CLAUDE_EFFORT_BY_REASONING[settings.selectedReasoning];
  if (effort) {
    args.push('--effort', effort);
  }
  if (settings.selectedTaskMode === 'Plan') {
    args.push('--permission-mode', 'plan');
  }
  return args.length > 0 ? args : undefined;
}

export function isKnownComposerModel(model: string): boolean {
  return [
    ...CLAUDE_MODEL_OPTIONS,
    ...CODEX_MODEL_OPTIONS,
    ...OPENAI_MODEL_OPTIONS,
  ].some((option) => option.value === model);
}

export function directProviderLabel(provider: string): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'openai') return 'OpenAI';
  return 'Claude';
}
