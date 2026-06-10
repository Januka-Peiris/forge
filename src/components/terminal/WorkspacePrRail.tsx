import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MinusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { WorkspacePrCheck, WorkspacePrStatus } from '../../types/pr-draft';
import { getCachedWorkspacePrStatus, getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { invokeCommand } from '../../lib/tauri-api/client';

const RAIL_COLLAPSED_KEY = 'mn:pr-rail-collapsed';
/** Poll faster while CI is in flight, slower when settled. */
const POLL_PENDING_MS = 15_000;
const POLL_SETTLED_MS = 60_000;

interface WorkspacePrRailProps {
  workspaceId: string;
}

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

/**
 * Right-hand rail showing the branch's PR state and live CI checks, so push
 * results are visible without leaving the workspace (Conductor-style).
 */
export function WorkspacePrRail({ workspaceId }: WorkspacePrRailProps) {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(RAIL_COLLAPSED_KEY) === '1');
  const [status, setStatus] = useState<WorkspacePrStatus | null>(() => getCachedWorkspacePrStatus(workspaceId));
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

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

  // Initial load + workspace switches.
  useEffect(() => {
    setStatus(getCachedWorkspacePrStatus(workspaceId));
    setUpdatedAt(null);
    const handle = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(handle);
  }, [refresh, workspaceId]);

  const hasPendingChecks = status?.checks.some(checkIsPending) ?? false;
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, hasPendingChecks ? POLL_PENDING_MS : POLL_SETTLED_MS);
    return () => window.clearInterval(interval);
  }, [hasPendingChecks, refresh]);

  const headline = useMemo(() => (status ? deriveHeadline(status) : null), [status]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title={headline ? `PR: ${headline.label} — expand` : 'Show PR status'}
        className="flex shrink-0 flex-col items-center gap-2 rounded-md border border-mn-border bg-mn-bg px-1.5 py-2 text-mn-muted hover:bg-white/5 hover:text-mn-text"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <GitPullRequest className="h-3.5 w-3.5" />
        {headline && (
          <span
            className={`h-2 w-2 rounded-full ${
              headline.tone === 'good' ? 'bg-mn-cyan' : headline.tone === 'warn' ? 'bg-mn-yellow' : headline.tone === 'bad' ? 'bg-mn-red' : 'bg-mn-muted/50'
            }`}
          />
        )}
      </button>
    );
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-2 rounded-md border border-mn-border bg-mn-bg p-2">
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
              <span className="truncate">#{status.number}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          ) : (
            <span className="truncate">Pull request</span>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={refresh}
            title="Refresh PR status"
            className="rounded p-1 text-mn-muted hover:bg-white/5 hover:text-mn-text"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse"
            className="rounded p-1 text-mn-muted hover:bg-white/5 hover:text-mn-text"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {headline && (
        <div className={`rounded border px-2 py-1.5 text-xs font-semibold ${TONE_CLASSES[headline.tone]}`}>
          {headline.label}
        </div>
      )}

      {status?.found && status.title && (
        <p className="line-clamp-2 text-[11px] leading-snug text-mn-muted" title={status.title}>
          {status.title}
        </p>
      )}

      {status?.found && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-mn-dim">Checks</p>
          {status.checks.length === 0 ? (
            <p className="text-[11px] text-mn-muted">No CI checks reported.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {status.checks.map((check, index) => (
                <li key={`${check.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => check.url && openExternalUrl(check.url)}
                    disabled={!check.url}
                    title={check.conclusion ?? check.status}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-mn-text/80 enabled:hover:bg-white/5 disabled:cursor-default"
                  >
                    <CheckIcon check={check} />
                    <span className="truncate">{check.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status && !status.found && (
        <p className="text-[11px] leading-snug text-mn-muted">
          Push this branch and create a PR to see checks here.
        </p>
      )}

      {updatedAt && (
        <p className="shrink-0 text-[10px] text-mn-dim">
          Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </aside>
  );
}
