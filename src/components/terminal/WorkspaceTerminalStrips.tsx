import {
  ExternalLink,
  Globe2,
  Play,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ForgeWorkspaceConfig, WorkspaceHealth, WorkspacePort, WorkspaceReadiness } from '../../types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export function WorkspaceReadinessStrip({ readiness }: { readiness: WorkspaceReadiness }) {
  const badgeVariant =
    readiness.status === 'needs_attention'
      ? 'warning'
      : readiness.status === 'running'
        ? 'info'
        : readiness.status === 'review'
          ? 'orange'
          : 'default';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2 text-sm">
      <Badge variant={badgeVariant} className="normal-case tracking-normal text-xs px-2">
        {readiness.status.replace('_', ' ')}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-forge-muted">{readiness.summary}</span>
    </div>
  );
}

export function WorkspaceHealthStrip({
  health,
  displayPortCount,
  busy,
  onRefresh,
  onClose,
  onStartShell,
  onRecoverSessions,
}: {
  health: WorkspaceHealth;
  /** From on-demand Testing tab scan (`list_workspace_ports`); health payload no longer runs port discovery. */
  displayPortCount: number;
  busy: boolean;
  onRefresh: () => void;
  onClose: (sessionId: string) => void;
  onStartShell: () => void;
  onRecoverSessions: () => void;
}) {
  const running = health.terminals.filter((terminal) => terminal.status === 'running').length;
  const failed = health.terminals.filter((terminal) => terminal.status === 'failed' || terminal.status === 'interrupted');
  const recoverable = health.terminals.filter((terminal) => (
    terminal.stale
    || terminal.stuckSince
    || terminal.status === 'failed'
    || terminal.status === 'interrupted'
    || (terminal.status === 'running' && !terminal.attached)
  ));
  const statusBadgeVariant =
    health.status === 'needs_attention'
      ? 'warning'
      : health.status === 'healthy'
        ? 'success'
        : 'default';

  return (
    <div className="mt-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PlugZap className="h-3.5 w-3.5 text-forge-muted" />
        <span className="font-semibold text-forge-text">Health</span>
        <Badge variant={statusBadgeVariant} className="normal-case tracking-normal text-xs px-2">
          {health.status === 'needs_attention' ? 'Needs attention' : health.status === 'healthy' ? 'Healthy' : 'Idle'}
        </Badge>
        <span className="text-forge-muted" title="Port count updates when you use Testing → Refresh ports">
          {running} running · {displayPortCount} port{displayPortCount === 1 ? '' : 's'}
        </span>
        {health.warnings.slice(0, 1).map((warning) => (
          <span key={warning} className="min-w-0 flex-1 truncate text-forge-yellow" title={warning}>
            {warning}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {recoverable.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onRecoverSessions}
              title="Close stale, detached, stuck, failed, or interrupted sessions while preserving history"
            >
              Recover {recoverable.length}
            </Button>
          )}
          {failed.slice(0, 2).map((terminal) => (
            <Button
              key={terminal.sessionId}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onClose(terminal.sessionId)}
            >
              Close {terminal.title || terminal.kind}
            </Button>
          ))}
          {health.terminals.length === 0 && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onStartShell}>
              Start shell
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceCommandsStrip({
  config,
  runningRunCount,
  busy,
  commandBusy,
  onRunSetup,
  onStartRun,
  onRestartRun,
  onStopRuns,
}: {
  config: ForgeWorkspaceConfig | null;
  runningRunCount: number;
  busy: boolean;
  commandBusy: string | null;
  onRunSetup: () => void;
  onStartRun: (index: number) => void;
  onRestartRun: (index: number) => void;
  onStopRuns: () => void;
}) {
  if (!config) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-forge-border/70 bg-white/[0.03] px-3 py-2 text-sm text-forge-muted">
        <Wrench className="h-3.5 w-3.5" />
        Loading workspace commands…
      </div>
    );
  }

  const hasCommands = config.setup.length > 0 || config.run.length > 0;
  const configBadgeVariant = config.warning ? 'warning' : config.exists ? 'success' : 'default';

  return (
    <div className="mt-3 rounded-lg border border-forge-border/70 bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Wrench className="h-3.5 w-3.5 text-forge-muted" />
          <span className="font-semibold text-forge-text">Workspace Commands</span>
          <Badge variant={configBadgeVariant} className="normal-case tracking-normal text-xs px-2">
            {config.warning ? 'config warning' : config.exists ? '.forge/config.json' : 'No Forge config found'}
          </Badge>
          {runningRunCount > 0 && (
            <Badge variant="info" className="normal-case tracking-normal text-xs px-2">
              {runningRunCount} run active
            </Badge>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {config.setup.length > 0 && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onRunSetup}>
              <Play className="h-3 w-3" /> {commandBusy === 'setup' ? 'Starting setup…' : 'Run setup'}
            </Button>
          )}
          {config.run.map((command, index) => (
            <div key={`${index}-${command}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <Button
                variant="default"
                size="xs"
                disabled={busy}
                onClick={() => onStartRun(index)}
                title={command}
                className="max-w-[220px] truncate"
              >
                <Play className="h-3 w-3" /> {commandBusy === `run-${index}` ? 'Starting…' : command}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => onRestartRun(index)}
                title={`Restart ${command}`}
              >
                <RotateCcw className="h-3 w-3" /> Restart
              </Button>
            </div>
          ))}
          {runningRunCount > 0 && (
            <Button variant="destructive" size="sm" disabled={busy} onClick={onStopRuns}>
              <Square className="h-3 w-3" /> {commandBusy === 'stop-all-runs' ? 'Stopping…' : 'Stop runs'}
            </Button>
          )}
        </div>
      </div>
      {config.warning && <p className="mt-2 text-sm text-forge-yellow">{config.warning}</p>}
      {!hasCommands && !config.warning && (
        <p className="mt-1 text-sm text-forge-muted">
          Add setup/run commands at <span className="font-mono">.forge/config.json</span> to make this workspace one-click runnable.
        </p>
      )}
    </div>
  );
}

export function WorkspacePortsStrip({
  ports,
  busy,
  onRefresh,
  onOpen,
  onKill,
}: {
  ports: WorkspacePort[];
  busy: boolean;
  onRefresh: () => void;
  onOpen: (port: number) => void;
  onKill: (port: WorkspacePort) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Globe2 className="h-3.5 w-3.5 text-forge-muted" />
          <span className="font-semibold text-forge-text">Testing</span>
          <Badge
            variant={ports.length > 0 ? 'info' : 'default'}
            className="normal-case tracking-normal text-xs px-2"
          >
            {ports.length > 0 ? `${ports.length} port${ports.length === 1 ? '' : 's'}` : 'No workspace ports'}
          </Badge>
        </div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onRefresh} className="ml-auto">
          <RefreshCw className="h-3 w-3" /> {busy ? 'Scanning…' : 'Refresh ports'}
        </Button>
      </div>
      {ports.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ports.map((port) => (
            <div key={`${port.pid}-${port.port}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpen(port.port)}
                title={port.cwd ?? port.address}
                className="text-forge-blue hover:bg-forge-blue/10 hover:text-forge-blue"
              >
                <ExternalLink className="h-3 w-3" /> localhost:{port.port}
              </Button>
              <span className="max-w-[140px] truncate font-mono text-xs text-forge-text/85">
                {port.command} · pid {port.pid}
              </span>
              <Button
                variant="destructive"
                size="xs"
                disabled={busy}
                onClick={() => onKill(port)}
                title={`Kill process ${port.pid}`}
              >
                <Trash2 className="h-3 w-3" /> Kill
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-forge-muted">Start a dev server from this workspace, then refresh to open or stop it here.</p>
      )}
    </div>
  );
}
