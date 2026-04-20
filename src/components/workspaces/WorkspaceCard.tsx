import { GitBranch, FileCode, Clock, GitPullRequest, ChevronRight, Eye } from 'lucide-react';
import type { Workspace } from '../../types';
import { StatusBadge, AgentBadge } from './StatusBadge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cockpitToneClass, deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';

interface WorkspaceCardProps {
  workspace: Workspace;
  isSelected: boolean;
  onSelect: () => void;
}

function FileStrip({ files }: { files: Workspace['changedFiles'] }) {
  const displayed = files.slice(0, 3);
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {displayed.map((f) => {
        const name = f.path.split('/').pop() ?? f.path;
        const colorClass =
          f.status === 'added'
            ? 'text-forge-green border-forge-green/25 bg-forge-green/5'
            : f.status === 'deleted'
            ? 'text-forge-red border-forge-red/25 bg-forge-red/5'
            : 'text-forge-muted border-forge-border bg-white/3';
        return (
          <span
            key={f.path}
            className={`text-ui-label font-mono px-1.5 py-0.5 rounded border truncate max-w-[120px] ${colorClass}`}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

export function WorkspaceCard({ workspace, isSelected, onSelect }: WorkspaceCardProps) {
  const totalAdds = workspace.changedFiles.reduce((s, f) => s + f.additions, 0);
  const totalDels = workspace.changedFiles.reduce((s, f) => s + f.deletions, 0);
  const cockpit = deriveWorkspaceCockpit(workspace);
  const task = workspace.currentTask?.trim();

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border cursor-pointer transition-all duration-200 group overflow-hidden ${
        isSelected
          ? 'border-forge-green/40 bg-forge-card shadow-forge-card ring-1 ring-forge-green/20'
          : 'border-forge-border bg-forge-card hover:border-forge-border-light hover:bg-forge-surface shadow-forge-card'
      }`}
    >
      {workspace.status === 'Running' && (
        <div className="absolute inset-0 pointer-events-none animate-background-scan opacity-100" />
      )}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-forge-green/60 via-forge-green to-forge-green/60" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-ui-body font-semibold text-forge-text leading-tight truncate mb-1">
              {workspace.name}
            </h3>
            <div className="flex items-center gap-1.5 text-ui-body text-forge-muted">
              <span className="font-medium text-forge-text/70">{workspace.repo}</span>
              <span className="text-forge-muted">/</span>
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate font-mono text-forge-muted">{workspace.branch}</span>
            </div>
          </div>
          <ChevronRight
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 transition-all ${
              isSelected ? 'text-forge-green' : 'text-forge-muted group-hover:text-forge-text/90'
            }`}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={workspace.status} iconOnly />
          <AgentBadge agent={workspace.agent} iconOnly />
          
          <Popover>
            <PopoverTrigger asChild>
              <button className={`rounded-full border px-2 py-0.5 text-ui-label font-semibold outline-none focus:ring-0 transition-all hover:scale-105 active:scale-95 ${cockpitToneClass(cockpit.nextActionTone)}`}>
                {cockpit.nextAction}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-w-[240px] text-ui-label leading-relaxed">
              <p className="font-bold mb-1">Recommended Next Action</p>
              <p className="text-forge-muted">{cockpit.trustSummary}</p>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mb-3 rounded-lg border border-forge-border/70 bg-black/10 p-2">
          <p className="line-clamp-2 text-ui-label leading-relaxed text-forge-text/85">
            {task || <span className="text-forge-muted italic">No task set yet</span>}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-ui-label">
            <span className="truncate rounded border border-forge-border bg-forge-surface-overlay px-1.5 py-1 text-forge-muted" title={cockpit.agentState}>
              Agent <span className="text-forge-text/85">· {cockpit.agentState}</span>
            </span>
            <span className="truncate rounded border border-forge-border bg-forge-surface-overlay px-1.5 py-1 text-forge-muted" title={cockpit.changeSummary}>
              Changes <span className="text-forge-text/85">· {workspace.changedFiles.length}</span>
            </span>
            <span className="truncate rounded border border-forge-border bg-forge-surface-overlay px-1.5 py-1 text-forge-muted" title={cockpit.checkSummary}>
              Checks <span className="text-forge-text/85">· {cockpit.checkSummary.replace(/^Checks /, '')}</span>
            </span>
          </div>
        </div>

        {workspace.changedFiles.length > 0 && <FileStrip files={workspace.changedFiles} />}

        <div className="mt-3 pt-3 border-t border-forge-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3 text-ui-body text-forge-muted">
            <span className="flex items-center gap-1">
              <FileCode className="w-3 h-3" />
              {workspace.changedFiles.length} files
            </span>
            <span className="flex items-center gap-1 font-mono">
              <span className="text-forge-green">+{totalAdds}</span>
              <span className="text-forge-red">-{totalDels}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {workspace.lastUpdated}
            </span>
          </div>
          {workspace.prStatus && workspace.prStatus !== 'Merged' && (
            <span className="flex items-center gap-1 text-ui-body text-forge-blue">
              <GitPullRequest className="w-3 h-3" />
              #{workspace.prNumber}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <Eye className="w-3 h-3" />
          Open cockpit
        </Button>
        {(workspace.changedFiles.length > 0 || workspace.prStatus) && (
          <span className="min-w-0 truncate text-ui-label text-forge-muted" title={`${cockpit.prSummary} · ${cockpit.trustSummary}`}>
            {cockpit.prSummary} · {cockpit.trustSummary}
          </span>
        )}
      </div>
    </div>
  );
}
