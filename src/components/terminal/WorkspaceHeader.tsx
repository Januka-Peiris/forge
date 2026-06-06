import {
  Box,
  ChevronRight,
  Copy,
  ExternalLink,
  GitBranch,
  HelpCircle,
  Layout,
  MoreHorizontal,
  PlugZap,
  Square,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type {
  AgentProfile,
  TerminalProfile,
  TerminalSession,
  Workspace,
} from '../../types';
import { PROFILE_LABELS } from './workspace-terminal-constants';
import { isAgentProfileActive, type AgentProviderId } from '../../lib/active-agent-providers';

interface WorkspaceHeaderProps {
  workspace: Workspace;
  visibleSessions: TerminalSession[];
  dockOverflowSessions: TerminalSession[];
  busy: boolean;
  error: string | null;
  focusedSession: TerminalSession | null;
  agentProfiles: AgentProfile[];
  activeProviderIds: ReadonlySet<AgentProviderId>;
  onOpenInCursor?: () => void;
  onCreateTerminal: (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => void;
  onCopyFocusedOutput: () => void;
  onInterruptFocusedAgent: () => void;
  onCloseTerminal: (sessionId: string) => void;
  onAttachTerminal: (session: TerminalSession) => void;
  onSetError: (message: string) => void;
}

export function WorkspaceHeader({
  workspace,
  visibleSessions,
  dockOverflowSessions,
  busy,
  error,
  focusedSession,
  agentProfiles,
  activeProviderIds,
  onOpenInCursor,
  onCreateTerminal,
  onCopyFocusedOutput,
  onInterruptFocusedAgent,
  onCloseTerminal,
  onAttachTerminal,
  onSetError,
}: WorkspaceHeaderProps) {
  const localAgentProfiles = agentProfiles.filter((profile) => profile.local && profile.agent !== 'shell' && isAgentProfileActive(profile, activeProviderIds));

  return (
    <div className="shrink-0 border-b border-mn-border bg-mn-bg/95 backdrop-blur-md">
      <div className="flex h-11 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <Box className="h-3.5 w-3.5 shrink-0 text-mn-muted" />
            <span className="truncate font-bold text-mn-text">{workspace.repo}</span>
          </div>

          <ChevronRight className="h-3 w-3 shrink-0 text-mn-dim" />

          <div className="flex min-w-0 shrink items-center gap-1">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-mn-muted" />
            <span className="truncate font-mono text-mn-text/80">{workspace.branch}</span>
          </div>

          <span className="shrink-0 text-mn-border/40">/</span>

          <h1 className="shrink-0 truncate font-bold text-mn-cyan">{workspace.name}</h1>

          {workspace.currentTask.trim() && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-mn-dim" />
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-mn-muted">
                <Layout className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium text-mn-cyan/90">{workspace.currentTask}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-7 w-7 text-mn-muted hover:text-mn-text"
                title="Coordinator and Orchestrator guidance"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-24px)]">
              <p className="text-xs font-bold uppercase tracking-widest text-mn-muted">How to use Mnemonic modes</p>
              <div className="mt-2 space-y-2 text-xs leading-relaxed">
                <div>
                  <p className="font-semibold text-mn-text">Direct agent mode</p>
                  <p className="text-mn-muted">Best for focused edits, debugging, and quick iterations in a single chat or terminal tab.</p>
                </div>
                <div>
                  <p className="font-semibold text-mn-text">Coordinator mode</p>
                  <p className="text-mn-muted">Use when work needs planning + delegation. A brain profile decides next steps, coder workers execute, and timeline cards summarize review-ready outcomes.</p>
                </div>
                <div>
                  <p className="font-semibold text-mn-text">Orchestrator</p>
                  <p className="text-mn-muted">Background app-level automation that watches workspace state and can trigger follow-up coordination/checks. Use for continuous flow across multiple workspaces.</p>
                </div>
                <div className="rounded border border-mn-border/60 bg-black/10 px-2 py-1 text-[11px] text-mn-dim">
                  Tip: Start with Direct for small tasks, Coordinator for multi-step goals, and Orchestrator for ongoing automation.
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {activeProviderIds.has('claude_code') && (
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() => onCreateTerminal('agent', 'claude_code', 'Claude')}
              className="h-7 px-2 text-[11px] border-mn-cyan/20 text-mn-cyan hover:bg-mn-cyan/5"
            >
              <span className="hidden sm:inline">New Claude</span>
              <span className="sm:hidden">+ Claude</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="h-7 w-7 text-mn-muted hover:text-mn-text">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateTerminal('shell', 'shell', 'Shell')}>
                New shell tab
              </DropdownMenuItem>
              {activeProviderIds.has('codex') && (
                <DropdownMenuItem disabled={busy} onSelect={() => onCreateTerminal('agent', 'codex', 'Codex')}>
                  New Codex tab
                </DropdownMenuItem>
              )}
              {localAgentProfiles.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Other agents</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {localAgentProfiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        disabled={busy}
                        onSelect={() => onCreateTerminal('agent', profile.agent as TerminalProfile, profile.label, profile.id)}
                      >
                        New {profile.label} tab
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!focusedSession} onSelect={onCopyFocusedOutput}>
                <Copy className="h-3.5 w-3.5" /> Copy output
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy || !focusedSession}
                onSelect={onInterruptFocusedAgent}
                title="Sends interrupt (e.g. Ctrl+C) to the focused terminal tab"
              >
                <Square className="h-3.5 w-3.5 text-mn-yellow" /> Interrupt terminal
              </DropdownMenuItem>
              {onOpenInCursor && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-mn-blue focus:text-mn-blue"
                    onSelect={() => {
                      try {
                        onOpenInCursor();
                      } catch (err) {
                        onSetError(String(err));
                      }
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Cursor
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {visibleSessions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5 bg-black/5">
          {visibleSessions.map((session) => {
            const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
            const active = focusedSession?.id === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onAttachTerminal(session)}
                className={`group flex max-w-[200px] shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-left transition-all ${active ? 'bg-white/10 text-mn-text ring-1 ring-white/20' : 'text-mn-muted hover:bg-white/5 hover:text-mn-text/85'}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.status === 'running' ? 'bg-mn-blue animate-pulse' : 'bg-mn-muted/50'}`} />
                <span className="truncate text-[11px] font-bold">{title}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTerminal(session.id);
                  }}
                  className="rounded p-0.5 text-mn-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-mn-text"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-mn-red/20 bg-mn-red/10 px-3 py-2 text-sm text-mn-red">
          <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {dockOverflowSessions.length > 0 && (
        <div className="mx-4 mt-2 mb-2 flex gap-2 overflow-x-auto pb-1">
          {dockOverflowSessions.slice(0, 12).map((session) => (
            <button
              key={session.id}
              onClick={() => onAttachTerminal(session)}
              className="shrink-0 rounded border border-mn-border bg-white/5 px-2 py-1 text-xs text-mn-muted hover:bg-white/10"
            >
              {session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile} · {session.status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
