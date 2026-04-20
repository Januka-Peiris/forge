import { Play, Pause, CheckCircle2, AlertCircle, GitMerge, HelpCircle, Bot, Zap, type LucideIcon } from 'lucide-react';
import type { WorkspaceStatus, AgentType } from '../../types';
import { Badge, type BadgeProps } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export function StatusBadge({ status, iconOnly = false }: { status: WorkspaceStatus; iconOnly?: boolean }) {
  const config: { icon: LucideIcon; variant: BadgeProps['variant']; animate: boolean; label?: string; description?: string } = ({
    Running: { icon: Play, variant: 'success' as const, animate: true },
    Waiting: { icon: Pause, variant: 'warning' as const, animate: false, label: 'Ready', description: 'Ready for an agent instruction' },
    'Review Ready': { icon: CheckCircle2, variant: 'info' as const, animate: false },
    Blocked: { icon: AlertCircle, variant: 'destructive' as const, animate: false },
    Merged: { icon: GitMerge, variant: 'violet' as const, animate: false },
  } as const)[status] || { icon: HelpCircle, variant: 'default' as const, animate: false };

  const Icon = config.icon;
  const label = config.label ?? status;
  const description = config.description ?? `Status: ${status}`;

  const content = (
    <Badge variant={config.variant} dot animateDot={config.animate}>
      <Icon className="h-3 w-3 mr-1" />
      {!iconOnly && label}
    </Badge>
  );

  if (iconOnly) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="outline-none focus:ring-0">
            <Badge variant={config.variant} dot animateDot={config.animate} className="px-1.5 py-1">
              <Icon className="h-3.5 w-3.5" />
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2 text-ui-label font-semibold">
          {description}
        </PopoverContent>
      </Popover>
    );
  }

  return content;
}

export function AgentBadge({ agent, iconOnly = false }: { agent: AgentType; iconOnly?: boolean }) {
  const configs: Record<string, { icon: LucideIcon; variant: BadgeProps['variant'] }> = {
    'Claude Code': { icon: Bot, variant: 'violet' as const },
    'Codex': { icon: Zap, variant: 'success' as const },
    'Local LLM': { icon: Bot, variant: 'default' as const },
  };

  const config = configs[agent] || { icon: Bot, variant: 'default' };

  const Icon = config.icon;

  const content = (
    <Badge variant={config.variant}>
      <Icon className="h-3 w-3 mr-1" />
      {!iconOnly && agent}
    </Badge>
  );

  if (iconOnly) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="outline-none focus:ring-0">
            <Badge variant={config.variant} className="px-1.5 py-1">
              <Icon className="h-3.5 w-3.5" />
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2 text-ui-label font-semibold">
          Agent: {agent}
        </PopoverContent>
      </Popover>
    );
  }

  return content;
}
