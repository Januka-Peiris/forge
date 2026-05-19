import { ChevronRight, Loader2 } from 'lucide-react';
import type { ActivityItem as MnemonicActivityItem } from '../../types';
import type { WorkspaceCheckpoint, WorkspaceCheckpointRestorePlan } from '../../types/checkpoint';
import { Button } from '../ui/button';
import { UnifiedDiffView } from '../reviews/UnifiedDiffView';

interface ActivityRow {
  label: string;
  time: string;
}

interface ActivitySectionProps {
  activityOpen: boolean;
  timelineLoading: boolean;
  timelineItems: MnemonicActivityItem[];
  activityRows: ActivityRow[];
  workspaceId: string;
  timelineExpanded: boolean;
  onToggleOpen: () => void;
  onToggleExpanded: () => void;
}

export function ActivitySection({
  activityOpen,
  timelineLoading,
  timelineItems,
  activityRows,
  workspaceId,
  timelineExpanded,
  onToggleOpen,
  onToggleExpanded,
}: ActivitySectionProps) {
  return (
    <div className="px-4 pb-2">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center gap-1.5 text-xs font-semibold text-mn-muted hover:text-mn-text/80 uppercase tracking-widest"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${activityOpen ? 'rotate-90' : ''}`} />
        Activity
        {timelineLoading && <Loader2 className="ml-1 w-3 h-3 animate-spin" />}
      </button>
      {activityOpen && (() => {
        const allItems = timelineItems.length > 0
          ? timelineItems
          : activityRows.map((row, index) => ({
              id: String(index),
              event: row.label,
              level: 'info' as const,
              timestamp: row.time,
              repo: '',
              workspaceId,
            }));
        const visibleItems = timelineExpanded ? allItems : allItems.slice(0, 8);

        return (
          <div className="mt-1.5 space-y-0.5">
            {visibleItems.length === 0 ? (
              <p className="text-xs text-mn-muted">No activity yet.</p>
            ) : visibleItems.map((item, index) => {
              const label = 'details' in item && item.details ? `${item.event} · ${item.details}` : item.event;
              const time = 'timestamp' in item ? String(item.timestamp) : '';
              const levelColor = item.level === 'error'
                ? 'text-mn-red'
                : item.level === 'warning'
                ? 'text-mn-yellow'
                : item.level === 'success'
                ? 'text-mn-cyan'
                : 'text-mn-muted';
              return (
                <div key={index} className="flex items-baseline gap-2">
                  <span className={`shrink-0 text-xs font-mono ${levelColor}`}>›</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-mn-text/85" title={label}>{label}</span>
                  <span className="shrink-0 text-[10px] text-mn-muted/60">{time}</span>
                </div>
              );
            })}
            {allItems.length > 8 && (
              <button
                type="button"
                onClick={onToggleExpanded}
                className="mt-1 text-xs text-mn-muted hover:text-mn-text"
              >
                {timelineExpanded ? '↑ Show less' : `↓ ${allItems.length - 8} more`}
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

interface SafeIterationSectionProps {
  checkpointBusy: boolean;
  checkpointMessage: string | null;
  checkpoints: WorkspaceCheckpoint[];
  selectedCheckpointRef: string | null;
  checkpointRestorePlan: WorkspaceCheckpointRestorePlan | null;
  checkpointDiff: string | null;
  onCreateCheckpoint: () => void;
  onPreviewCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  onRestoreCheckpoint: () => void;
  onBranchFromCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  onAbandonCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
}

export function SafeIterationSection({
  checkpointBusy,
  checkpointMessage,
  checkpoints,
  selectedCheckpointRef,
  checkpointRestorePlan,
  checkpointDiff,
  onCreateCheckpoint,
  onPreviewCheckpoint,
  onRestoreCheckpoint,
  onBranchFromCheckpoint,
  onAbandonCheckpoint,
}: SafeIterationSectionProps) {
  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-mn-border bg-mn-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-mn-muted">Safe Iteration</p>
            <p className="mt-0.5 text-xs text-mn-muted">Git-backed checkpoints before risky agent turns.</p>
          </div>
          <Button variant="secondary" size="xs" disabled={checkpointBusy} onClick={onCreateCheckpoint}>
            {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Checkpoint
          </Button>
        </div>
        {checkpointMessage && <p className="mb-2 text-xs text-mn-muted">{checkpointMessage}</p>}
        {checkpoints.length === 0 ? (
          <p className="text-xs text-mn-muted">No checkpoints yet. Mnemonic creates them automatically before dirty agent runs.</p>
        ) : (
          <div className="space-y-1">
            {checkpoints.slice(0, 4).map((checkpoint) => (
              <div key={checkpoint.reference} className="rounded border border-mn-border/60 bg-black/15 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-mn-text" title={checkpoint.subject}>
                    {checkpoint.subject || 'Mnemonic checkpoint'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPreviewCheckpoint(checkpoint)}
                    className="shrink-0 rounded border border-mn-border bg-white/5 px-1.5 py-0.5 font-mono text-xs text-mn-muted hover:bg-white/10 hover:text-mn-text"
                  >
                    {selectedCheckpointRef === checkpoint.reference ? 'hide' : checkpoint.shortOid}
                  </button>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-mn-muted/70" title={checkpoint.reference}>
                  {checkpoint.reference}
                </p>
                {selectedCheckpointRef === checkpoint.reference && (
                  <div className="mt-2 space-y-2">
                    {checkpointRestorePlan && (
                      <div className="rounded border border-mn-yellow/20 bg-mn-yellow/10 px-2 py-1.5 text-xs text-mn-yellow">
                        <p className="font-semibold">Restore plan preview — no changes applied</p>
                        <p className="mt-1">
                          Current dirty files: {checkpointRestorePlan.changedFileCount} · checkpoint files: {checkpointRestorePlan.checkpointFileCount}
                        </p>
                        {checkpointRestorePlan.warnings.length > 0 && (
                          <p className="mt-1">{checkpointRestorePlan.warnings[0]}</p>
                        )}
                        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                          {checkpointRestorePlan.steps.slice(0, 3).map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        <Button
                          variant="secondary"
                          size="xs"
                          className="mt-2"
                          disabled={checkpointBusy || checkpointRestorePlan.currentDirty}
                          onClick={onRestoreCheckpoint}
                        >
                          {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Restore checkpoint
                        </Button>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={checkpointBusy}
                            onClick={() => onBranchFromCheckpoint(checkpoint)}
                          >
                            Branch from checkpoint
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={checkpointBusy}
                            className="text-mn-red/80 hover:text-mn-red"
                            onClick={() => onAbandonCheckpoint(checkpoint)}
                          >
                            Abandon checkpoint
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="max-h-72 overflow-hidden rounded border border-mn-border">
                      <UnifiedDiffView
                        diff={checkpointDiff}
                        emptyMessage="Checkpoint has no diff to preview."
                        className="max-h-72"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {checkpoints.length > 4 && (
              <p className="text-xs text-mn-muted">+{checkpoints.length - 4} more checkpoint(s)</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
