import type { TerminalOutputChunk, TerminalProfile } from '../../types';

export type OutputMap = Record<string, TerminalOutputChunk[]>;

export const PROFILE_LABELS: Record<TerminalProfile, string> = {
  shell: 'Shell',
  codex: 'Codex',
  claude_code: 'Claude',
};

export const OUTPUT_RETENTION_CHUNKS = 1200;

export const AGENT_COMPOSER_HEIGHT_KEY = 'forge:agent-composer-height';
export const AGENT_COMPOSER_DEFAULT_PX = 228;
export const AGENT_COMPOSER_MIN_PX = 140;
export const AGENT_COMPOSER_MAX_PX = 420;

/** Rough token estimate from string length (~4 chars per token); not provider-reported usage. */
export function roughTokenEstimateFromChars(charCount: number): number {
  return Math.max(1, Math.ceil(charCount / 4));
}
