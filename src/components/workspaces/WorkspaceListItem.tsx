import { GitBranch, GitPullRequest, Clock } from 'lucide-react';
import type { Workspace } from '../../types';

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
}

export function WorkspaceListItem({
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
}: WorkspaceListItemProps) {
  const totalAdds = workspace.changedFiles.reduce((s, f) => s + f.additions, 0);
  const totalDels = workspace.changedFiles.reduce((s, f) => s + f.deletions, 0);
  
  const Icon = workspace.prStatus ? GitPullRequest : GitBranch;
  const iconColorClass = 
    workspace.status === 'Running' ? 'text-forge-orange' :
    workspace.status === 'Review Ready' ? 'text-forge-violet' :
    workspace.status === 'Merged' ? 'text-forge-violet opacity-60' :
    'text-forge-muted';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative rounded-md transition-all duration-200 group overflow-hidden py-2 px-2.5 cursor-pointer ${
        isSelected
          ? 'bg-forge-green/12 border border-forge-green/30 shadow-sm'
          : 'border border-transparent hover:bg-forge-surface-overlay'
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {prefix}
        
        <div className={`shrink-0 transition-colors ${iconColorClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className={`text-sm font-semibold truncate ${isSelected ? 'text-forge-text' : 'text-forge-text/90'}`}>
              {workspace.name}
            </h3>
            
            {!isHovered && (
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className="text-forge-green">+{totalAdds}</span>
                  <span className="text-forge-red">-{totalDels}</span>
                </div>
                {suffix}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2.5 mt-0.5">
            {showRepo && (
              <>
                <span className="text-[11px] text-forge-muted truncate max-w-[120px]">
                  {workspace.repo}
                </span>
                <span className="text-forge-muted/30">·</span>
              </>
            )}
            <span className="text-[10px] text-forge-muted/70 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {workspace.lastUpdated}
            </span>

            {workspace.status === 'Running' && (
              <span className="flex items-center gap-1 text-[10px] text-forge-orange animate-pulse">
                <span className="w-1 h-1 rounded-full bg-forge-orange" />
                running
              </span>
            )}
          </div>
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
