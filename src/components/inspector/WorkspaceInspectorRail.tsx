import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ClipboardCheck, FolderTree, Gauge, Play, RefreshCw, Wrench, X } from 'lucide-react';
import type { MnemonicWorkspaceConfig, Workspace, WorkspaceReadiness, WorkspaceReviewCockpit } from '../../types';
import { getWorkspaceMnemonicConfig, runWorkspaceSetup, startWorkspaceRunCommand, stopWorkspaceRunCommands } from '../../lib/tauri-api/workspace-scripts';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { getWorkspaceReviewCockpit, syncWorkspacePrThreads } from '../../lib/tauri-api/review-cockpit';
import { WorkspaceFilesPanel } from '../terminal/WorkspaceFilesPanel';
import { PrChecksSection } from './PrChecksSection';
import { Button } from '../ui/button';

type InspectorTab = 'changes' | 'checks' | 'review' | 'files';

interface WorkspaceInspectorRailProps {
  workspace: Workspace | null;
  isOpen: boolean;
  width: number;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  onOpenReviewFile: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export function WorkspaceInspectorRail({
  workspace,
  isOpen,
  width,
  activeTab,
  onTabChange,
  onClose,
  onOpenReviewFile,
  onOpenFile,
}: WorkspaceInspectorRailProps) {
  const [config, setConfig] = useState<MnemonicWorkspaceConfig | null>(null);
  const [readiness, setReadiness] = useState<WorkspaceReadiness | null>(null);
  const [review, setReview] = useState<WorkspaceReviewCockpit | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const workspaceId = workspace?.id ?? null;

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setActionMessage(null);
    const warnings: string[] = [];
    try {
      const [nextConfig, nextReadiness, nextReview] = await Promise.all([
        getWorkspaceMnemonicConfig(workspaceId).catch((err) => {
          warnings.push(`checks config unavailable (${err instanceof Error ? err.message : String(err)})`);
          return null;
        }),
        getWorkspaceReadiness(workspaceId).catch((err) => {
          warnings.push(`readiness unavailable (${err instanceof Error ? err.message : String(err)})`);
          return null;
        }),
        getWorkspaceReviewCockpit(workspaceId, null).catch((err) => {
          warnings.push(`review data unavailable (${err instanceof Error ? err.message : String(err)})`);
          return null;
        }),
      ]);
      setConfig(nextConfig);
      setReadiness(nextReadiness);
      setReview(nextReview);
      setSourceWarnings(warnings);
      setLastSyncedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setConfig(null);
    setReadiness(null);
    setReview(null);
    setActionMessage(null);
    setSourceWarnings([]);
    setLastSyncedAt(null);
    if (workspaceId && isOpen) void refresh();
  }, [workspaceId, isOpen, activeTab, refresh]);

