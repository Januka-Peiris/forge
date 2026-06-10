import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MinusCircle,
  RefreshCw,
  Wand2,
  XCircle,
} from 'lucide-react';
import type { WorkspacePrCheck, WorkspacePrStatus } from '../../types/pr-draft';
import { getCachedWorkspacePrStatus, getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { queueWorkspaceAgentPrompt } from '../../lib/tauri-api/terminal';
import { invokeCommand } from '../../lib/tauri-api/client';
import { Button } from '../ui/button';

/** Poll faster while CI is in flight, slower when settled. */
const POLL_PENDING_MS = 15_000;
const POLL_SETTLED_MS = 60_000;

type Headline = { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' };

function checkIsPending(check: WorkspacePrCheck): boolean {
  return check.conclusion == null && !['COMPLETED', 'SUCCESS'].includes(check.status);
}

function checkIsFailed(check: WorkspacePrCheck): boolean {
  return ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.conclusion ?? '');
}

function deriveHeadline(status: WorkspacePrStatus): Headline {
  if (!status.found) return { label: 'No PR for this branch', tone: 'muted' };
  if (status.state === 'MERGED') return { label: 'Merged', tone: 'good' };
  if (status.state === 'CLOSED') return { label: 'Closed', tone: 'muted' };
  if (status.isDraft) return { label: 'Draft', tone: 'muted' };
  if (status.mergeable === 'CONFLICTING') return { label: 'Merge conflicts', tone: 'bad' };
  if (status.checks.some(checkIsFailed)) return { label: 'Checks failing', tone: 'bad' };
  if (status.checks.some(checkIsPending)) return { label: 'Checks running', tone: 'warn' };
  if (status.mergeStateStatus === 'BEHIND') return { label: 'Behind base branch', tone: 'warn' };
  if (status.reviewDecision === 'CHANGES_REQUESTED') return { label: 'Changes requested', tone: 'warn' };
  if (status.reviewDecision === 'REVIEW_REQUIRED') return { label: 'Waiting for review', tone: 'warn' };
  return { label: 'Ready to merge', tone: 'good' };
}

const TONE_CLASSES: Record<Headline['tone'], string> = {
  good: 'border-mn-cyan/25 bg-mn-cyan/10 text-mn-cyan',
  warn: 'border-mn-yellow/25 bg-mn-yellow/10 text-mn-yellow',
  bad: 'border-mn-red/25 bg-mn-red/10 text-mn-red',
  muted: 'border-mn-border bg-black/10 text-mn-muted',
};

function CheckIcon({ check }: { check: WorkspacePrCheck }) {
  if (checkIsPending(check)) return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-mn-yellow" />;
  if (checkIsFailed(check)) return <XCircle className="h-3.5 w-3.5 shrink-0 text-mn-red" />;
  if ((check.conclusion ?? '') === 'SKIPPED' || (check.conclusion ?? '') === 'NEUTRAL') {
    return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-mn-muted/60" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-mn-cyan" />;
}

function openExternalUrl(url: string): void {
  void invokeCommand<void>('open_external_url', { url }).catch(() => {});
}

function buildFixChecksPrompt(failing: WorkspacePrCheck[]): string {
  const names = failing.map((check) => `- ${check.name}`).join('\n');
  return `CI checks are failing on this branch's pull request:
${names}

Investigate and fix them:
1. Run \`gh pr checks\` to confirm the current state, then \`gh run view --log-failed\` (pick the failing run) to read the failure logs.
2. Reproduce the failures locally where practical, fix the underlying problems, and verify the fix.
3. Commit with a clear message and push so CI re-runs.
Report what was failing and what you changed.`;
}

interface PrChecksSectionProps {
  workspaceId: string;
}

/**
 * GitHub PR status + CI checks for the current branch, shown at the top of
 * the Inspector's Checks tab (above local run commands). Includes a one-click
 * "Fix with Claude" that sends the failing checks to the workspace agent.
 */
export function PrChecksSection({ workspaceId }: PrChecksSectionProps) {
  const [status, setStatus] = useState<WorkspacePrStatus | null>(() => getCachedWorkspacePrStatus(workspaceId));
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [fixMessage, setFixMessage] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    getWorkspacePrStatus(workspaceId)
      .then((next) => {
        setStatus(next);
        setUpdatedAt(new Date());
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [workspaceId]);

  useEffect(() => {
    setStatus(getCachedWorkspacePrStatus(workspaceId));
    setUpdatedAt(null);
    setFixMessage(null);
    const handle = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(handle);
  }, [refresh, workspaceId]);

  const failingChecks = useMemo(() => status?.checks.filter(checkIsFailed) ?? [], [status]);
  const hasPendingChecks = status?.checks.some(checkIsPending) ?? false;

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, hasPendingChecks ? POLL_PENDING_MS : POLL_SETTLED_MS);
    return () => window.clearInterval(interval);
  }, [hasPendingChecks, refresh]);

  const headline = useMemo(() => (status ? deriveHeadline(status) : null), [status]);

  const fixWithClaude = useCallback(() => {
    if (failingChecks.length === 0 || fixBusy) return;
    setFixBusy(true);
    setFixMessage(null);
    queueWorkspaceAgentPrompt({
      workspaceId,
      prompt: buildFixChecksPrompt(failingChecks),
    })
      .then(() => setFixMessage('Sent to the agent — watch the terminal.'))
      .catch((err) => setFixMessage(err instanceof Error ? err.message : String(err)))
      .finally(() => setFixBusy(false));
  }, [failingChecks, fixBusy, workspaceId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-mn-text">
          <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-mn-muted" />
          {status?.found && status.number ? (
            <button
              type="button"
              onClick={() => status.url && openExternalUrl(status.url)}
              title={status.title ?? undefined}
              className="flex min-w-0 items-center gap-1 hover:text-mn-cyan"
            >
              <span className="truncate">PR #{status.number}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          ) : (
            <span className="truncate">Pull request</span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          title="Refresh PR status"
          className="rounded p-1 text-mn-muted hover:bg-white/5 hover:text-mn-text"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {headline && (
        <div className={`rounded border px-2 py-1.5 text-xs font-semibold ${TONE_CLASSES[headline.tone]}`}>
          {headline.label}
        </div>
      )}

      {status?.found && (
        status.checks.length === 0 ? (
          <p className="text-xs text-mn-muted">No CI checks reported.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {status.checks.map((check, index) => (
              <li key={`${check.name}-${index}`}>
                <button
                  type="button"
                  onClick={() => check.url && openExternalUrl(check.url)}
                  disabled={!check.url}
                  title={check.conclusion ?? check.status}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-mn-text/80 enabled:hover:bg-white/5 disabled:cursor-default"
                >
                  <CheckIcon check={check} />
                  <span className="truncate">{check.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {failingChecks.length > 0 && (
        <Button variant="outline" size="xs" disabled={fixBusy} onClick={fixWithClaude} className="w-full border-mn-red/25 text-mn-red hover:bg-mn-red/10">
          <Wand2 className="h-3.5 w-3.5" />
          {fixBusy ? 'Sending…' : `Fix ${failingChecks.length} failing check${failingChecks.length === 1 ? '' : 's'} with Claude`}
        </Button>
      )}
      {fixMessage && <p className="text-xs text-mn-muted">{fixMessage}</p>}

      {status && !status.found && (
        <p className="text-xs leading-snug text-mn-muted">
          Push this branch and create a PR to see CI checks here.
        </p>
      )}

      {updatedAt && (
        <p className="text-[10px] text-mn-dim">
          Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </div>
  );
}
