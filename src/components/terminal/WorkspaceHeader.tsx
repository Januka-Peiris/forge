import { useState } from 'react';
import { ChevronDown, Copy, ExternalLink, Globe2, MoreHorizontal, PlugZap, RefreshCw, RotateCcw, Square, Terminal as TerminalIcon, Wrench, X } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import type { ForgeWorkspaceConfig, TerminalProfile, TerminalSession, Workspace, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
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
  allSessions: TerminalSession[];
  dockOverflowSessions: TerminalSession[];
  busy: boolean;
  error: string | null;
  focusedSession: TerminalSession | null;
  onOpenInCursor?: () => void;
  onCreateChatSession: (provider: 'claude_code' | 'codex', title?: string) => void;
  onCreateTerminal: (kind: 'agent' | 'shell', profile: TerminalProfile, title?: string) => void;
  onCopyFocusedOutput: () => void;
  onInterruptFocusedAgent: () => void;
  onRunSetup: () => void;
  onStartRunCommand: (index: number, restart?: boolean) => void;
  onStopRunCommands: () => void;
  onRefreshPorts: () => void;
  onOpenPort: (port: number) => void;
  onKillPort: (port: WorkspacePort) => void;
  onRefreshHealth: () => void;
  onRecoverSession: (sessionId: string) => void;
  onCloseTerminal: (sessionId: string) => void;
  onStartShell: () => void;
  onAttachTerminal: (session: TerminalSession) => void;
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
  allSessions,
  dockOverflowSessions,
  busy,
  error,
  focusedSession,
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
  onRecoverSession,
  onCloseTerminal,
  onStartShell,
  onAttachTerminal,
  onSetError,
}: WorkspaceHeaderProps) {
  const [activeTab, setActiveTab] = useState<HeaderTab>(null);

  const toggle = (tab: Exclude<HeaderTab, null>) =>
    setActiveTab((v) => (v === tab ? null : tab));

  const showStrips = forgeConfig !== null || workspaceReadiness !== null || workspaceHealth !== null;

  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-forge-border bg-forge-surface/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TerminalIcon className="h-4 w-4 shrink-0 text-forge-orange" />
          <h1 className="shrink-0 text-sm font-bold text-forge-text">{workspace.name}</h1>
          <span className="text-forge-border/60">/</span>
          <p className="min-w-0 truncate font-mono text-xs text-forge-muted">{workspace.repo} / {workspace.branch}</p>
        </div>

        {showStrips && (
          <div className="flex shrink-0 items-center gap-0.5">
            {forgeConfig !== null && (
              <button
                onClick={() => toggle('commands')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${activeTab === 'commands' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <Wrench className="h-3 w-3" />
                Commands
                {forgeConfig.warning && <span className="rounded-full border border-forge-yellow/25 bg-forge-yellow/10 px-1 text-[10px] text-forge-yellow">!</span>}
                {forgeConfig.exists && !forgeConfig.warning && <span className="rounded-full border border-forge-green/25 bg-forge-green/10 px-1 text-[10px] text-forge-green">✓</span>}
                {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length > 0 && (
                  <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-[10px] text-forge-blue">
                    {visibleSessions.filter((s) => s.terminalKind === 'run' && s.status === 'running').length}
                  </span>
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'commands' ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => toggle('ports')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${activeTab === 'ports' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
            >
              <Globe2 className="h-3 w-3" />
              Testing
              {ports.length > 0 && (
                <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-1.5 text-[10px] text-forge-blue">{ports.length}</span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'ports' ? 'rotate-180' : ''}`} />
            </button>
            {workspaceReadiness !== null && (
              <button
                onClick={() => toggle('readiness')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${activeTab === 'readiness' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <RotateCcw className="h-3 w-3" />
                Readiness
                <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'readiness' ? 'rotate-180' : ''}`} />
              </button>
            )}
            {workspaceHealth !== null && (
              <button
                onClick={() => toggle('health')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${activeTab === 'health' ? 'bg-white/8 text-forge-text' : 'text-forge-muted hover:bg-white/5 hover:text-forge-text/80'}`}
              >
                <RefreshCw className="h-3 w-3" />
                Health
                <ChevronDown className={`h-3 w-3 transition-transform ${activeTab === 'health' ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="default" size="sm" disabled={busy} onClick={() => onCreateChatSession('claude_code', 'Claude Chat')}>
            New Claude
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm">
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
              <DropdownMenuItem disabled={busy} onSelect={() => onCreateChatSession('claude_code', 'Claude Chat')}>
                New Claude tab
              </DropdownMenuItem>
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
          onRecover={(sessionId) => {
            const session = allSessions.find((s) => s.id === sessionId);
            if (session) onAttachTerminal(session);
          }}
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