  useEffect(() => {
    if (!workspaceId || !isOpen) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 5000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [workspaceId, isOpen, refresh]);

  // Live changed files from the cockpit fetch (refresh button + 5s poll);
  // the cached workspace summary only bridges the gap while loading.
  const changedFiles = useMemo(() => {
    if (review) {
      return review.files.map((entry) => ({
        path: entry.file.path,
        additions: entry.file.additions ?? 0,
        deletions: entry.file.deletions ?? 0,
      }));
    }
    return (workspace?.changedFiles ?? []).map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
    }));
  }, [review, workspace?.changedFiles]);

  const diffTotals = useMemo(() => changedFiles.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  ), [changedFiles]);

  if (!isOpen) return null;

  return (
    <aside className="relative shrink-0 h-full border-l border-mn-border bg-mn-surface" style={{ width: `${width}px` }}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-mn-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-mn-muted">Inspector</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => void refresh()} title="Refresh inspector">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onClose} title="Collapse inspector">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-mn-border bg-black/15">
          <InspectorTabButton label="Changes" icon={ClipboardCheck} active={activeTab === 'changes'} onClick={() => onTabChange('changes')} />
          <InspectorTabButton label="Checks" icon={Gauge} active={activeTab === 'checks'} onClick={() => onTabChange('checks')} />
          <InspectorTabButton label="Review" icon={ClipboardCheck} active={activeTab === 'review'} onClick={() => onTabChange('review')} />
          <InspectorTabButton label="Files" icon={FolderTree} active={activeTab === 'files'} onClick={() => onTabChange('files')} />
        </div>

        {actionMessage && (
          <p className="border-b border-mn-border bg-mn-surface-overlay px-3 py-1.5 text-xs text-mn-muted">{actionMessage}</p>
        )}
        {(sourceWarnings.length > 0 || lastSyncedAt) && (
          <div className="border-b border-mn-border bg-black/15 px-3 py-1.5 text-[11px] text-mn-muted">
            {lastSyncedAt ? <p>Live sync: {new Date(lastSyncedAt).toLocaleTimeString()}</p> : null}
            {sourceWarnings.length > 0 ? <p className="mt-0.5 text-mn-orange">Partial data: {sourceWarnings[0]}</p> : null}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!workspace && <p className="text-xs text-mn-muted">Select a workspace to inspect.</p>}

          {workspace && activeTab === 'changes' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-mn-border bg-mn-card/60 p-2.5 text-xs text-mn-muted">
                <p>
                  <span className="font-semibold text-mn-text">{changedFiles.length}</span> file(s) changed ·{' '}
                  <span className="text-mn-green">+{diffTotals.additions}</span> / <span className="text-mn-red">-{diffTotals.deletions}</span>
                </p>
              </div>
              <div className="space-y-1">
                {changedFiles.length === 0 && <p className="text-xs text-mn-muted">No changed files.</p>}
                {changedFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => onOpenReviewFile(file.path)}
                    className="flex w-full items-center justify-between rounded border border-mn-border/70 bg-mn-card/50 px-2 py-1.5 text-left text-xs hover:bg-mn-surface-overlay"
                  >
                    <span className="truncate font-mono text-mn-text">{file.path}</span>
                    <span className="ml-2 shrink-0 font-mono text-mn-muted">+{file.additions} -{file.deletions}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspace && activeTab === 'checks' && (
            <div className="space-y-3">
              <PrChecksSection workspaceId={workspace.id} />

              <p className="text-[10px] font-bold uppercase tracking-widest text-mn-dim">Local checks</p>
              <div className="rounded-lg border border-mn-border bg-mn-card/60 p-2.5 text-xs text-mn-muted space-y-1">
                <p>Status: <span className="font-semibold text-mn-text">{readiness?.status ?? 'unknown'}</span></p>
                <p>Tests: <span className="font-semibold text-mn-text">{readiness?.testStatus ?? 'unknown'}</span></p>
                <p>Summary: {readiness?.summary ?? 'No readiness summary yet.'}</p>
              </div>

              <div className="space-y-2">
                <Button variant="outline" size="xs" onClick={() => {
                  if (!workspaceId) return;
                  runWorkspaceSetup(workspaceId)
                    .then((sessions) => setActionMessage(sessions.length ? `Started ${sessions.length} setup terminal(s).` : 'No setup commands configured.'))
                    .catch((err) => setActionMessage(err instanceof Error ? err.message : String(err)))
                    .finally(() => void refresh());
                }}>
                  <Wrench className="h-3.5 w-3.5" /> Run setup
                </Button>

                {(config?.run ?? []).length === 0 && <p className="text-xs text-mn-muted">No run commands configured.</p>}
                {(config?.run ?? []).map((command, index) => (
                  <div key={`${command}-${index}`} className="rounded border border-mn-border/70 bg-mn-card/50 p-2">
                    <p className="truncate text-xs font-mono text-mn-text" title={command}>{command}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => {
                        if (!workspaceId) return;
                        startWorkspaceRunCommand(workspaceId, index)
                          .then(() => setActionMessage(`Started check ${index + 1}.`))
                          .catch((err) => setActionMessage(err instanceof Error ? err.message : String(err)))
                          .finally(() => void refresh());
                      }}>
                        <Play className="h-3.5 w-3.5" /> Run
                      </Button>
                    </div>
                  </div>
                ))}

                <Button variant="ghost" size="xs" onClick={() => {
                  if (!workspaceId) return;
                  stopWorkspaceRunCommands(workspaceId)
                    .then((sessions) => setActionMessage(`Stopped ${sessions.length} run terminal(s).`))
                    .catch((err) => setActionMessage(err instanceof Error ? err.message : String(err)))
                    .finally(() => void refresh());
                }}>
                  Stop running checks
                </Button>
              </div>
            </div>
          )}

          {workspace && activeTab === 'review' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-mn-border bg-mn-card/60 p-2.5 text-xs text-mn-muted space-y-1">
                <p>Reviewed files: <span className="font-semibold text-mn-text">{readiness?.reviewedFiles ?? 0}</span></p>
                <p>PR comments: <span className="font-semibold text-mn-text">{review?.prComments.length ?? 0}</span></p>
              </div>

              <Button variant="outline" size="xs" onClick={() => {
                if (!workspaceId) return;
                syncWorkspacePrThreads(workspaceId)
                  .then((cockpit) => {
                    setReview(cockpit);
                    setActionMessage('Refreshed GitHub review threads.');
                  })
                  .catch((err) => setActionMessage(err instanceof Error ? err.message : String(err)));
              }}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh threads
              </Button>

              <div className="space-y-1">
                {review?.prComments.slice(0, 12).map((comment) => (
                  <button
                    key={comment.commentId}
                    type="button"
                    onClick={() => comment.path ? onOpenReviewFile(comment.path) : undefined}
                    className="w-full rounded border border-mn-border/70 bg-mn-card/50 px-2 py-1.5 text-left hover:bg-mn-surface-overlay"
                  >
                    <p className="truncate text-xs font-semibold text-mn-text">{comment.author}</p>
                    <p className="truncate text-xs text-mn-muted">{comment.path ?? 'general'} · {comment.threadResolved ? 'resolved' : 'open'}</p>
                  </button>
                ))}
                {!review || review.prComments.length === 0 ? <p className="text-xs text-mn-muted">No PR comments cached.</p> : null}
              </div>
            </div>
          )}

          {workspace && activeTab === 'files' && (
            <WorkspaceFilesPanel workspaceId={workspace.id} onFileSelect={onOpenFile} />
          )}
        </div>
      </div>
    </aside>
  );
}

function InspectorTabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold ${active ? 'bg-mn-surface text-mn-text' : 'text-mn-muted hover:bg-mn-surface-overlay hover:text-mn-text/80'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
