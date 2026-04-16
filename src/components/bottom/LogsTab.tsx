import { CheckCircle2, Info, AlertTriangle, XCircle, Layers } from 'lucide-react';
import type { LogEntry } from '../../types';

interface LogsTabProps {
  entries: LogEntry[];
}

const levelConfig = {
  info: { icon: Info, color: 'text-forge-blue', bg: 'bg-forge-blue/10' },
  success: { icon: CheckCircle2, color: 'text-forge-green', bg: 'bg-forge-green/10' },
  warning: { icon: AlertTriangle, color: 'text-forge-yellow', bg: 'bg-forge-yellow/10' },
  error: { icon: XCircle, color: 'text-forge-red', bg: 'bg-forge-red/10' },
};

export function LogsTab({ entries }: LogsTabProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#0a0d12] font-mono">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-forge-border bg-forge-surface/50 sticky top-0">
        <Layers className="w-3.5 h-3.5 text-forge-muted" />
        <span className="text-[11px] text-forge-muted">Structured event log</span>
        <span className="ml-auto text-[10px] text-forge-muted">{entries.length} events</span>
      </div>

      <div className="p-3 space-y-1">
        {entries.map((entry) => {
          const { icon: Icon, color, bg } = levelConfig[entry.level];
          return (
            <div
              key={entry.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/3 transition-colors group"
            >
              <span className="text-[10px] text-forge-muted shrink-0 font-mono tabular-nums mt-0.5 w-14">
                {entry.timestamp}
              </span>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className={`w-2.5 h-2.5 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-forge-text">{entry.event}</span>
                {entry.details && (
                  <span className="text-[10px] text-forge-muted ml-2">{entry.details}</span>
                )}
              </div>
              <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${bg} ${color} shrink-0`}>
                {entry.level}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
