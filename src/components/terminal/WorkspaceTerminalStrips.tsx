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

export function WorkspaceReadinessStrip({ readiness }: { readiness: WorkspaceReadiness }) {
  const tone =
    readiness.status === 'needs_attention'
      ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'
      : readiness.status === 'running'
        ? 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue'
        : readiness.status === 'review'
          ? 'border-forge-orange/25 bg-forge-orange/10 text-forge-orange'
          : 'border-forge-border bg-white/5 text-forge-muted';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2 text-sm">
      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{readiness.status.replace('_', ' ')}</span>
      <span className="min-w-0 flex-1 truncate text-forge-muted">{readiness.summary}</span>
    </div>
  );
}

export function WorkspaceHealthStrip({
  health,
  displayPortCount,
  busy,
  onRefresh,
  onRecover,
  onClose,
  onStartShell,
}: {
  health: WorkspaceHealth;
  /** From on-demand Testing tab scan (`list_workspace_ports`); health payload no longer runs port discovery. */
  displayPortCount: number;
  busy: boolean;
  onRefresh: () => void;
  onRecover: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onStartShell: () => void;
}) {
  const running = health.terminals.filter((terminal) => terminal.status === 'running').length;
  const stale = health.terminals.filter((terminal) => terminal.stale || terminal.recommendedAction.includes('fresh')).length;
  const unattached = health.terminals.filter((terminal) => terminal.recommendedAction === 'reattach');
  const failed = health.terminals.filter((terminal) => terminal.status === 'failed' || terminal.status === 'interrupted');
  const statusClasses =
    health.status === 'needs_attention'
      ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'
      : health.status === 'healthy'
        ? 'border-forge-green/25 bg-forge-green/10 text-forge-green'
        : 'border-forge-border bg-white/5 text-forge-muted';

  return (
    <div className="mt-2 rounded-lg border border-forge-border/70 bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PlugZap className="h-3.5 w-3.5 text-forge-muted" />
        <span className="font-semibold text-forge-text">Health</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClasses}`}>
          {health.status === 'needs_attention' ? 'Needs attention' : health.status === 'healthy' ? 'Healthy' : 'Idle'}
        </span>
        <span className="text-forge-muted" title="Port count updates when you use Testing → Refresh ports">
          {running} running · {displayPortCount} port{displayPortCount === 1 ? '' : 's'} · {stale} stale
        </span>
        {health.warnings.slice(0, 1).map((warning) => (
          <span key={warning} className="min-w-0 flex-1 truncate text-forge-yellow" title={warning}>
            {warning}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {unattached.slice(0, 2).map((terminal) => (
            <button
              key={terminal.sessionId}
              disabled={busy}
              onClick={() => onRecover(terminal.sessionId)}
              className="rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-xs font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
            >
              Reattach {terminal.title || terminal.kind}
            </button>
          ))}
          {failed.slice(0, 2).map((terminal) => (
            <button
              key={terminal.sessionId}
              disabled={busy}
              onClick={() => onClose(terminal.sessionId)}
              className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50"
            >
              Close {terminal.title || terminal.kind}
            </button>
          ))}
          {health.terminals.length === 0 && (
            <button disabled={busy} onClick={onStartShell} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              Start shell
            </button>
          )}
          <button disabled={busy} onClick={onRefresh} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className="inline h-3 w-3" /> Refresh
          </button>
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
  return (
    <div className="mt-3 rounded-lg border border-forge-border/70 bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Wrench className="h-3.5 w-3.5 text-forge-muted" />
          <span className="font-semibold text-forge-text">Workspace Commands</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              config.warning
                ? 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'
                : config.exists
                  ? 'border-forge-green/25 bg-forge-green/10 text-forge-green'
                  : 'border-forge-border bg-white/5 text-forge-muted'
            }`}
          >
            {config.warning ? 'config warning' : config.exists ? '.forge/config.json' : 'No Forge config found'}
          </span>
          {runningRunCount > 0 && (
            <span className="rounded-full border border-forge-blue/25 bg-forge-blue/10 px-2 py-0.5 text-xs text-forge-blue">{runningRunCount} run active</span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {config.setup.length > 0 && (
            <button disabled={busy} onClick={onRunSetup} className="rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              <Play className="inline h-3 w-3" /> {commandBusy === 'setup' ? 'Starting setup…' : 'Run setup'}
            </button>
          )}
          {config.run.map((command, index) => (
            <div key={`${index}-${command}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <button
                disabled={busy}
                onClick={() => onStartRun(index)}
                title={command}
                className="max-w-[220px] truncate rounded px-1.5 py-0.5 text-xs font-semibold text-forge-orange hover:bg-forge-orange/10 disabled:opacity-50"
              >
                <Play className="inline h-3 w-3" /> {commandBusy === `run-${index}` ? 'Starting…' : command}
              </button>
              <button
                disabled={busy}
                onClick={() => onRestartRun(index)}
                title={`Restart ${command}`}
                className="rounded px-1.5 py-0.5 text-xs text-forge-muted hover:bg-white/10 disabled:opacity-50"
              >
                <RotateCcw className="inline h-3 w-3" /> Restart
              </button>
            </div>
          ))}
          {runningRunCount > 0 && (
            <button disabled={busy} onClick={onStopRuns} className="rounded-md border border-forge-red/20 bg-forge-red/10 px-2 py-1 text-xs font-semibold text-forge-red hover:bg-forge-red/15 disabled:opacity-50">
              <Square className="inline h-3 w-3" /> {commandBusy === 'stop-all-runs' ? 'Stopping…' : 'Stop runs'}
            </button>
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
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              ports.length > 0 ? 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue' : 'border-forge-border bg-white/5 text-forge-muted'
            }`}
          >
            {ports.length > 0 ? `${ports.length} port${ports.length === 1 ? '' : 's'}` : 'No workspace ports'}
          </span>
        </div>
        <button
          disabled={busy}
          onClick={onRefresh}
          className="ml-auto rounded-md border border-forge-border bg-white/5 px-2 py-1 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className="inline h-3 w-3" /> {busy ? 'Scanning…' : 'Refresh ports'}
        </button>
      </div>
      {ports.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ports.map((port) => (
            <div key={`${port.pid}-${port.port}`} className="flex items-center gap-1 rounded-md border border-forge-border/70 bg-forge-bg px-1.5 py-1">
              <button onClick={() => onOpen(port.port)} className="rounded px-1.5 py-0.5 text-xs font-semibold text-forge-blue hover:bg-forge-blue/10" title={port.cwd ?? port.address}>
                <ExternalLink className="inline h-3 w-3" /> localhost:{port.port}
              </button>
              <span className="max-w-[140px] truncate font-mono text-xs text-forge-text/85">
                {port.command} · pid {port.pid}
              </span>
              <button
                disabled={busy}
                onClick={() => onKill(port)}
                className="rounded px-1.5 py-0.5 text-xs text-forge-red hover:bg-forge-red/10 disabled:opacity-50"
                title={`Kill process ${port.pid}`}
              >
                <Trash2 className="inline h-3 w-3" /> Kill
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-forge-muted">Start a dev server from this workspace, then refresh to open or stop it here.</p>
      )}
    </div>
  );
}
