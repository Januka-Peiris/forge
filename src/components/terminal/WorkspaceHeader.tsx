import { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  ExternalLink, 
  Globe2, 
  MoreHorizontal, 
  PlugZap, 
  RefreshCw, 
  RotateCcw, 
  Square, 
  Wrench, 
  GitBranch, 
  Box, 
  Layout, 
  X 
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
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';
import type { 
  AgentProfile, 
  ForgeWorkspaceConfig, 
  TerminalProfile, 
  TerminalSession, 
  Workspace, 
  WorkspaceHealth, 
  WorkspacePort, 
  WorkspaceReadiness 
} from '../../types';
import type { AgentChatSession } from '../../types/agent-chat';
import { PROFILE_LABELS } from './workspace-terminal-constants';
import {
  WorkspaceCommandsStrip,
  WorkspaceHealthStrip,
  WorkspacePortsStrip,
  WorkspaceReadinessStrip,
} from './WorkspaceTerminalStrips';

type HeaderTab = 'commands' | 'ports' | 'readiness' | 'health' | null;

interface WorkspaceHeaderProps {
  workspace: Workspace;
  ports: WorkspacePort[];
  portsBusy: boolean;
  forgeConfig: ForgeWorkspaceConfig | null;
  commandBusy: string | null;
  workspaceHealth: WorkspaceHealth | null;
  workspaceReadiness: WorkspaceReadiness | null;
  visibleSessions: TerminalSession[];
  chatSessions: AgentChatSession[];
  dockOverflowSessions: TerminalSession[];
  busy: boolean;
  error: string | null;
  focusedSession: TerminalSession | null;
  focusedChatId: string | null;
  agentProfiles: AgentProfile[];
  onOpenInCursor?: () => void;
  onCreateChatSession: (provider: 'claude_code' | 'codex' | 'local_llm', title?: string) => void;
  onCreateTerminal: (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string, profileId?: string) => void;
  onCopyFocusedOutput: () => void;
  onInterruptFocusedAgent: () => void;
  onRunSetup: () => void;
  onStartRunCommand: (index: number, restart?: boolean) => void;
  onStopRunCommands: () => void;
  onRefreshPorts: () => void;
  onOpenPort: (port: number) => void;
  onKillPort: (port: WorkspacePort) => void;
  onRefreshHealth: () => void;
  onRecoverSessions: () => void;
  onCloseTerminal: (sessionId: string) => void;
  onCloseChatSession: (sessionId: string) => void;
  onStartShell: () => void;
  onAttachTerminal: (session: TerminalSession) => void;
  onAttachChatSession: (sessionId: string) => void;
  onSetError: (message: string) => void;
}

export function WorkspaceHeader({
  workspace,
  ports,
  portsBusy,
  forgeConfig,
  commandBusy,
  workspaceHealth,
  workspaceReadiness,
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
  onRunSetup,
  onStartRunCommand,
  onStopRunCommands,
  onRefreshPorts,
  onOpenPort,
  onKillPort,
  onRefreshHealth,
  onRecoverSessions,
  onCloseTerminal,
  onCloseChatSession,
  onStartShell,
  onAttachTerminal,
  onAttachChatSession,
  onSetError,
}: WorkspaceHeaderProps) {
  const [activeTab, setActiveTab] = useState<HeaderTab>(null);

  const toggle = (tab: Exclude<HeaderTab, null>) =>
    setActiveTab((v) => (v === tab ? null : tab));

  const showStrips = forgeConfig !== null || workspaceReadiness !== null || workspaceHealth !== null;
  const localAgentProfiles = agentProfiles.filter((profile) => profile.agent === 'local_llm' || profile.local);

  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-forge-border bg-forge-bg/95 backdrop-blur-md">
      <div className="flex h-10 items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <Box className="h-3.5 w-3.5 text-forge-muted shrink-0" />
            <span className="font-bold text-forge-text truncate">{workspace.repo}</span>
          </div>
          
          <ChevronRight className="h-3 w-3 text-forge-dim shrink-0" />
          
          <div className="flex items-center gap-1 min-w-0 shrink">
            <GitBranch className="h-3.5 w-3.5 text-forge-muted shrink-0" />
            <span className="font-mono text-forge-text/80 truncate">{workspace.branch}</span>
          </div>

          <span className="text-forge-border/40 shrink-0">/</span>

          <h1 className="shrink-0 font-bold text-forge-green truncate">{workspace.name}</h1>
          
          {workspace.currentTask.trim() && (
            <>
              <ChevronRight className="h-3 w-3 text-forge-dim shrink-0" />
              <div className="flex min-w-0 items-center gap-1.5 text-forge-muted overflow-hidden">
                <Layout className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium text-forge-green/90">
                  {workspace.currentTask}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showStrips && (
            <div className="flex items-center gap-0.5 mr-1 pr-1 border-r border-forge-border/40">
              {forgeConfig !== null && (
                <button
                  onClick={() => toggle('commands')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${activeTab === 'commands' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
                  title="Commands"
                >
                  <Wrench className="h-3 w-3" />
                  <span className="hidden xl:inline">Commands</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'commands' ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => toggle('ports')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${activeTab === 'ports' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
                title="Testing"
              >
                <Globe2 className="h-3 w-3" />
                <span className="hidden xl:inline">Testing</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'ports' ? 'rotate-180' : ''}`} />
              </button>
              {workspaceReadiness !== null && (
                <button
                  onClick={() => toggle('readiness')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${activeTab === 'readiness' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
                  title="Readiness"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden xl:inline">Readiness</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'readiness' ? 'rotate-180' : ''}`} />
                </button>
              )}
              {workspaceHealth !== null && (
                <button
                  onClick={() => toggle('health')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${activeTab === 'health' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
                  title="Health"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span className="hidden xl:inline">Health</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'health' ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          )}

          <Button variant="outline" size="xs" disabled={busy} onClick={() => onCreateChatSession('claude_code', 'Claude Chat')} className="h-7 px-2 text-[11px] border-forge-green/20 text-forge-green hover:bg-forge-green/5 shrink-0">
            <span className="hidden sm:inline">New Claude</span>
            <span className="sm:hidden">+ Claude</span>
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="h-7 w-7 text-forge-muted hover:text-forge-text shrink-0">
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
                    onSelect={() => { try { onOpenInCursor(); } catch (err) { onSetError(String(err)); } }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Cursor
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Session Tab Rail */}
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
                  onClick={(event) => { event.stopPropagation(); onCloseChatSession(session.id); }}
                  className="rounded p-0.5 text-forge-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-forge-text"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
          
          {visibleSessions.filter(s => s.terminalKind !== 'agent').map((session) => {
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
                  onClick={(event) => { event.stopPropagation(); onCloseTerminal(session.id); }}
                  className="rounded p-0.5 text-forge-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-forge-text"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeTab === 'commands' && (
        <WorkspaceCommandsStrip
          config={forgeConfig}
          runningRunCount={visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length}
          busy={busy || commandBusy !== null}
          commandBusy={commandBusy}
          onRunSetup={onRunSetup}
          onStartRun={(index) => onStartRunCommand(index)}
          onRestartRun={(index) => onStartRunCommand(index, true)}
          onStopRuns={onStopRunCommands}
        />
      )}
      {activeTab === 'ports' && (
        <WorkspacePortsStrip
          ports={ports}
          busy={portsBusy}
          onRefresh={onRefreshPorts}
          onOpen={(port) => onOpenPort(port)}
          onKill={(port) => onKillPort(port)}
        />
      )}
      {activeTab === 'readiness' && workspaceReadiness && (
        <WorkspaceReadinessStrip readiness={workspaceReadiness} />
      )}
      {activeTab === 'health' && workspaceHealth && (
        <WorkspaceHealthStrip
          health={workspaceHealth}
          displayPortCount={ports.length}
          busy={busy}
          onRefresh={onRefreshHealth}
          onRecoverSessions={onRecoverSessions}
          onClose={onCloseTerminal}
          onStartShell={onStartShell}
        />
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-forge-red/20 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">
          <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {dockOverflowSessions.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
