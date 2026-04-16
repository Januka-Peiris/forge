import type { ElementType } from 'react';
import { CheckCircle2, Clock, XCircle, Zap } from 'lucide-react';
import type { AgentPromptEntry } from '../../types';

interface PromptQueueStripProps {
  entries: AgentPromptEntry[];
  busy: boolean;
  onRunNext: () => void;
}

interface StatusConfig {
  icon: ElementType;
  colorClass: string;
  label: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  queued:      { icon: Clock,         colorClass: 'text-forge-orange/80',  label: 'queued' },
  sent:        { icon: Zap,           colorClass: 'text-forge-blue',        label: 'sent' },
  succeeded:   { icon: CheckCircle2,  colorClass: 'text-forge-green',       label: 'done' },
  failed:      { icon: XCircle,       colorClass: 'text-forge-red',         label: 'failed' },
  stopped:     { icon: XCircle,       colorClass: 'text-forge-red/70',      label: 'stopped' },
  interrupted: { icon: XCircle,       colorClass: 'text-forge-yellow',      label: 'interrupted' },
};

function statusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? { icon: Zap, colorClass: 'text-forge-muted', label: status };
}

function PromptEntryRow({ entry }: { entry: AgentPromptEntry }) {
  const { icon: Icon, colorClass, label } = statusConfig(entry.status);
  return (
    <div className="flex items-start gap-2 border-b border-forge-border/30 px-2.5 py-1.5 last:border-0">
      <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${colorClass}`} />
      <p className="min-w-0 flex-1 truncate text-[11px] text-forge-text/90">{entry.prompt}</p>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${colorClass}`}>
        {label}
      </span>
    </div>
  );
}

export function PromptQueueStrip({ entries, busy, onRunNext }: PromptQueueStripProps) {
  const queued = entries.filter((e) => e.status === 'queued');

  if (queued.length === 0) return null;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-forge-border/60 bg-[#08090c]">
      <div className="flex items-center justify-between border-b border-forge-border/40 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-forge-muted">
            Message Queue
          </span>
          <span className="rounded-full border border-forge-orange/25 bg-forge-orange/10 px-1.5 py-0.5 text-[9px] font-bold text-forge-orange">
            {queued.length} pending
          </span>
        </div>
        <button
          disabled={busy}
          onClick={onRunNext}
          className="rounded px-2 py-0.5 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/10 disabled:opacity-50"
        >
          Run Next
        </button>
      </div>
      <div className="max-h-[112px] overflow-y-auto">
        {queued.map((entry) => (
          <PromptEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
