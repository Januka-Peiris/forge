import { ChevronDown, Terminal as TerminalIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import type { AgentProfile } from '../../types';
import type { AgentProviderId } from '../../lib/active-agent-providers';

interface WorkspaceTerminalEmptyStateProps {
  busy: boolean;
  localAgentProfiles: AgentProfile[];
  activeProviderIds: ReadonlySet<AgentProviderId>;
  onStartClaude: () => void;
  onStartCodex: () => void;
  onStartKimi: () => void;
  onStartLocalProfile: (profile: AgentProfile) => void;
  onStartShell: () => void;
}

export function WorkspaceTerminalEmptyState({
  busy,
  localAgentProfiles,
  activeProviderIds,
  onStartClaude,
  onStartCodex,
  onStartKimi,
  onStartLocalProfile,
  onStartShell,
}: WorkspaceTerminalEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-forge-border bg-forge-bg p-8 text-center">
      <div className="max-w-md">
        <TerminalIcon className="mx-auto mb-3 h-9 w-9 text-forge-muted" />
        <h2 className="text-base font-bold text-forge-text">Start a workspace terminal</h2>
        <p className="mt-1 text-sm leading-relaxed text-forge-muted">Launch agents, shells, and dev servers for this workspace.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {activeProviderIds.has('claude_code') && (
            <button disabled={busy} onClick={onStartClaude} className="rounded-lg bg-forge-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Start Claude</button>
          )}
          {activeProviderIds.has('codex') && (
            <button disabled={busy} onClick={onStartCodex} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">Start Codex</button>
          )}
          {activeProviderIds.has('kimi_code') && (
            <button disabled={busy} onClick={onStartKimi} className="rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">Start Kimi</button>
          )}
          {activeProviderIds.size === 0 && (
            <p className="basis-full rounded-lg border border-forge-border/70 bg-black/10 p-3 text-sm text-forge-muted">
              No active agent providers. Enable one in Settings → Agent Setup, or start a shell below.
            </p>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-forge-border bg-white/5 px-3 py-2 text-sm font-semibold text-forge-text disabled:opacity-50">
                More options
                <ChevronDown className="h-3.5 w-3.5 text-forge-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {localAgentProfiles.map((profile) => (
                <DropdownMenuItem key={profile.id} disabled={busy} onSelect={() => onStartLocalProfile(profile)}>
                  Start {profile.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem disabled={busy} onSelect={onStartShell}>
                New Shell
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
