import type { WorkspaceStatus, AgentType } from '../../types';

export function StatusBadge({ status }: { status: WorkspaceStatus }) {
  const config = {
    'Running': 'bg-forge-blue/15 text-forge-blue border border-forge-blue/20',
    'Waiting': 'bg-forge-yellow/10 text-forge-yellow border border-forge-yellow/15',
    'Review Ready': 'bg-forge-teal/15 text-forge-teal border border-forge-teal/20',
    'Blocked': 'bg-forge-red/15 text-forge-red border border-forge-red/20',
    'Merged': 'bg-forge-violet/15 text-forge-violet border border-forge-violet/20',
  }[status];

  const dot = {
    'Running': 'bg-forge-blue animate-pulse',
    'Waiting': 'bg-forge-yellow',
    'Review Ready': 'bg-forge-teal',
    'Blocked': 'bg-forge-red',
    'Merged': 'bg-forge-violet',
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${config}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export function AgentBadge({ agent }: { agent: AgentType }) {
  const config = {
    'Claude Code': 'bg-forge-violet/10 text-forge-violet border border-forge-violet/15',
    'Codex': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  }[agent];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${config}`}>
      {agent}
    </span>
  );
}
