import { Terminal as TerminalIcon } from 'lucide-react';
import type { AgentProviderId } from '../../lib/active-agent-providers';

interface WorkspaceTerminalEmptyStateProps {
  busy: boolean;
  activeProviderIds: ReadonlySet<AgentProviderId>;
  onStartClaude: () => void;
  onStartCodex: () => void;
  onStartShell: () => void;
}

export function WorkspaceTerminalEmptyState({
  busy,
  activeProviderIds,
  onStartClaude,
  onStartCodex,
  onStartShell,
}: WorkspaceTerminalEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-mn-border bg-mn-bg p-8 text-center">
      <div className="max-w-md">
        <TerminalIcon className="mx-auto mb-3 h-9 w-9 text-mn-muted" />
        <h2 className="text-base font-bold text-mn-text">Start a workspace terminal</h2>
        <p className="mt-1 text-sm leading-relaxed text-mn-muted">Launch agents, shells, and dev servers for this workspace.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {activeProviderIds.has('claude_code') && (
            <button disabled={busy} onClick={onStartClaude} className="rounded-lg bg-mn-cyan px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Start Claude</button>
          )}
          {activeProviderIds.has('codex') && (
            <button disabled={busy} onClick={onStartCodex} className="rounded-lg border border-mn-border bg-white/5 px-3 py-2 text-sm font-semibold text-mn-text disabled:opacity-50">Start Codex</button>
          )}
          {activeProviderIds.size === 0 && (
            <p className="basis-full rounded-lg border border-mn-border/70 bg-black/10 p-3 text-sm text-mn-muted">
              No active agent providers. Enable one in Settings → Agent Setup, or start a shell below.
            </p>
          )}
          
          <button disabled={busy} onClick={onStartShell} className="rounded-lg border border-mn-border bg-white/5 px-3 py-2 text-sm font-semibold text-mn-text disabled:opacity-50">New Shell</button>
        </div>
      </div>
    </div>
  );
}
