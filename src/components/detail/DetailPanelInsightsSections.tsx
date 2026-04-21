import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspacePrDraft, WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceCheckpoint } from '../../types/checkpoint';
import type { WorkspaceChangedFile } from '../../types/git-review';
import type { WorkspaceHealth } from '../../types/workspace-health';
import type { WorkspaceReviewCockpit } from '../../types/review-cockpit';
import { CockpitLine } from './DetailPanelCockpitSections';

export function ChangeUnderstandingPanel({
  changedFiles,
  loading,
  onOpenReviewFile,
}: {
  changedFiles: WorkspaceChangedFile[];
  loading: boolean;
  onOpenReviewFile?: (path?: string) => void;
}) {
  const visible = changedFiles.slice(0, 6);
  const totalAdditions = changedFiles.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const totalDeletions = changedFiles.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const riskyFiles = changedFiles.filter((file) => (
    file.path.includes('package-lock.json')
    || file.path.includes('pnpm-lock.yaml')
    || file.path.includes('yarn.lock')
    || file.path.includes('Cargo.lock')
    || file.path.includes('migrations/')
    || file.path.endsWith('.sql')
  ));

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Change Understanding</p>
            <p className="mt-0.5 text-xs text-forge-muted">Quick read before diving into raw diffs.</p>
          </div>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-forge-muted" />}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <CockpitLine label="Files" value={`${changedFiles.length} changed`} />
          <CockpitLine label="Diff size" value={`+${totalAdditions} / -${totalDeletions}`} />
          <CockpitLine label="Staging" value={`${changedFiles.filter((file) => file.staged).length} staged · ${changedFiles.filter((file) => file.unstaged).length} unstaged`} />
          <CockpitLine label="Risk hints" value={riskyFiles.length > 0 ? `${riskyFiles.length} config/data file(s)` : 'none obvious'} />
        </div>
        {changedFiles.length === 0 ? (
          <p className="mt-2 text-xs text-forge-muted">No changed files detected yet.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {visible.map((file) => (
              <button
                key={`${file.status}-${file.path}`}
                type="button"
                onClick={() => onOpenReviewFile?.(file.path)}
                className="flex w-full min-w-0 items-center gap-2 rounded border border-forge-border/50 bg-black/10 px-2 py-1.5 text-left hover:bg-white/10"
              >
                <span className="shrink-0 rounded border border-forge-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase text-forge-muted">
                  {String(file.status).slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-forge-text/90" title={file.path}>{file.path}</span>
                <span className="shrink-0 text-xs text-forge-muted">+{file.additions ?? 0}/-{file.deletions ?? 0}</span>
              </button>
            ))}
            {changedFiles.length > visible.length && (
              <button
                type="button"
                onClick={() => onOpenReviewFile?.()}
                className="text-xs text-forge-muted hover:text-forge-text"
              >
                Open review cockpit for {changedFiles.length - visible.length} more file(s)
              </button>
            )}
          </div>
        )}
        {changedFiles.length > 0 && (
          <Button variant="secondary" size="xs" className="mt-3" onClick={() => onOpenReviewFile?.(changedFiles[0]?.path)}>
            Open review cockpit
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReviewBlockersPanel({
  cockpit,
  loading,
  refreshing,
  message,
  onRefreshComments,
  onOpenReviewFile,
}: {
  cockpit: WorkspaceReviewCockpit | null;
  loading: boolean;
  refreshing: boolean;
  message: string | null;
  onRefreshComments: () => void;
  onOpenReviewFile?: (path?: string) => void;
}) {
  const comments = cockpit?.prComments ?? [];
  const openComments = comments.filter((comment) => !comment.resolvedAt && comment.state !== 'resolved');
  const inlineComments = openComments.filter((comment) => Boolean(comment.path));
  const mergeReadiness = cockpit?.mergeReadiness;
  const reviewSummary = cockpit?.reviewSummary;
  const blockers = [
    ...(mergeReadiness?.reasons ?? []),
    ...(mergeReadiness?.warnings ?? []),
    ...(reviewSummary?.riskReasons ?? []),
  ].filter((item, index, all) => item.trim() && all.indexOf(item) === index);
  const riskLabel = reviewSummary
    ? `${reviewSummary.riskLevel} · ${reviewSummary.filesFlagged} flagged`
    : 'not summarized';
  const readinessLabel = mergeReadiness
    ? `${mergeReadiness.readinessLevel}${mergeReadiness.mergeReady ? ' · merge-ready' : ' · not ready'}`
    : 'not checked';

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Review Blockers</p>
            <p className="mt-0.5 text-xs text-forge-muted">PR comments, local risk summary, and merge-readiness in one place.</p>
          </div>
          {(loading || refreshing) && <Loader2 className="h-3.5 w-3.5 animate-spin text-forge-muted" />}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <CockpitLine label="Readiness" value={readinessLabel} />
          <CockpitLine label="Risk" value={riskLabel} />
          <CockpitLine label="PR comments" value={`${openComments.length} open · ${inlineComments.length} inline`} />
          <CockpitLine label="Reviewed files" value={`${cockpit?.files.filter((file) => file.review?.status === 'reviewed').length ?? 0}/${cockpit?.files.length ?? 0}`} />
        </div>
        {blockers.length > 0 && (
          <div className="mt-2 space-y-1 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {blockers.slice(0, 4).map((blocker) => (
              <p key={blocker}>{blocker}</p>
            ))}
            {blockers.length > 4 && <p>+{blockers.length - 4} more blocker/risk note(s)</p>}
          </div>
        )}
        {openComments.length > 0 ? (
          <div className="mt-2 space-y-1">
            {openComments.slice(0, 4).map((comment) => (
              <button
                key={comment.commentId}
                type="button"
                onClick={() => onOpenReviewFile?.(comment.path ?? undefined)}
                className="w-full rounded border border-forge-border/50 bg-black/10 px-2 py-1.5 text-left hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-forge-text/90">
                    {comment.author}{comment.path ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ''}` : ' · general'}
                  </span>
                  {comment.url && (
                    <a
                      href={comment.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="shrink-0 text-forge-blue hover:text-forge-blue/80"
                      title="Open comment on GitHub"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-forge-muted">{comment.body}</p>
              </button>
            ))}
            {openComments.length > 4 && <p className="text-xs text-forge-muted">+{openComments.length - 4} more comment(s) in the Review Cockpit</p>}
          </div>
        ) : (
          <p className="mt-2 text-xs text-forge-muted">No open PR comments cached for this workspace.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={refreshing} onClick={onRefreshComments}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Refresh PR comments
          </Button>
          <Button variant="secondary" size="xs" onClick={() => onOpenReviewFile?.()}>
            Open review cockpit
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-forge-muted">{message}</p>}
        {(cockpit?.warnings.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-forge-yellow">{cockpit?.warnings[0]}</p>
        )}
      </div>
    </div>
  );
}

export function WorkspaceConfigDepthPanel({ config }: { config: ForgeWorkspaceConfig | null }) {
  const profileCount = config?.agentProfiles.length ?? 0;
  const mcpCount = config?.mcpServers.length ?? 0;
  const enabledMcpCount = config?.mcpServers.filter((server) => server.enabled).length ?? 0;
  const stdioMcpCount = config?.mcpServers.filter((server) => server.transport === 'stdio').length ?? 0;
  const httpMcpCount = config?.mcpServers.filter((server) => server.transport === 'http').length ?? 0;
  const scriptCount = (config?.setup.length ?? 0) + (config?.run.length ?? 0) + (config?.teardown.length ?? 0);

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Workspace Config</p>
          <p className="mt-0.5 text-xs text-forge-muted">Developer-depth view of local repo configuration. Nothing here launches MCP servers.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <CockpitLine label="Config file" value={config?.exists ? (config.path ?? '.forge/config.json') : 'not configured'} />
          <CockpitLine label="Scripts" value={`${scriptCount} total · ${config?.run.length ?? 0} check/run`} />
          <CockpitLine label="Agent profiles" value={`${profileCount} repo profile${profileCount === 1 ? '' : 's'}`} />
          <CockpitLine label="MCP servers" value={`${enabledMcpCount}/${mcpCount} enabled · ${stdioMcpCount} stdio · ${httpMcpCount} http`} />
        </div>
        {config?.warning && (
          <div className="mt-2 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {config.warning}
          </div>
        )}
        {(config?.mcpWarnings.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {config?.mcpWarnings.slice(0, 3).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {(config?.mcpWarnings.length ?? 0) > 3 && <p>+{(config?.mcpWarnings.length ?? 0) - 3} more warning(s)</p>}
          </div>
        )}
        {profileCount > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-semibold text-forge-text/85">Repo agent profiles</p>
            {config?.agentProfiles.slice(0, 4).map((profile) => (
              <div key={profile.id} className="rounded border border-forge-border/50 bg-black/10 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-forge-text" title={profile.label}>{profile.label}</span>
                  <span className="shrink-0 rounded border border-forge-border bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-forge-muted">
                    {profile.local ? 'local' : profile.agent}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-forge-muted" title={`${profile.command} ${profile.args.join(' ')}`}>
                  {profile.command} {profile.args.join(' ')}
                </p>
              </div>
            ))}
            {profileCount > 4 && <p className="text-xs text-forge-muted">+{profileCount - 4} more profile(s)</p>}
          </div>
        )}
        {mcpCount > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-forge-text/85">MCP servers</p>
              <p className="text-xs text-forge-muted">metadata only · not auto-launched</p>
            </div>
            {config?.mcpServers.slice(0, 5).map((server) => {
              const preview = server.url ?? [server.command, ...server.args].filter(Boolean).join(' ');
              const envCount = Object.keys(server.env ?? {}).length;
              return (
                <div key={server.id} className="rounded border border-forge-border/50 bg-black/10 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-forge-text" title={server.id}>{server.id}</span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase ${server.enabled ? 'border-forge-green/20 bg-forge-green/10 text-forge-green' : 'border-forge-border bg-white/5 text-forge-muted'}`}>
                      {server.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-forge-muted" title={preview}>
                    {server.transport} · {preview || 'no command/url'}{envCount > 0 ? ` · ${envCount} env` : ''}
                  </p>
                </div>
              );
            })}
            {mcpCount > 5 && <p className="text-xs text-forge-muted">+{mcpCount - 5} more server(s)</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function SimpleNextActionsPanel({
  changedFiles,
  checkCount,
  prStatus,
  prDraft,
  draftRefreshing,
  reviewCockpit,
  workspaceHealth,
  checkpoints,
  busy,
  onRunFirstCheck,
  onOpenReviewFile,
  onRefreshComments,
  onRefreshDraft,
  onCopyDraft,
  onRecover,
  onCreatePr,
  onCleanup,
}: {
  changedFiles: number;
  checkCount: number;
  prStatus: WorkspacePrStatus | null;
  prDraft: WorkspacePrDraft | null;
  draftRefreshing: boolean;
  reviewCockpit: WorkspaceReviewCockpit | null;
  workspaceHealth: WorkspaceHealth | null;
  checkpoints: WorkspaceCheckpoint[];
  busy: boolean;
  onRunFirstCheck: () => void;
  onOpenReviewFile?: (path?: string) => void;
  onRefreshComments: () => void;
  onRefreshDraft: () => void;
  onCopyDraft: () => void;
  onRecover: () => void;
  onCreatePr: () => void;
  onCleanup: () => void;
}) {
  const openComments = reviewCockpit?.prComments.filter((comment) => !comment.resolvedAt && comment.state !== 'resolved') ?? [];
  const reviewBlockers = [
    ...(reviewCockpit?.mergeReadiness?.reasons ?? []),
    ...(reviewCockpit?.mergeReadiness?.warnings ?? []),
    ...(reviewCockpit?.reviewSummary?.riskReasons ?? []),
  ].filter(Boolean);
  const unhealthySessions = workspaceHealth?.terminals.filter((terminal) => (
    terminal.stale
    || terminal.status === 'failed'
    || terminal.status === 'interrupted'
    || (terminal.status === 'running' && !terminal.attached)
  )) ?? [];
  const hasPr = Boolean(prStatus?.found);
  const readiness = reviewCockpit?.mergeReadiness?.readinessLevel ?? 'not checked';
  const reviewRisk = reviewCockpit?.reviewSummary?.riskLevel ?? 'not summarized';
  const nextItems = [
    changedFiles === 0 ? 'Wait for or start agent work' : null,
    changedFiles > 0 && reviewBlockers.length === 0 ? 'Review changed files' : null,
    reviewBlockers.length > 0 ? 'Resolve review blockers' : null,
    openComments.length > 0 ? 'Address PR comments' : null,
    checkCount > 0 ? 'Run configured checks' : null,
    unhealthySessions.length > 0 ? 'Recover stale sessions' : null,
    changedFiles > 0 && !hasPr ? 'Prepare PR' : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Next Actions</p>
          <p className="mt-0.5 text-xs text-forge-muted">Simple path first. Use Deep view for full terminals, diffs, config, recovery, and checkpoint detail.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <CockpitLine label="Changes" value={`${changedFiles} file${changedFiles === 1 ? '' : 's'}`} />
          <CockpitLine label="Review" value={`${readiness} · ${reviewRisk}`} />
          <CockpitLine label="PR comments" value={`${openComments.length} open`} />
          <CockpitLine label="Recovery" value={unhealthySessions.length > 0 ? `${unhealthySessions.length} need attention` : 'clear'} />
          <CockpitLine label="Checks" value={checkCount > 0 ? `${checkCount} configured` : 'none configured'} />
          <CockpitLine label="Checkpoints" value={`${checkpoints.length} saved`} />
          <CockpitLine label="PR draft" value={prDraft ? 'ready to inspect' : hasPr ? 'PR already linked' : 'not previewed'} />
        </div>
        {nextItems.length > 0 && (
          <div className="mt-3 space-y-1 rounded border border-forge-border/60 bg-black/10 p-2">
            {nextItems.slice(0, 5).map((item, index) => (
              <div key={item} className="flex items-center gap-2 text-xs">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-forge-border bg-white/5 text-[10px] text-forge-muted">
                  {index + 1}
                </span>
                <span className="text-forge-text/85">{item}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={changedFiles === 0} onClick={() => onOpenReviewFile?.()}>
            Review changes
          </Button>
          <Button variant="secondary" size="xs" disabled={checkCount === 0 || busy} onClick={onRunFirstCheck}>
            Run checks
          </Button>
          <Button variant="secondary" size="xs" disabled={busy} onClick={onRefreshComments}>
            Refresh comments
          </Button>
          <Button variant="secondary" size="xs" disabled={hasPr || changedFiles === 0 || draftRefreshing} onClick={onRefreshDraft}>
            {draftRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {prDraft ? 'Refresh draft' : 'Preview draft'}
          </Button>
          {prDraft && (
            <Button variant="secondary" size="xs" disabled={busy} onClick={onCopyDraft}>
              Copy draft
            </Button>
          )}
          <Button variant="secondary" size="xs" disabled={unhealthySessions.length === 0 || busy} onClick={onRecover}>
            Recover
          </Button>
          <Button variant="secondary" size="xs" disabled={hasPr || changedFiles === 0 || busy} onClick={onCreatePr}>
            {hasPr ? 'PR linked' : 'Create PR'}
          </Button>
          {prStatus?.found && prStatus.url && (
            <Button asChild variant="secondary" size="xs">
              <a href={prStatus.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />
                Open PR
              </a>
            </Button>
          )}
          <Button variant="secondary" size="xs" disabled={busy} onClick={onCleanup}>
            Cleanup
          </Button>
        </div>
      </div>
    </div>
  );
}
