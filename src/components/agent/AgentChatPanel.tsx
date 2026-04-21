import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  GitPullRequest,
  Hammer,
  LayoutList,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { AgentChatEvent, AgentChatNextAction, AgentChatSession } from '../../types/agent-chat';
import type { AgentRunSection, AgentWorkbenchSummary } from '../../lib/agent-workbench';
import { latestPlanEvent } from '../../lib/agent-workbench';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

const TIMELINE_EVENT_TYPES = new Set(['file_change', 'file_read', 'command', 'test_run', 'tool_call', 'tool_result']);

export function AgentChatPanel({
  session,
  events,
  sections,
  summary,
  nextActions,
  acceptedPlanId,
  onAction,
}: {
  session: AgentChatSession;
  events: AgentChatEvent[];
  sections: AgentRunSection[];
  summary?: AgentWorkbenchSummary | null;
  nextActions?: AgentChatNextAction[];
  acceptedPlanId?: string | null;
  onAction?: (action: AgentChatNextAction, event?: AgentChatEvent) => void;
}) {
  const [tab, setTab] = useState<'chat' | 'raw' | 'plan'>('chat');
  const [chatMode, setChatMode] = useState<'clean' | 'full'>('clean');
  const latestPlan = latestPlanEvent(events);
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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-forge-bg">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'chat' | 'raw' | 'plan')} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-1.5 border-b border-forge-border/40 bg-black/5">
          <div className="flex items-center gap-3">
            {tab === 'chat' && (
              <div className="flex items-center gap-2">
                <span title="Conversation-first view: hides compact tool, file, and command timeline events." className={`text-[10px] font-bold uppercase tracking-tight ${chatMode === 'clean' ? 'text-forge-text/85' : 'text-forge-muted'}`}>Chat</span>
                <Switch 
                  title="Toggle between Chat and Activity views"
                  checked={chatMode === 'full'} 
                  onCheckedChange={(full) => setChatMode(full ? 'full' : 'clean')} 
                />
                <span title="Activity view: includes compact tool, file, command, and test timeline events." className={`text-[10px] font-bold uppercase tracking-tight ${chatMode === 'full' ? 'text-forge-text/85' : 'text-forge-muted'}`}>Activity</span>
              </div>
            )}
          </div>
          <TabsList className="bg-transparent h-7 p-0 gap-1">
            <TabsTrigger value="chat" className="h-6 text-[11px] px-2 data-[state=active]:bg-white/10">
              <MessageSquareText className="w-3 h-3 mr-1" />
              Chat
            </TabsTrigger>
            {latestPlan && (
              <TabsTrigger value="plan" className={`h-6 text-[11px] px-2 data-[state=active]:bg-white/10 ${!acceptedPlanId ? 'data-[state=inactive]:text-forge-blue/70' : ''}`}>
                <LayoutList className="w-3 h-3 mr-1" />
                Plan
              </TabsTrigger>
            )}
            <TabsTrigger value="raw" className="h-6 text-[11px] px-2 data-[state=active]:bg-white/10">Raw</TabsTrigger>
          </TabsList>
        </div>

        {(hasSummary || hasNextActions) && (
          <ResultStrip summary={summary ?? null} nextActions={nextActions ?? []} onAction={handleAction} />
        )}

        <TabsContent value="plan">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {latestPlan ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-forge-blue" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-forge-muted">
                    {latestPlan.title || 'Plan'}
                  </span>
                  {acceptedPlanId === latestPlan.id && (
                    <span className="rounded border border-forge-green/25 bg-forge-green/10 px-1.5 py-0.5 text-[9px] uppercase text-forge-green">accepted</span>
                  )}
                </div>
                <MarkdownishText text={latestPlan.body} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {([
                    { id: 'accept-plan', label: acceptedPlanId === latestPlan.id ? 'Plan accepted' : 'Accept Plan', kind: 'accept_plan', tone: 'primary' },
                    { id: 'copy-plan', label: 'Copy Plan', kind: 'copy_plan' },
                    { id: 'switch-to-act', label: 'Switch to Act', kind: 'switch_to_act' },
                  ] as AgentChatNextAction[]).map((action) => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      disabled={acceptedPlanId === latestPlan.id && action.kind === 'accept_plan'}
                      onClick={() => handleAction(action, latestPlan)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-forge-muted">No plan yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-forge-bg p-3 font-mono text-xs leading-relaxed text-forge-text/85">
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
                  chatMode={chatMode}
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

function sectionSummary(events: AgentChatEvent[]): string {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const key =
      e.eventType === 'file_read' ? 'read' :
      e.eventType === 'file_change' ? 'edit' :
      e.eventType === 'command' || e.eventType === 'test_run' ? 'command' :
      e.eventType === 'tool_call' ? 'tool call' : null;
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, n]) => `${n} ${k}${n === 1 ? '' : k === 'read' || k === 'edit' ? 's' : 's'}`)
    .join(' · ');
}

function AgentRunSectionView({
  section,
  acceptedPlanId,
  chatMode,
  onAction,
}: {
  section: AgentRunSection;
  acceptedPlanId?: string | null;
  chatMode: 'clean' | 'full';
  onAction?: (action: AgentChatNextAction, event?: AgentChatEvent) => void;
}) {
  const defaultCollapsed = section.kind === 'actions';
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const visibleEvents = section.events.filter((event) => !shouldOmitEvent(event, chatMode));
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
  const summary = sectionSummary(visibleEvents);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-forge-muted hover:text-forge-text/80"
      >
        <ChevronRight className={`h-2.5 w-2.5 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        {icon}
        <span>{section.title}</span>
        {collapsed && summary && (
          <span className="ml-0.5 font-normal normal-case tracking-normal text-forge-muted/55">{summary}</span>
        )}
      </button>
      {!collapsed && (
        <div className={hasOnlyTimelineEvents ? 'border-l border-forge-border/40 pl-2.5 py-1' : 'space-y-3'}>
          {visibleEvents.map((event) => (
            <AgentEventCard key={event.id} event={event} accepted={acceptedPlanId === event.id} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function shouldOmitEvent(event: AgentChatEvent, chatMode: 'clean' | 'full'): boolean {
  if (chatMode === 'clean' && TIMELINE_EVENT_TYPES.has(event.eventType)) return true;
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
          Send a prompt to {provider === 'codex' ? 'Codex' : provider === 'kimi_code' ? 'Kimi' : 'Claude'} and Forge will render structured workbench events here instead of raw terminal output.
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
        <div className="max-w-[78%] rounded bg-forge-green/55 px-3 py-2 text-sm leading-relaxed text-white">
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
    return <TimelineEventRow event={event} />;
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
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-green/55" />
        Agent is working…
      </div>
    </div>
  );
}

function inlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) parts.push(<strong key={key++} className="font-semibold text-forge-text">{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(<code key={key++} className="rounded bg-forge-bg px-1 py-0.5 font-mono text-xs text-forge-green">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function MarkdownishText({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n');
    const out: ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Fenced code block
      if (line.startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
        out.push(
          <pre key={i} className="mb-2 overflow-x-auto rounded border border-forge-border bg-forge-bg">
            <code className="block px-3 py-2 font-mono text-xs leading-relaxed text-forge-text/90">{codeLines.join('\n')}</code>
          </pre>
        );
        i++; continue;
      }
      // Headings
      const h1 = /^# (.+)/.exec(line); if (h1) { out.push(<h1 key={i} className="mb-2 text-base font-bold text-forge-text">{inlineMarkdown(h1[1])}</h1>); i++; continue; }
      const h2 = /^## (.+)/.exec(line); if (h2) { out.push(<h2 key={i} className="mb-1.5 text-sm font-bold text-forge-text">{inlineMarkdown(h2[1])}</h2>); i++; continue; }
      const h3 = /^### (.+)/.exec(line); if (h3) { out.push(<h3 key={i} className="mb-1 text-sm font-semibold text-forge-text">{inlineMarkdown(h3[1])}</h3>); i++; continue; }
      // HR
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { out.push(<hr key={i} className="my-2 border-forge-border/50" />); i++; continue; }
      // Blockquote
      if (line.startsWith('> ')) { out.push(<blockquote key={i} className="mb-1 border-l-2 border-forge-border pl-3 text-forge-muted">{inlineMarkdown(line.slice(2))}</blockquote>); i++; continue; }
      // Lists
      if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
        const ordered = /^\d+\. /.test(line);
        const items: string[] = [];
        while (i < lines.length && (/^[-*] /.test(lines[i]) || /^\d+\. /.test(lines[i]))) {
          items.push(lines[i].replace(/^[-*] |^\d+\. /, '')); i++;
        }
        const Tag = ordered ? 'ol' : 'ul';
        out.push(<Tag key={i} className={`mb-2 space-y-0.5 pl-4 ${ordered ? 'list-decimal' : 'list-disc'}`}>{items.map((it, j) => <li key={j} className="text-forge-text/90">{inlineMarkdown(it)}</li>)}</Tag>);
        continue;
      }
      // Empty line
      if (line.trim() === '') { i++; continue; }
      // Paragraph: collect until blank or block-level start
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^[#>`]/.test(lines[i]) && !/^```/.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i])) {
        paraLines.push(lines[i]); i++;
      }
      if (paraLines.length > 0) out.push(<p key={i} className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{inlineMarkdown(paraLines.join('\n'))}</p>);
    }
    return out;
  }, [text]);

  return <div className="text-sm leading-relaxed text-forge-text">{blocks}</div>;
}

function TimelineEventRow({ event }: { event: AgentChatEvent }) {
  const [open, setOpen] = useState(false);
  const hasBody = !!event.body;
  const running = event.status === 'running';
  const label = shortLabelForEvent(event);
  const detail = detailForEvent(event);
  return (
    <div>
      <button
        type="button"
        disabled={!hasBody}
        onClick={() => hasBody && setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-xs text-forge-muted hover:text-forge-text/80 disabled:cursor-default"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''} ${!hasBody ? 'opacity-0' : 'opacity-60'}`}
        />
        {timelineIconForEvent(event)}
        <span className="font-medium text-forge-text/70">{label}</span>
        {detail && (
          <>
            <span className="text-forge-dim">·</span>
            <span className="min-w-0 flex-1 truncate font-mono">{detail}</span>
          </>
        )}
        {running && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-forge-green/55" />}
      </button>
      {open && hasBody && (
        <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-forge-border/40 bg-forge-bg/60 p-2 font-mono text-[11px] leading-relaxed text-forge-text/80">
          {event.body}
        </pre>
      )}
    </div>
  );
}

function shortLabelForEvent(event: AgentChatEvent): string {
  if (event.eventType === 'file_read') return 'Read';
  if (event.eventType === 'file_change') return 'Edit';
  if (event.eventType === 'command') return 'Run';
  if (event.eventType === 'test_run') return 'Test';
  return event.title || labelForEvent(event.eventType);
}

function detailForEvent(event: AgentChatEvent): string {
  const path = event.metadata?.path;
  if (path) return path.split('/').pop() ?? path;
  const cmd = event.metadata?.command;
  if (cmd) return cmd.length > 50 ? cmd.slice(0, 47) + '\u2026' : cmd;
  return '';
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
  if (event.eventType === 'next_action') return <GitPullRequest className="h-3.5 w-3.5 text-forge-green" />;
  return <Hammer className="h-3.5 w-3.5 text-forge-yellow" />;
}

function labelForEvent(eventType: string) {
  return eventType.replace(/_/g, ' ');
}
