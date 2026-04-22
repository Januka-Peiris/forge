import {
  Box,
  ChevronRight,
  Copy,
  ExternalLink,
  GitBranch,
  Layout,
  MoreHorizontal,
  PlugZap,
  Square,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
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
import type { AgentChatSession } from '../../types/agent-chat';
import { PROFILE_LABELS } from './workspace-terminal-constants';

interface WorkspaceHeaderProps {
  workspace: Workspace;
  visibleSessions: TerminalSession[];
  chatSessions: AgentChatSession[];
  dockOverflowSessions: TerminalSession[];
  busy: boolean;
  error: string | null;
  focusedSession: TerminalSession | null;
  focusedChatId: string | null;
  agentProfiles: AgentProfile[];
  onOpenInCursor?: () => void;
  onCreateChatSession: (provider: 'claude_code' | 'codex' | 'kimi_code' | 'local_llm', title?: string) => void;
  onCreateTerminal: (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => void;
  onCopyFocusedOutput: () => void;
  onInterruptFocusedAgent: () => void;
  onCloseTerminal: (sessionId: string) => void;
  onCloseChatSession: (sessionId: string) => void;
  onAttachTerminal: (session: TerminalSession) => void;
  onAttachChatSession: (sessionId: string) => void;
  onSetError: (message: string) => void;
}

export function WorkspaceHeader({
  workspace,
  visibleSessions,
  chatSessions,
  dockOverflowSessions,
  busy,
  error,
  focusedSession,
  focusedChatId,
  agentProfiles,
  onOpenInCursor,
  onCreateChatSession,
  onCreateTerminal,
  onCopyFocusedOutput,
  onInterruptFocusedAgent,
  onCloseTerminal,
  onCloseChatSession,
  onAttachTerminal,
  onAttachChatSession,
  onSetError,
}: WorkspaceHeaderProps) {
  const localAgentProfiles = agentProfiles.filter((profile) => profile.agent === 'local_llm' || profile.local);

  return (
    <div className="shrink-0 border-b border-forge-border bg-forge-bg/95 backdrop-blur-md">
      <div className="flex h-11 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <Box className="h-3.5 w-3.5 shrink-0 text-forge-muted" />
            <span className="truncate font-bold text-forge-text">{workspace.repo}</span>
          </div>

          <ChevronRight className="h-3 w-3 shrink-0 text-forge-dim" />

          <div className="flex min-w-0 shrink items-center gap-1">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-forge-muted" />
            <span className="truncate font-mono text-forge-text/80">{workspace.branch}</span>
          </div>

          <span className="shrink-0 text-forge-border/40">/</span>

          <h1 className="shrink-0 truncate font-bold text-forge-green">{workspace.name}</h1>

          {workspace.currentTask.trim() && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-forge-dim" />
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-forge-muted">
                <Layout className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium text-forge-green/90">{workspace.currentTask}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => onCreateChatSession('claude_code', 'Claude Chat')}
            className="h-7 px-2 text-[11px] border-forge-green/20 text-forge-green hover:bg-forge-green/5"
          >
            <span className="hidden sm:inline">New Claude</span>
            <span className="sm:hidden">+ Claude</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="h-7 w-7 text-forge-muted hover:text-forge-text">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateTerminal('shell', 'shell', 'Shell')}>
                New shell tab
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateChatSession('codex', 'Codex Chat')}>
                New Codex tab
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateChatSession('kimi_code', 'Kimi Chat')}>
                New Kimi tab
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateChatSession('local_llm', 'Local LLM Chat')}>
                New Local LLM tab
              </DropdownMenuItem>
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
                <Square className="h-3.5 w-3.5 text-forge-yellow" /> Interrupt terminal
              </DropdownMenuItem>
              {onOpenInCursor && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-forge-blue focus:text-forge-blue"
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

      {(chatSessions.length > 0 || visibleSessions.length > 0) && (
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5 bg-black/5">
          {chatSessions.map((session) => {
            const active = focusedChatId === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onAttachChatSession(session.id)}
                className={`group flex max-w-[200px] shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-left transition-all ${active ? 'bg-forge-green/15 text-forge-text ring-1 ring-forge-green/30' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.status === 'running' ? 'bg-forge-green shadow-electric-glow animate-pulse' : session.status === 'failed' || session.status === 'interrupted' ? 'bg-forge-red' : 'bg-forge-muted/50'}`} />
                <span className="truncate text-[11px] font-bold">{session.title}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseChatSession(session.id);
                  }}
                  className="rounded p-0.5 text-forge-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-forge-text"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}

          {visibleSessions.filter((s) => s.terminalKind !== 'agent').map((session) => {
            const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
            const active = focusedSession?.id === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onAttachTerminal(session)}
                className={`group flex max-w-[200px] shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-left transition-all ${active ? 'bg-white/10 text-forge-text ring-1 ring-white/20' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/85'}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.status === 'running' ? 'bg-forge-blue animate-pulse' : 'bg-forge-muted/50'}`} />
                <span className="truncate text-[11px] font-bold">{title}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTerminal(session.id);
                  }}
                  className="rounded p-0.5 text-forge-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-forge-text"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-forge-red/20 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">
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
              className="shrink-0 rounded border border-forge-border bg-white/5 px-2 py-1 text-xs text-forge-muted hover:bg-white/10"
            >
              {session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile} · {session.status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
