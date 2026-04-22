import { Circle, CheckCircle2, ExternalLink, GitPullRequest, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceReadiness } from '../../types/workspace-readiness';
import type { WorkspacePrDraft, WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceHealth, WorkspaceSessionRecoveryResult } from '../../types/workspace-health';
import type { WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from '../../types/task-lifecycle';

export function CockpitLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-1.5">
      <span className="shrink-0 text-forge-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-forge-text/90" title={value}>
        {value}
      </span>
    </div>
  );
}

export function ChecksShippingPanel({
  config,
  readiness,
  prStatus,
  portCount,
  loading,
  actionBusy,
  actionMessage,
  onRunSetup,
  onRunCommand,
  onStopRuns,
}: {
  config: ForgeWorkspaceConfig | null;
  readiness: WorkspaceReadiness | null;
  prStatus: WorkspacePrStatus | null;
  portCount: number | null;
  loading: boolean;
  actionBusy: string | null;
  actionMessage: string | null;
  onRunSetup: () => void;
  onRunCommand: (index: number) => void;
  onStopRuns: () => void;
}) {
  const runCount = config?.run.length ?? 0;
  const setupCount = config?.setup.length ?? 0;
  const teardownCount = config?.teardown.length ?? 0;
  const hasConfig = config?.exists;
  const testStatus = readiness?.testStatus ?? (runCount > 0 ? 'available' : 'not configured');
  const blockers = [
    readiness?.terminalHealth && readiness.terminalHealth !== 'healthy' ? `terminal: ${readiness.terminalHealth}` : null,
    readiness?.changedFiles === 0 ? 'no changes yet' : null,
    config?.warning ?? null,
    prStatus?.warning ?? null,
  ].filter((item): item is string => Boolean(item));
  const prLabel = prStatus?.found
    ? `#${prStatus.number ?? '?'} · ${prStatus.state ?? 'unknown'}${prStatus.isDraft ? ' · draft' : ''}`
    : 'No PR found';
  const reviewLabel = prStatus?.reviewDecision
    ? prStatus.reviewDecision.toLowerCase().replace(/_/g, ' ')
    : 'no review decision';
  const prChecks = [...(prStatus?.checks ?? [])].sort((a, b) => {
    const rank = (check: { status: string; conclusion?: string | null }) => {
      const value = `${check.status} ${check.conclusion ?? ''}`.toLowerCase();
      if (value.includes('fail') || value.includes('error') || value.includes('cancel')) return 0;
      if (value.includes('pending') || value.includes('progress') || value.includes('queued')) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
  const checkTone = (check: { status: string; conclusion?: string | null }) => {
    const value = `${check.status} ${check.conclusion ?? ''}`.toLowerCase();
    if (value.includes('fail') || value.includes('error') || value.includes('cancel')) return 'border-forge-red/20 bg-forge-red/10 text-forge-red';
    if (value.includes('pending') || value.includes('progress') || value.includes('queued')) return 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow';
    if (value.includes('success') || value.includes('pass') || value.includes('complete')) return 'border-forge-green/20 bg-forge-green/10 text-forge-green';
    return 'border-forge-border bg-white/5 text-forge-muted';
  };

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Checks & Shipping</p>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-forge-muted" />}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <CockpitLine label="Config" value={hasConfig ? '.forge/config.json' : 'No config'} />
          <CockpitLine label="Checks" value={`${runCount} run command${runCount === 1 ? '' : 's'} · ${testStatus}`} />
          <CockpitLine label="Ports" value={portCount === null ? 'not scanned' : `${portCount} active`} />
          <CockpitLine label="GitHub PR" value={prLabel} />
          <CockpitLine label="CI" value={prStatus?.checksSummary ?? 'not checked'} />
          <CockpitLine label="Review" value={`${reviewLabel} · ${readiness?.prCommentCount ?? 0} comment(s)`} />
        </div>
        {prStatus?.found && prStatus.url && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-forge-border/60 bg-black/10 px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-forge-text/85" title={prStatus.title ?? prLabel}>
                {prStatus.title ?? prLabel}
              </p>
              <p className="text-xs text-forge-muted">{prLabel} · {prStatus.checksSummary}</p>
            </div>
            <Button asChild variant="secondary" size="xs">
              <a href={prStatus.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />
                Open PR
              </a>
            </Button>
          </div>
        )}
        {prStatus?.found && prChecks.length === 0 && (
          <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 px-2 py-2">
            <p className="text-xs font-semibold text-forge-text/85">GitHub checks</p>
            <p className="mt-0.5 text-xs text-forge-muted">No CI reported for this PR yet.</p>
          </div>
        )}
        {prChecks.length > 0 && (
          <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-forge-text/85">GitHub checks</p>
              <span className="text-xs text-forge-muted">failed/pending first · {prChecks.length} reported</span>
            </div>
            <div className="space-y-1">
              {prChecks.slice(0, 5).map((check) => {
                const label = check.conclusion ? `${check.status} · ${check.conclusion}` : check.status;
                return (
                  <div key={`${check.name}-${check.status}-${check.conclusion ?? ''}`} className="flex items-center gap-2 rounded border border-forge-border/50 bg-black/15 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-xs text-forge-text/90" title={check.name}>{check.name}</span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase ${checkTone(check)}`}>
                      {label.replace(/_/g, ' ')}
                    </span>
                    {check.url && (
                      <a
                        href={check.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-forge-blue hover:text-forge-blue/80"
                        title="Open check details"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
              {prChecks.length > 5 && <p className="text-xs text-forge-muted">+{prChecks.length - 5} more check(s)</p>}
            </div>
          </div>
        )}
        {(setupCount > 0 || runCount > 0 || teardownCount > 0) && (
          <>
            <div className="mt-2 flex flex-wrap gap-1">
              {setupCount > 0 && <span className="rounded border border-forge-blue/20 bg-forge-blue/10 px-1.5 py-0.5 text-xs text-forge-blue">{setupCount} setup</span>}
              {runCount > 0 && <span className="rounded border border-forge-green/20 bg-forge-green/10 px-1.5 py-0.5 text-xs text-forge-green">{runCount} run/check</span>}
              {teardownCount > 0 && <span className="rounded border border-forge-yellow/20 bg-forge-yellow/10 px-1.5 py-0.5 text-xs text-forge-yellow">{teardownCount} teardown</span>}
            </div>
            <div className="mt-3 space-y-2 rounded-lg border border-forge-border/60 bg-black/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={Boolean(actionBusy) || setupCount === 0}
                  onClick={onRunSetup}
                >
                  {actionBusy === 'setup' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Run setup
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={Boolean(actionBusy) || runCount === 0}
                  onClick={onStopRuns}
                >
                  {actionBusy === 'stop' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Stop checks
                </Button>
                <span className="text-xs text-forge-muted">Commands run in inspectable terminals and are written to activity.</span>
              </div>
              {config?.run.slice(0, 3).map((command, index) => (
                <div key={`${index}-${command}`} className="flex items-center justify-between gap-2 rounded border border-forge-border/50 bg-black/15 px-2 py-1">
                  <code className="min-w-0 truncate text-[11px] text-forge-muted" title={command}>{command}</code>
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={Boolean(actionBusy)}
                    onClick={() => onRunCommand(index)}
                  >
                    {actionBusy === `run-${index}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Run
                  </Button>
                </div>
              ))}
              {runCount > 3 && <p className="text-xs text-forge-muted">+{runCount - 3} more command(s) available in terminal tools.</p>}
              {actionMessage && <p className="text-xs text-forge-muted">{actionMessage}</p>}
            </div>
          </>
        )}
        {blockers.length > 0 && (
          <div className="mt-2 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {blockers[0]}
          </div>
        )}
      </div>
    </div>
  );
}

export function ShippingGuidePanel({
  changedFiles,
  runCount,
  prStatus,
  prDraft,
  draftRefreshing,
  prCreating,
  cleanupBusy,
  message,
  onCreatePr,
  onRefreshDraft,
  onCopyDraft,
  onRunFirstCheck,
  onCleanup,
}: {
  changedFiles: number;
  runCount: number;
  prStatus: WorkspacePrStatus | null;
  prDraft: WorkspacePrDraft | null;
  draftRefreshing: boolean;
  prCreating: boolean;
  cleanupBusy: boolean;
  message: string | null;
  onCreatePr: () => void;
  onRefreshDraft: () => void;
  onCopyDraft: () => void;
  onRunFirstCheck: () => void;
  onCleanup: () => void;
}) {
  const hasChanges = changedFiles > 0;
  const hasPr = Boolean(prStatus?.found);
  const checksReady = runCount > 0 || (prStatus?.checksSummary && !['not checked', 'no checks'].includes(prStatus.checksSummary));
  const steps = [
    { label: 'Review changes', done: hasChanges, hint: hasChanges ? `${changedFiles} changed file(s)` : 'No local changes yet' },
    { label: 'Run checks', done: Boolean(checksReady), hint: runCount > 0 ? `${runCount} configured check(s)` : prStatus?.checksSummary ?? 'No checks configured' },
    { label: 'Prepare PR', done: hasPr, hint: hasPr ? `PR #${prStatus?.number ?? '?'}` : 'No PR linked yet' },
    { label: 'Cleanup/archive', done: false, hint: 'Stop run terminals and start teardown when finished' },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Ship Flow</p>
            <p className="mt-0.5 text-xs text-forge-muted">Guided local path: review → checks → PR → cleanup.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-2 rounded border border-forge-border/50 bg-black/10 px-2 py-1.5">
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-forge-green" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-forge-muted" />}
              <span className="min-w-0 flex-1 text-xs font-medium text-forge-text/90">{step.label}</span>
              <span className="min-w-0 truncate text-right text-xs text-forge-muted" title={step.hint}>{step.hint}</span>
            </div>
          ))}
        </div>
        {prDraft && (
          <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold text-forge-text/85" title={prDraft.title}>
                Draft PR: {prDraft.title}
              </p>
              <Button variant="ghost" size="xs" disabled={draftRefreshing} onClick={onRefreshDraft}>
                {draftRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Refresh draft
              </Button>
            </div>
            <p className="line-clamp-3 text-xs leading-relaxed text-forge-muted">{prDraft.summary}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <CockpitLine label="Key changes" value={`${prDraft.keyChanges.length}`} />
              <CockpitLine label="Risks" value={`${prDraft.risks.length}`} />
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-forge-muted">
              {prDraft.keyChanges.slice(0, 3).map((change) => (
                <li key={change} className="truncate" title={change}>{change}</li>
              ))}
            </ul>
            <Button variant="secondary" size="xs" className="mt-2" onClick={onCopyDraft}>
              Copy PR markdown
            </Button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={runCount === 0} onClick={onRunFirstCheck}>
            Run first check
          </Button>
          {!prDraft && (
            <Button variant="secondary" size="xs" disabled={!hasChanges || draftRefreshing} onClick={onRefreshDraft}>
              {draftRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Preview PR draft
            </Button>
          )}
          <Button variant="secondary" size="xs" disabled={prCreating || hasPr || !hasChanges} onClick={onCreatePr}>
            {prCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
            {hasPr ? 'PR linked' : 'Create PR'}
          </Button>
          <Button variant="secondary" size="xs" disabled={cleanupBusy} onClick={onCleanup}>
            {cleanupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Cleanup
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-forge-muted">{message}</p>}
      </div>
    </div>
  );
}

export function LifecyclePanel({
  isArchived,
  terminalHealth,
  workspaceHealth,
  workspaceTaskSnapshot,
  workspaceSchedulerJobs,
  recoveryResult,
  cleanupBusy,
  recoveryBusy,
  message,
  onCleanup,
  onRecover,
  onApplyRecoveryAction,
  onArchive,
  onDelete,
}: {
  isArchived: boolean;
  terminalHealth?: string | null;
  workspaceHealth: WorkspaceHealth | null;
  workspaceTaskSnapshot: WorkspaceTaskSnapshot | null;
  workspaceSchedulerJobs: WorkspaceSchedulerJob[];
  recoveryResult: WorkspaceSessionRecoveryResult | null;
  cleanupBusy: boolean;
  recoveryBusy: boolean;
  message: string | null;
  onCleanup: () => void;
  onRecover: () => void;
  onApplyRecoveryAction: (sessionId: string, action: 'resume_tracking' | 'mark_interrupted' | 'close_session') => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  const unhealthySessions = workspaceHealth?.terminals.filter((terminal) => (
    terminal.stale
    || terminal.status === 'failed'
    || terminal.status === 'interrupted'
    || (terminal.status === 'running' && !terminal.attached)
  )) ?? [];
  const terminalLabel = workspaceHealth
    ? `${workspaceHealth.status} · ${workspaceHealth.terminals.length} session(s)`
    : terminalHealth ?? 'not checked';

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Lifecycle</p>
          <p className="mt-0.5 text-xs text-forge-muted">Explicit workspace actions with safe defaults and recoverable history.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <CockpitLine label="View state" value={isArchived ? 'Archived — hidden from active flow' : 'Active — visible in cockpit'} />
          <CockpitLine label="Terminal state" value={terminalLabel} />
          <CockpitLine label="Cleanup mode" value="Stop terminals + teardown only; no worktree removal" />
          <CockpitLine label="Recovery" value={unhealthySessions.length > 0 ? `${unhealthySessions.length} session(s) need attention` : 'no stale sessions detected'} />
          <CockpitLine label="History" value="Activity, checkpoints, and context remain inspectable" />
          <CockpitLine
            label="Task lifecycle"
            value={
              workspaceTaskSnapshot
                ? `${workspaceTaskSnapshot.runs.filter((run) => run.status === 'running').length} running · ${workspaceTaskSnapshot.events.length} events`
                : 'not loaded'
            }
          />
          <CockpitLine
            label="Scheduler jobs"
            value={`${workspaceSchedulerJobs.length} configured`}
          />
        </div>
        {(workspaceTaskSnapshot?.runs.length ?? 0) > 0 && (
          <div className="mt-2 rounded border border-forge-border/60 bg-black/10 p-2">
            <p className="text-xs font-semibold text-forge-text/85">Recent task runs</p>
            <div className="mt-1 space-y-1">
              {workspaceTaskSnapshot?.runs.slice(0, 3).map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-forge-text/85">{run.kind}</span>
                  <span className="shrink-0 text-forge-muted">{run.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {workspaceSchedulerJobs.length > 0 && (
          <div className="mt-2 rounded border border-forge-border/60 bg-black/10 p-2">
            <p className="text-xs font-semibold text-forge-text/85">Scheduler jobs</p>
            <div className="mt-1 space-y-1">
              {workspaceSchedulerJobs.slice(0, 3).map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-forge-text/85">{job.kind}</span>
                  <span className="shrink-0 text-forge-muted">{job.intervalSeconds}s</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {workspaceHealth?.warnings.length ? (
          <div className="mt-2 space-y-1 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {workspaceHealth.warnings.slice(0, 3).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {workspaceHealth.warnings.length > 3 && <p>+{workspaceHealth.warnings.length - 3} more warning(s)</p>}
          </div>
        ) : null}
        {unhealthySessions.length > 0 && (
          <div className="mt-2 space-y-1 rounded border border-forge-border/60 bg-black/10 p-2">
            {unhealthySessions.slice(0, 3).map((terminal) => (
              <div key={terminal.sessionId} className="rounded border border-forge-border/50 bg-black/15 px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-forge-text/85" title={terminal.title}>{terminal.title}</span>
                  <span className="shrink-0 text-forge-muted">{terminal.recommendedAction}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-forge-border/50 bg-white/5 px-1 py-0.5 text-[10px] uppercase text-forge-muted">
                    {terminal.recoveryStatus.replace(/_/g, ' ')}
                  </span>
                  <Button variant="secondary" size="xs" disabled={recoveryBusy} onClick={() => onApplyRecoveryAction(terminal.sessionId, 'resume_tracking')}>
                    Resume tracking
                  </Button>
                  <Button variant="secondary" size="xs" disabled={recoveryBusy} onClick={() => onApplyRecoveryAction(terminal.sessionId, 'mark_interrupted')}>
                    Mark interrupted
                  </Button>
                  <Button variant="secondary" size="xs" disabled={recoveryBusy} onClick={() => onApplyRecoveryAction(terminal.sessionId, 'close_session')}>
                    Close session
                  </Button>
                </div>
              </div>
            ))}
            {unhealthySessions.length > 3 && <p className="text-xs text-forge-muted">+{unhealthySessions.length - 3} more session(s)</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={cleanupBusy} onClick={onCleanup}>
            {cleanupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Safe cleanup
          </Button>
          <Button variant="secondary" size="xs" disabled={recoveryBusy || unhealthySessions.length === 0} onClick={onRecover}>
            {recoveryBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Recover sessions
          </Button>
          <Button variant="secondary" size="xs" disabled={!onArchive} onClick={onArchive}>
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            variant="secondary"
            size="xs"
            disabled={!onDelete}
            onClick={onDelete}
            className="text-forge-red/80 hover:text-forge-red"
          >
            Forget workspace
          </Button>
        </div>
        {recoveryResult && (
          <div className="mt-2 rounded border border-forge-border/60 bg-black/10 p-2">
            <p className="text-xs text-forge-muted">
              Recovery closed {recoveryResult.closedSessions}, skipped {recoveryResult.skippedSessions}
              {recoveryResult.warnings.length > 0 ? `, with ${recoveryResult.warnings.length} warning(s)` : ''}.
            </p>
            <div className="mt-1 space-y-1">
              {recoveryResult.actions.slice(0, 4).map((action) => (
                <div key={action.sessionId} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 rounded border px-1 py-0.5 text-[10px] uppercase ${
                    action.action === 'closed'
                      ? 'border-forge-green/20 bg-forge-green/10 text-forge-green'
                      : action.action === 'failed'
                      ? 'border-forge-red/20 bg-forge-red/10 text-forge-red'
                      : 'border-forge-border bg-white/5 text-forge-muted'
                  }`}>
                    {action.action}
                  </span>
                  <span className="min-w-0 flex-1 text-forge-muted">
                    <span className="text-forge-text/85">{action.title}</span> — {action.reason}
                  </span>
                </div>
              ))}
              {recoveryResult.actions.length > 4 && <p className="text-xs text-forge-muted">+{recoveryResult.actions.length - 4} more action(s)</p>}
            </div>
          </div>
        )}
        {message && <p className="mt-2 text-xs text-forge-muted">{message}</p>}
      </div>
    </div>
  );
}
