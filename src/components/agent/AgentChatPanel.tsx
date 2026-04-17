import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  FileCode2,
  GitPullRequest,
  Hammer,
  ListChecks,
  MessageSquare,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { AgentChatEvent, AgentChatNextAction, AgentChatSession } from '../../types/agent-chat';
import type { AgentRunSection, AgentWorkbenchSummary } from '../../lib/agent-workbench';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

const TIMELINE_EVENT_TYPES = new Set(['file_change', 'file_read', 'command', 'test_run', 'tool_call', 'tool_result']);

export function AgentChatPanel({
  session,
  events,
  sections,
  summary,
  nextActions,
  acceptedPlanId,
  onInterrupt,
  onAction,
}: {
  session: AgentChatSession;
  events: AgentChatEvent[];
  sections: AgentRunSection[];
  summary?: AgentWorkbenchSummary | null;
  nextActions?: AgentChatNextAction[];
  acceptedPlanId?: string | null;
  onInterrupt: () => void;
  onAction?: (action: AgentChatNextAction, event?: AgentChatEvent) => void;
}) {
  const [tab, setTab] = useState<'chat' | 'raw'>('chat');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const running = session.status === 'running';
  const handleAction = (action: AgentChatNextAction, event?: AgentChatEvent) => {
    if (action.kind === 'open_diagnostics') setTab('raw');
    onAction?.(action, event);
  };

  useEffect(() => {
    if (tab === 'chat') bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [events.length, tab]);

  const hasSummary = !!summary && summary.changedFileCount > 0;
  const hasNextActions = (nextActions ?? []).length > 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-forge-border bg-forge-bg">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'chat' | 'raw')} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-forge-border bg-forge-surface px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-3.5 w-3.5 shrink-0 text-forge-orange" />
            <h2 className="truncate text-sm font-semibold text-forge-text">{session.title}</h2>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TabsList>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>
            {running && (
              <Button type="button" variant="destructive" size="xs" onClick={onInterrupt}>
                Interrupt
              </Button>
            )}
          </div>
        </div>

        {(hasSummary || hasNextActions) && (
          <ResultStrip summary={summary ?? null} nextActions={nextActions ?? []} onAction={handleAction} />
        )}

        <TabsContent value="raw">
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#08090c] p-3 font-mono text-xs leading-relaxed text-forge-text/85">
            {session.rawOutput || 'No raw diagnostic output yet.'}
          </pre>
        </TabsContent>

        <TabsContent value="chat">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="flex flex-col gap-3">
              {events.length === 0 && <EmptyChat provider={session.provider} />}
              {sections.map((section) => (
                <AgentRunSectionView
                  key={section.kind}
                  section={section}
                  acceptedPlanId={acceptedPlanId}
                  onAction={handleAction}
                />
              ))}
              {running && <RunningCard />}
              <div ref={bottomRef} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') return <Badge variant="success" dot>{status}</Badge>;
  if (status === 'failed' || status === 'interrupted') return <Badge variant="destructive" dot>{status}</Badge>;
  if (status === 'succeeded') return <Badge variant="info">{status}</Badge>;
  return <Badge>{status}</Badge>;
}

function ResultStrip({
  summary,
  nextActions,
  onAction,
}: {
  summary: AgentWorkbenchSummary | null;
  nextActions: AgentChatNextAction[];
  onAction?: (action: AgentChatNextAction) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-forge-border px-3 py-1.5 text-xs text-forge-muted">
      {summary && (
        <>
          <span className="font-semibold text-forge-text">{summary.changedFileCount} changed</span>
          <span>{summary.reviewedFileCount}/{summary.changedFileCount} reviewed</span>
          <span>tests: <span className="text-forge-text">{summary.testStatus}</span></span>
          <span>risk: <span className="text-forge-text">{summary.mergeRisk}</span></span>
          {summary.prCommentCount > 0 && (
            <span className="text-forge-yellow">{summary.prCommentCount} PR comment{summary.prCommentCount === 1 ? '' : 's'}</span>
          )}
          {summary.warnings.slice(0, 2).map((warning) => (
            <span key={warning} className="text-forge-yellow">{warning}</span>
          ))}
        </>
      )}
      {nextActions.length > 0 && (
        <div className="ml-auto flex flex-wrap gap-1">
          {nextActions.map((action) => (
            <ActionButton key={action.id} action={action} onClick={() => onAction?.(action)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentRunSectionView({
  section,
  acceptedPlanId,
  onAction,
}: {
  section: AgentRunSection;
  acceptedPlanId?: string | null;
  onAction?: (action: AgentChatNextAction, event?: AgentChatEvent) => void;
}) {
  const visibleEvents = section.events.filter((event) => !shouldOmitEvent(event));
  if (visibleEvents.length === 0) return null;

  if (section.kind === 'conversation') {
    return (
      <div className="space-y-3">
        {visibleEvents.map((event) => (
          <AgentEventCard key={event.id} event={event} accepted={acceptedPlanId === event.id} onAction={onAction} />
        ))}
      </div>
    );
  }

  const icon = section.kind === 'planning'
    ? <ListChecks className="h-3 w-3 text-forge-blue" />
    : section.kind === 'actions'
      ? <Hammer className="h-3 w-3 text-forge-yellow" />
      : section.kind === 'results'
        ? <CheckCircle2 className="h-3 w-3 text-forge-green" />
        : <Terminal className="h-3 w-3 text-forge-red" />;

  const hasOnlyTimelineEvents = visibleEvents.every((event) => TIMELINE_EVENT_TYPES.has(event.eventType) || isCompactStatusEvent(event));

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-forge-muted">
        {icon}
        {section.title}
      </div>
      <div className={hasOnlyTimelineEvents ? 'border-l border-forge-border/40 pl-2.5 py-1' : 'space-y-3'}>
        {visibleEvents.map((event) => (
          <AgentEventCard key={event.id} event={event} accepted={acceptedPlanId === event.id} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function shouldOmitEvent(event: AgentChatEvent): boolean {
  if (event.eventType === 'thinking') return true;
  if (event.eventType === 'tool_result') return true;
  if (event.eventType === 'status' && event.status === 'running') return true;
  if (event.eventType === 'status' && event.status === 'succeeded') return true;
  if (event.eventType === 'result') return true;
  return false;
}

function isCompactStatusEvent(event: AgentChatEvent): boolean {
  return event.eventType === 'status' && (event.status === 'succeeded' || event.status === 'failed');
}

function EmptyChat({ provider }: { provider: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center text-center">
      <div className="max-w-sm">
        <MessageSquare className="mx-auto mb-3 h-7 w-7 text-forge-muted" />
        <h3 className="text-sm font-semibold text-forge-text">Start a clean agent chat</h3>
        <p className="mt-1 text-xs leading-relaxed text-forge-muted">
          Send a prompt to {provider === 'codex' ? 'Codex' : 'Claude'} and Forge will render structured workbench events here instead of raw terminal output.
        </p>
      </div>
    </div>
  );
}

function AgentEventCard({
  event,
  accepted,
  onAction,
}: {
  event: AgentChatEvent;
  accepted?: boolean;
  onAction?: (action: AgentChatNextAction, event?: AgentChatEvent) => void;
}) {
  if (event.eventType === 'user_message') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded bg-forge-orange px-3 py-2 text-sm leading-relaxed text-white">
          {event.body}
        </div>
      </div>
    );
  }

  if (event.eventType === 'assistant_message') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[86%] rounded border border-forge-border bg-forge-surface px-3 py-2 text-sm leading-relaxed text-forge-text">
          <MarkdownishText text={event.body} />
        </div>
      </div>
    );
  }

  // Compact single-line status events
  if (event.eventType === 'status' && event.status === 'succeeded') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs text-forge-muted">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-forge-green" />
        <span>{event.body || 'Done'}</span>
      </div>
    );
  }
  if (event.eventType === 'status' && event.status === 'failed') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs text-forge-muted">
        <XCircle className="h-3 w-3 shrink-0 text-forge-red" />
        <span className="text-forge-red">{event.body || 'Failed'}</span>
      </div>
    );
  }

  // Compact timeline rows for tool/action events
  if (TIMELINE_EVENT_TYPES.has(event.eventType)) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-forge-muted">
        {timelineIconForEvent(event)}
        <span className="min-w-0 flex-1 truncate">{event.title || labelForEvent(event.eventType)}</span>
        {event.status && (
          <span className={`shrink-0 text-[10px] ${event.status === 'succeeded' || event.status === 'done' ? 'text-forge-green/70' : event.status === 'failed' ? 'text-forge-red/70' : 'text-forge-dim'}`}>
            {event.status}
          </span>
        )}
      </div>
    );
  }

  // Full card for plan, todo, result, error, next_action, and anything else
  const isPlan = event.eventType === 'plan' || event.eventType === 'todo';
  const isResult = event.eventType === 'result';
  const isError = event.eventType === 'error';
  const eventActions: AgentChatNextAction[] = isPlan
    ? [
      { id: 'accept-plan', label: accepted ? 'Plan accepted' : 'Accept Plan', kind: 'accept_plan', tone: 'primary' },
      { id: 'ask-followup', label: 'Ask follow-up', kind: 'ask_followup' },
      { id: 'switch-to-act', label: 'Switch to Act', kind: 'switch_to_act' },
      { id: 'copy-plan', label: 'Copy Plan', kind: 'copy_plan' },
    ]
    : event.metadata?.nextActions ?? [];

  const accentClass = isPlan
    ? 'border-l-forge-blue/60'
    : isResult
      ? 'border-l-forge-green/60'
      : isError
        ? 'border-l-forge-red/60'
        : 'border-l-forge-border/50';

  return (
    <div className={`border-l-2 pl-3 py-1.5 ${accentClass}`}>
      <div className="mb-1 flex items-center gap-2">
        {iconForEvent(event)}
        <span className="text-xs font-semibold uppercase tracking-widest text-forge-muted">{event.title || labelForEvent(event.eventType)}</span>
        {accepted && <span className="rounded border border-forge-green/25 bg-forge-green/10 px-1.5 py-0.5 text-[9px] uppercase text-forge-green">accepted</span>}
      </div>
      {event.body && (isPlan ? <MarkdownishText text={event.body} /> : <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-forge-text/85">{event.body}</pre>)}
      {!!eventActions.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {eventActions.map((action) => (
            <ActionButton key={action.id} action={action} disabled={accepted && action.kind === 'accept_plan'} onClick={() => onAction?.(action, event)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, disabled, onClick }: { action: AgentChatNextAction; disabled?: boolean; onClick?: () => void }) {
  const variant = action.tone === 'primary'
    ? 'default' as const
    : action.tone === 'warning'
      ? 'warning' as const
      : action.tone === 'danger'
        ? 'destructive' as const
        : 'secondary' as const;
  return (
    <Button type="button" variant={variant} size="xs" disabled={disabled} onClick={onClick}>
      {action.label}
    </Button>
  );
}

function RunningCard() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded border border-forge-border bg-forge-surface/50 px-2 py-1 text-xs text-forge-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-green" />
        Agent is working…
      </div>
    </div>
  );
}

function MarkdownishText({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/\n{2,}/), [text]);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-forge-text">
      {blocks.map((block, index) => <p key={index} className="whitespace-pre-wrap break-words">{block}</p>)}
    </div>
  );
}

function timelineIconForEvent(event: AgentChatEvent) {
  if (event.eventType === 'command' || event.eventType === 'test_run') return <Terminal className="h-3 w-3 shrink-0 text-forge-blue/70" />;
  if (event.eventType === 'file_change') return <FileCode2 className="h-3 w-3 shrink-0 text-forge-green/70" />;
  if (event.eventType === 'file_read') return <Search className="h-3 w-3 shrink-0 text-forge-blue/70" />;
  return <Hammer className="h-3 w-3 shrink-0 text-forge-yellow/70" />;
}

function iconForEvent(event: AgentChatEvent) {
  if (event.eventType === 'command' || event.eventType === 'test_run') return <Terminal className="h-3.5 w-3.5 text-forge-blue" />;
  if (event.eventType === 'file_change') return <FileCode2 className="h-3.5 w-3.5 text-forge-green" />;
  if (event.eventType === 'file_read') return <Search className="h-3.5 w-3.5 text-forge-blue" />;
  if (event.eventType === 'thinking') return <Bot className="h-3.5 w-3.5 animate-pulse text-forge-violet" />;
  if (event.eventType === 'plan' || event.eventType === 'todo') return <ListChecks className="h-3.5 w-3.5 text-forge-blue" />;
  if (event.eventType === 'result' || (event.eventType === 'status' && event.status === 'succeeded')) return <CheckCircle2 className="h-3.5 w-3.5 text-forge-green" />;
  if (event.eventType === 'error' || (event.eventType === 'status' && event.status === 'failed')) return <XCircle className="h-3.5 w-3.5 text-forge-red" />;
  if (event.eventType === 'next_action') return <GitPullRequest className="h-3.5 w-3.5 text-forge-orange" />;
  return <Hammer className="h-3.5 w-3.5 text-forge-yellow" />;
}

function labelForEvent(eventType: string) {
  return eventType.replace(/_/g, ' ');
}
