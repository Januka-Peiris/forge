import { memo, useMemo } from 'react';
import { GitBranch, GitPullRequest } from 'lucide-react';
import type { Workspace } from '../../types';
import { Tooltip } from '../ui/tooltip';

interface WorkspaceListItemProps {
  workspace: Workspace;
  isSelected?: boolean;
  isHovered?: boolean;
  showRepo?: boolean;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  actions?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  totalAdds?: number;
  totalDels?: number;
}

function WorkspaceListItemBase({
  workspace,
  isSelected,
  isHovered,
  showRepo = true,
  className = '',
  onClick,
  onMouseEnter,
  onMouseLeave,
  actions,
  prefix,
  suffix,
  totalAdds = 0,
  totalDels = 0,
}: WorkspaceListItemProps) {
  
  const Icon = workspace.prStatus ? GitPullRequest : GitBranch;
  
  const iconColorClass = useMemo(() => {
    if (workspace.status === 'Running') return 'text-forge-orange';
    if (workspace.status === 'Blocked') return 'text-forge-red';
    if (workspace.status === 'Review Ready') return 'text-forge-violet';
    if (workspace.status === 'Merged') return 'text-forge-violet opacity-60';
    if (workspace.status === 'Waiting') return 'text-forge-blue opacity-80';
    
    if (workspace.prStatus === 'Open') return 'text-forge-green';
    if (workspace.prStatus === 'Draft') return 'text-forge-muted';
    if (workspace.prStatus === 'Merged') return 'text-forge-violet opacity-60';
    if (workspace.prStatus === 'Closed') return 'text-forge-red opacity-60';
    
    return 'text-forge-muted';
  }, [workspace.status, workspace.prStatus]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative rounded-md transition-all duration-200 group overflow-hidden py-1 px-2 cursor-pointer ${
        isSelected
          ? 'bg-forge-green/12 border border-forge-green/30 shadow-sm'
          : 'border border-transparent hover:bg-forge-surface-overlay'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {prefix}
        
        <Tooltip content={`${workspace.status}${workspace.prStatus ? ` · PR ${workspace.prStatus}` : ''}`} side="right">
          <div className={`shrink-0 transition-colors ${iconColorClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-xs font-semibold truncate ${isSelected ? 'text-forge-text' : 'text-forge-text/90'}`}>
              {workspace.name}
            </h3>
            
            {!isHovered && (totalAdds > 0 || totalDels > 0) && (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  {totalAdds > 0 && <span className="text-forge-green">+{totalAdds}</span>}
                  {totalDels > 0 && <span className="text-forge-red">-{totalDels}</span>}
                </div>
                {suffix}
              </div>
            )}
            {!isHovered && totalAdds === 0 && totalDels === 0 && suffix && (
              <div className="flex items-center shrink-0">
                {suffix}
              </div>
            )}
          </div>
          
          {(showRepo || workspace.status === 'Running') && (
            <div className="flex items-center gap-2 mt-0.5">
              {showRepo && (
                <span className="text-[10px] text-forge-muted truncate max-w-[120px]">
                  {workspace.repo}
                </span>
              )}
              {showRepo && workspace.status === 'Running' && (
                <span className="text-forge-muted/30">·</span>
              )}
              {workspace.status === 'Running' && (
                <Tooltip content="Agent Running" side="bottom">
                  <span className="flex items-center gap-1 text-[10px] text-forge-orange animate-pulse cursor-help">
                    <span className="w-1 h-1 rounded-full bg-forge-orange" />
                    running
                  </span>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {isHovered && actions && (
          <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center pl-4 bg-gradient-to-l ${isSelected ? 'from-[#0d1a14] via-[#0d1a14]' : 'from-forge-surface via-forge-surface'} to-transparent h-[80%] rounded-r-md`}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export const WorkspaceListItem = memo(WorkspaceListItemBase, (prev, next) => (
  prev.workspace.id === next.workspace.id
  && prev.workspace.name === next.workspace.name
  && prev.workspace.repo === next.workspace.repo
  && prev.workspace.status === next.workspace.status
  && prev.workspace.prStatus === next.workspace.prStatus
  && prev.isSelected === next.isSelected
  && prev.isHovered === next.isHovered
  && prev.showRepo === next.showRepo
  && prev.className === next.className
  && prev.totalAdds === next.totalAdds
  && prev.totalDels === next.totalDels
  && prev.prefix === next.prefix
  && prev.suffix === next.suffix
  && prev.actions === next.actions
));

