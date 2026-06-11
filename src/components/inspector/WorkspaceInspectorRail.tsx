import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ClipboardCheck, FolderTree, Gauge, GitPullRequest, Play, RefreshCw, TerminalSquare, Wrench, X } from 'lucide-react';
import type { MnemonicWorkspaceConfig, Workspace, WorkspaceReadiness, WorkspaceReviewCockpit } from '../../types';
import { getWorkspaceMnemonicConfig, runWorkspaceSetup, startWorkspaceRunCommand, stopWorkspaceRunCommands } from '../../lib/tauri-api/workspace-scripts';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { getWorkspaceReviewCockpit, syncWorkspacePrThreads } from '../../lib/tauri-api/review-cockpit';
import { WorkspaceFilesPanel } from '../terminal/WorkspaceFilesPanel';
import { TerminalPane } from '../terminal/WorkspaceTerminalPane';
import { PrChecksSection } from './PrChecksSection';
import { useInspectorTerminal } from './useInspectorTerminal';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { shipWorkspacePr } from '../../lib/tauri-api/pr-draft';

type InspectorTab = 'changes' | 'checks' | 'review' | 'files';

const SPLIT_RATIO_KEY = 'mn:inspector-split-ratio';
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;

function loadSplitRatio(): number {
  const raw = window.localStorage.getItem(SPLIT_RATIO_KEY);
  if (!raw) return DEFAULT_RATIO;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(MIN_RATIO, Math.min(MAX_RATIO, parsed)) : DEFAULT_RATIO;
}

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
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceId = workspace?.id ?? null;

  const inspectorTerminal = useInspectorTerminal(workspaceId, isOpen);

  const saveSplitRatio = useCallback((ratio: number) => {
    const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
    setSplitRatio(clamped);
    window.localStorage.setItem(SPLIT_RATIO_KEY, String(clamped));
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const onMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = (moveEvent.clientY - rect.top) / rect.height;
      saveSplitRatio(ratio);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [saveSplitRatio]);

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

  const handleCreatePr = useCallback(() => {
    if (!workspaceId) return;
    setCreatingPr(true);
    setActionMessage(null);
    shipWorkspacePr(workspaceId)
      .then((result) => {
        setActionMessage(`PR #${result.prNumber} created`);
        window.dispatchEvent(new CustomEvent('mn:refresh-workspaces'));
        void refresh();
      })
      .catch((err) => setActionMessage(err instanceof Error ? err.message : String(err)))
      .finally(() => setCreatingPr(false));
  }, [workspaceId, refresh]);

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
            {workspace && (
              <Tooltip content="Commit, push, and open a PR" side="bottom">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={creatingPr || !workspaceId}
                  onClick={handleCreatePr}
                  className="h-6 px-2 text-[10px] border-mn-border text-mn-text/80 hover:bg-white/5"
                >
                  <GitPullRequest className="h-3 w-3" />
                  {creatingPr ? 'Creating...' : 'Create PR'}
                </Button>
              </Tooltip>
            )}
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

        <div ref={splitContainerRef} className="min-h-0 flex-1 flex flex-col">
          {/* Top half: tab content */}
          <div className="overflow-y-auto p-3" style={{ flex: splitRatio }}>
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

          {/* Resize handle */}
          <div
            onMouseDown={handleDragStart}
            className="group relative h-2 shrink-0 cursor-row-resize border-y border-mn-border/60 bg-mn-surface hover:bg-primary/15 transition-colors"
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-8 h-0.5 rounded-full bg-mn-muted/30 group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Bottom half: persistent terminal */}
          <div className="overflow-hidden" style={{ flex: 1 - splitRatio }}>
            {inspectorTerminal.session ? (
              <TerminalPane
                session={inspectorTerminal.session}
                chunks={inspectorTerminal.chunks}
                focused={terminalFocused}
                onFocus={() => setTerminalFocused(true)}
                onStop={inspectorTerminal.onStop}
                onClose={() => {}}
                onData={inspectorTerminal.onData}
                onResize={inspectorTerminal.onResize}
                compact
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <TerminalSquare className="mx-auto h-5 w-5 text-mn-dim" />
                  <p className="mt-1.5 text-[11px] text-mn-muted">
                    {workspace ? 'Starting shell...' : 'Select a workspace'}
                  </p>
                </div>
              </div>
            )}
          </div>
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
