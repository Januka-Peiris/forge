import type { TerminalOutputChunk, TerminalProfile } from '../../types';

export type OutputMap = Record<string, TerminalOutputChunk[]>;

export const PROFILE_LABELS: Record<TerminalProfile, string> = {
  shell: 'Shell',
  codex: 'Codex',
  claude_code: 'Claude',
};

export const OUTPUT_RETENTION_CHUNKS = 5000;

export const RAW_TERMINAL_MODE_KEY = 'mn:raw-terminal-mode';
export const AGENT_COMPOSER_HEIGHT_KEY = 'mn:agent-composer-height';
export const AGENT_COMPOSER_SETTINGS_KEY = 'mn:agent-composer-settings';
export const AGENT_COMPOSER_DEFAULT_PX = 160;
export const AGENT_COMPOSER_MIN_PX = 120;
export const AGENT_COMPOSER_MAX_PX = 420;

/** Rough token estimate from string length (~4 chars per token); not provider-reported usage. */
export function roughTokenEstimateFromChars(charCount: number): number {
  return Math.max(1, Math.ceil(charCount / 4));
}

/**
 * Canned prompt injected into a live agent session by the header Create PR
 * button. The agent has full context of what it just changed, so it writes a
 * far better commit message and PR body than the deterministic fallback.
 */
export const SHIP_PR_PROMPT = `Ship the current work as a pull request:
1. Check git status and the diff to see what changed.
2. Commit everything with a clear, conventional commit message (multiple commits only if clearly warranted).
3. Push this branch to origin.
4. Open a PR against the default branch with gh pr create — concise title, body with Summary, Key changes, and Testing notes based on what actually changed. If a PR already exists for this branch, just push and note it.
5. Print the PR URL when done.`;
