import { GitBranch, FileCode, Clock, GitPullRequest, ChevronRight, Play, Eye } from 'lucide-react';
import type { Workspace, WorkspaceStep } from '../../types';
import { StatusBadge, AgentBadge } from './StatusBadge';
import { Button } from '../ui/button';
import { cockpitToneClass, deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';

interface WorkspaceCardProps {
  workspace: Workspace;
  isSelected: boolean;
  onSelect: () => void;
}

const steps: WorkspaceStep[] = ['Planning', 'Editing', 'Testing', 'Review'];

function StepTracker({ current, completed }: { current: WorkspaceStep; completed: WorkspaceStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isDone = completed.includes(step);
        const isActive = current === step && !isDone;
        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  isDone
                    ? 'bg-forge-green'
                    : isActive
                    ? 'bg-forge-orange animate-pulse'
                    : 'bg-forge-dim'
                }`}
              />
              <span className={`text-xs font-medium whitespace-nowrap ${
                isDone ? 'text-forge-green' : isActive ? 'text-forge-orange' : 'text-forge-muted'
              }`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-4 h-px mb-3 ${isDone ? 'bg-forge-green/40' : 'bg-forge-dim/40'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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
            className={`text-xs font-mono px-1.5 py-0.5 rounded border truncate max-w-[120px] ${colorClass}`}
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

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border cursor-pointer transition-all duration-200 group overflow-hidden ${
        isSelected
          ? 'border-forge-orange/40 bg-forge-card shadow-forge-card ring-1 ring-forge-orange/20'
          : 'border-forge-border bg-forge-card hover:border-forge-border-light hover:bg-[#181e2b] shadow-forge-card'
      }`}
    >
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-forge-orange/60 via-forge-orange to-forge-orange/60" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-forge-text leading-tight truncate mb-1">
              {workspace.name}
            </h3>
            <div className="flex items-center gap-1.5 text-sm text-forge-muted">
              <span className="font-medium text-forge-text/70">{workspace.repo}</span>
              <span className="text-forge-muted">/</span>
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate font-mono text-forge-muted">{workspace.branch}</span>
            </div>
          </div>
          <ChevronRight
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 transition-all ${
              isSelected ? 'text-forge-orange' : 'text-forge-muted group-hover:text-forge-text/90'
            }`}
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status={workspace.status} />
          <AgentBadge agent={workspace.agent} />
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cockpitToneClass(cockpit.nextActionTone)}`}>
            {cockpit.nextAction}
          </span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs">
          <span className="truncate rounded border border-forge-border bg-white/5 px-2 py-1 text-forge-muted" title={cockpit.agentState}>
            Agent: <span className="text-forge-text/85">{cockpit.agentState}</span>
          </span>
          <span className="truncate rounded border border-forge-border bg-white/5 px-2 py-1 text-forge-muted" title={cockpit.checkSummary}>
            Checks: <span className="text-forge-text/85">{cockpit.checkSummary}</span>
          </span>
        </div>

        <div className="mb-3">
          <StepTracker current={workspace.currentStep} completed={workspace.completedSteps} />
        </div>

        <FileStrip files={workspace.changedFiles} />

        <div className="mt-3 pt-3 border-t border-forge-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-forge-muted">
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
            <span className="flex items-center gap-1 text-sm text-forge-blue">
              <GitPullRequest className="w-3 h-3" />
              #{workspace.prNumber}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center gap-1.5">
        <Button
          variant="default"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <Eye className="w-3 h-3" />
          Open
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <FileCode className="w-3 h-3" />
          Review Diff
        </Button>
        {(workspace.status === 'Waiting' || workspace.status === 'Blocked') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <Play className="w-3 h-3" />
            Resume
          </Button>
        )}
      </div>
    </div>
  );
}
