import { CheckCircle2, Info, AlertTriangle, XCircle, Layers } from 'lucide-react';
import { VList } from 'virtua';
import type { LogEntry } from '../../types';

interface LogsTabProps {
  entries: LogEntry[];
}

const levelConfig: Record<LogEntry['level'], { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: 'text-forge-blue', bg: 'bg-forge-blue/10' },
  success: { icon: CheckCircle2, color: 'text-forge-green', bg: 'bg-forge-green/10' },
  warning: { icon: AlertTriangle, color: 'text-forge-yellow', bg: 'bg-forge-yellow/10' },
  error: { icon: XCircle, color: 'text-forge-red', bg: 'bg-forge-red/10' },
};

export function LogsTab({ entries }: LogsTabProps) {
  return (
    <div className="flex h-full flex-col bg-forge-bg font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-forge-border bg-forge-surface/50 px-4 py-2">
        <Layers className="w-3.5 h-3.5 text-forge-muted" />
        <span className="text-ui-label text-forge-muted">Structured event log</span>
        <span className="ml-auto text-ui-caption text-forge-muted">{entries.length} events</span>
      </div>

      <div className="flex-1 min-h-0">
        <VList className="h-full" data={entries}>
          {(entry: LogEntry) => {
            const { icon: Icon, color, bg } = levelConfig[entry.level];
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-6 py-1.5 hover:bg-forge-surface-overlay transition-colors group"
              >
                <span className="text-ui-caption text-forge-muted shrink-0 font-mono tabular-nums mt-0.5 w-14">
                  {entry.timestamp}
                </span>
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`w-2.5 h-2.5 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-ui-label text-forge-text">{entry.event}</span>
                  {entry.details && (
                    <span className="text-ui-caption text-forge-muted ml-2">{entry.details}</span>
                  )}
                </div>
                <span className={`text-ui-tiny font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${bg} ${color} shrink-0`}>
                  {entry.level}
                </span>
              </div>
            );
          }}
        </VList>
      </div>
    </div>
  );
}
