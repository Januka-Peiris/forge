import { ChevronRight, GitBranch, Layout, Box } from 'lucide-react';
import type { Workspace } from '../../types';

interface ContextHeaderProps {
  workspace: Workspace | null;
}

export function ContextHeader({ workspace }: ContextHeaderProps) {
  if (!workspace) return null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-forge-border bg-forge-bg/80 px-4 py-2 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-ui-label text-forge-muted">
        <Box className="h-3.5 w-3.5" />
        <span className="font-semibold text-forge-text/80">{workspace.repo}</span>
      </div>
      
      <ChevronRight className="h-3 w-3 text-forge-dim" />
      
      <div className="flex items-center gap-1.5 text-ui-label text-forge-muted">
        <GitBranch className="h-3.5 w-3.5" />
        <span className="font-mono">{workspace.branch}</span>
      </div>
      
      {workspace.currentTask.trim() && (
        <>
          <ChevronRight className="h-3 w-3 text-forge-dim" />
          <div className="flex min-w-0 items-center gap-1.5 text-ui-label text-forge-muted">
            <Layout className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium text-forge-green/90">
              {workspace.currentTask}
            </span>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {workspace.status === 'Running' && (
          <div className="flex items-center gap-2 rounded-full border border-forge-green/20 bg-forge-green/5 px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 animate-agent-pulse rounded-full bg-forge-green shadow-electric-glow" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-forge-green">Live Context</span>
          </div>
        )}
      </div>
    </div>
  );
}
