import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileCode,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Wrench,
  XCircle,
  ClipboardList,
} from 'lucide-react';
import type { AgentProfile, Workspace, WorkspacePrComment, WorkspaceReviewCockpit } from '../../types';
import {
  getWorkspaceReviewCockpit,
  markWorkspaceFileReviewed,
  markWorkspacePrCommentResolvedLocal,
  queueReviewAgentPrompt,
  refreshWorkspacePrComments,
  refreshWorkspaceReviewCockpit,
} from '../../lib/tauri-api/review-cockpit';
import { formatSessionError } from '../../lib/ui-errors';
import { measureAsync } from '../../lib/perf';
import {
  agentProfilesForPromptPicker,
  defaultWorkspaceAgentProfileId,
  listWorkspaceAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { UnifiedDiffView } from './UnifiedDiffView';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';

interface ReviewCockpitProps {
  workspace: Workspace | null;
  selectedPath?: string | null;
  onSelectedPathChange?: (path: string | null) => void;
  targetCommentId?: string | null;
  onTargetCommentHandled?: () => void;
  onBackToWorkspaces?: () => void;
}

export function ReviewCockpit({
  workspace,
  selectedPath,
  onSelectedPathChange,
  targetCommentId,
  onTargetCommentHandled,
  onBackToWorkspaces,
}: ReviewCockpitProps) {
  const [cockpit, setCockpit] = useState<WorkspaceReviewCockpit | null>(null);
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(selectedPath ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useAgentProfile();
  const [selectedTaskMode, setSelectedTaskMode] = useState('Review');
  const [selectedReasoning, setSelectedReasoning] = useState('Default');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const workspaceId = workspace?.id ?? null;
  const effectiveSelectedPath = selectedPath ?? localSelectedPath ?? cockpit?.files[0]?.file.path ?? null;

  const loadCockpit = useCallback(
    async (refresh = false, path?: string | null) => {
      if (!workspaceId) return;
      setBusy(true);
      setError(null);
      try {
        const next = await measureAsync('review-cockpit:load', () => (
          refresh
            ? refreshWorkspaceReviewCockpit(workspaceId, path ?? effectiveSelectedPath)
            : getWorkspaceReviewCockpit(workspaceId, path ?? effectiveSelectedPath)
        ));
        setCockpit(next);
        const nextPath = next.selectedDiff?.path ?? path ?? next.files[0]?.file.path ?? null;
        setLocalSelectedPath(nextPath);
        onSelectedPathChange?.(nextPath);
      } catch (err) {
        setError(formatSessionError(err));
      } finally {
        setBusy(false);
      }
    },
    [effectiveSelectedPath, onSelectedPathChange, workspaceId],
  );

  useEffect(() => {
    setCockpit(null);
    setLocalSelectedPath(selectedPath ?? null);
    if (workspaceId) {
      void loadCockpit(false, selectedPath ?? null);
      void listWorkspaceAgentProfiles(workspaceId)
        .then((profiles) => {
          setAgentProfiles(profiles);
          setSelectedProfileId((current) =>
            profiles.some((profile) => profile.id === current)
              ? current
              : defaultWorkspaceAgentProfileId(profiles),
          );
        })
        .catch(() => setAgentProfiles([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (selectedPath && selectedPath !== localSelectedPath) {
      setLocalSelectedPath(selectedPath);
      void loadCockpit(false, selectedPath);
    }
  }, [loadCockpit, localSelectedPath, selectedPath]);

  useEffect(() => {
    if (!targetCommentId || !cockpit) return;
    const element = document.getElementById(`review-comment-${targetCommentId}`);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onTargetCommentHandled?.();
  }, [cockpit, onTargetCommentHandled, targetCommentId]);

  const selectedFile =
    cockpit?.files.find((item) => item.file.path === effectiveSelectedPath) ??
    cockpit?.files[0] ??
    null;
  const reviewedCount =
    cockpit?.files.filter((item) => item.review?.status === 'reviewed').length ?? 0;
  const commentsForSelected = useMemo(() => {
    if (!cockpit || !effectiveSelectedPath) return [];
    return cockpit.prComments.filter(
      (comment) => comment.path === effectiveSelectedPath || !comment.path,
    );
  }, [cockpit, effectiveSelectedPath]);

  const selectFile = async (path: string) => {
    setLocalSelectedPath(path);
    onSelectedPathChange?.(path);
    await loadCockpit(false, path);
  };

  const setReviewed = async (reviewed: boolean) => {
    if (!workspaceId || !selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      setCockpit(
        await markWorkspaceFileReviewed({ workspaceId, path: selectedFile.file.path, reviewed }),
      );
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const sendPrompt = async (action: string, comment?: WorkspacePrComment) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await queueReviewAgentPrompt({
        workspaceId,
        path: selectedFile?.file.path ?? comment?.path ?? effectiveSelectedPath,
        commentId: comment?.commentId ?? null,
        action,
        profileId: selectedProfileId,
        taskMode: selectedTaskMode,
        reasoning: selectedReasoning,
        mode: 'send_now',
      });
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshComments = async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      setCockpit(await refreshWorkspacePrComments(workspaceId));
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const resolveComment = async (commentId: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      setCockpit(await markWorkspacePrCommentResolvedLocal(workspaceId, commentId));
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-dashed border-forge-border p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-9 w-9 text-forge-muted" />
          <p className="text-[14px] font-semibold text-forge-text">No workspace selected</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-forge-muted">
            Select a workspace from the sidebar to start reviewing changes.
          </p>
        </div>
      </div>
    );
  }

  const totalAdds = cockpit?.files.reduce((sum, item) => sum + (item.file.additions ?? 0), 0) ?? 0;
  const totalDels = cockpit?.files.reduce((sum, item) => sum + (item.file.deletions ?? 0), 0) ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-forge-bg">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-forge-border bg-forge-surface/95 px-5 py-3 backdrop-blur">

        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {onBackToWorkspaces && (
              <button
                type="button"
                onClick={onBackToWorkspaces}
                className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-forge-border bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-forge-text/90 hover:bg-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Workspaces
              </button>
            )}
            <h1 className="truncate text-[17px] font-bold text-forge-text">Review Cockpit</h1>
            <p className="mt-0.5 truncate text-[11px] text-forge-muted">
              {workspace.name} · {workspace.repo} / {workspace.branch}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              disabled={busy}
              onClick={() => void loadCockpit(true, effectiveSelectedPath)}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-forge-text hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              disabled={busy}
              onClick={() => void refreshComments()}
              className="flex items-center gap-1.5 rounded-lg border border-forge-blue/25 bg-forge-blue/10 px-3 py-1.5 text-[11px] font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              PR comments
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRightPanelCollapsed((current) => !current)}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-forge-text hover:bg-white/10 disabled:opacity-50"
              title="Collapse/expand right review panel"
            >
              {rightPanelCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
              {rightPanelCollapsed ? 'Show panel' : 'Collapse panel'}
            </button>
          </div>
        </div>

        {/* Row 2: stats badges */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{cockpit?.files.length ?? 0} files</Badge>
          <Badge tone="green">{reviewedCount} accepted</Badge>
          <Badge tone="neutral">
            <span className="text-forge-green">+{totalAdds}</span>
            <span className="ml-1 text-forge-red">-{totalDels}</span>
          </Badge>
          <Badge tone="blue">{cockpit?.prComments.length ?? 0} PR comments</Badge>
        </div>

        {/* Error / warning strip */}
        {(error || (cockpit?.warnings.length ?? 0) > 0) && (
          <div className="mt-2 rounded-lg border border-forge-yellow/20 bg-forge-yellow/10 px-3 py-2 text-[11px] text-forge-yellow">
            {error ?? cockpit?.warnings[0]}
          </div>
        )}
      </div>

      {/* ── Three-column grid ───────────────────────────────────────────────── */}
      <div
        className="grid min-h-0 flex-1 gap-2 p-2"
        style={{
          gridTemplateColumns: rightPanelCollapsed ? '280px minmax(0, 1fr) 0px' : '280px minmax(0, 1fr) 300px',
        }}
      >

        {/* ── Left: file list ─────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70">
          <div className="shrink-0 border-b border-forge-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-forge-muted">
              Changed files
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-forge-border/40">
            {!cockpit && (
              <p className="p-3 text-[12px] text-forge-muted">
                {busy ? 'Loading…' : 'No data yet.'}
              </p>
            )}
            {cockpit?.files.length === 0 && (
              <p className="p-3 text-[12px] text-forge-muted">No changed files.</p>
            )}
            {cockpit?.files.map((item) => {
              const reviewed = item.review?.status === 'reviewed';
              const active = item.file.path === effectiveSelectedPath;
              return (
                <button
                  key={item.file.path}
                  onClick={() => void selectFile(item.file.path)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
                    active ? 'bg-forge-orange/10' : ''
                  }`}
                >
                  {reviewed ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forge-green" />
                  ) : (
                    <FileCode
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'text-forge-orange' : 'text-forge-muted'}`}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-mono text-[11px] ${
                        active ? 'text-forge-orange' : 'text-forge-text/90'
                      }`}
                    >
                      {item.file.path}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-forge-muted">
                      {item.file.status}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] leading-none mt-0.5">
                    <span className="text-forge-green">+{item.file.additions ?? 0}</span>
                    {' '}
                    <span className="text-forge-red">-{item.file.deletions ?? 0}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Centre: diff viewer ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70">

          {/* Sub-row 1: file path + accept/unaccept */}
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-forge-border/60 px-3 py-2">
            <p className="min-w-0 truncate font-mono text-[12px] font-semibold text-forge-text">
              {selectedFile?.file.path ?? 'No file selected'}
            </p>
            <div className="shrink-0">
              {selectedFile?.review?.status === 'reviewed' ? (
                <button
                  disabled={busy}
                  onClick={() => void setReviewed(false)}
                  className="flex items-center gap-1 rounded-md border border-forge-yellow/25 bg-forge-yellow/10 px-2.5 py-1 text-[10px] font-semibold text-forge-yellow hover:bg-forge-yellow/15 disabled:opacity-50"
                >
                  <XCircle className="h-3 w-3" /> Unaccept
                </button>
              ) : (
                <button
                  disabled={busy || !selectedFile}
                  onClick={() => void setReviewed(true)}
                  className="flex items-center gap-1 rounded-md border border-forge-green/25 bg-forge-green/10 px-2.5 py-1 text-[10px] font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50"
                >
                  <ShieldCheck className="h-3 w-3" /> Accept
                </button>
              )}
            </div>
          </div>

          {/* Sub-row 2: agent selects + action buttons */}
          <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b border-forge-border px-3 py-2 bg-forge-surface/40">
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] font-semibold text-forge-text focus:outline-none"
            >
              {agentProfilesForPromptPicker(agentProfiles).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <select
              value={selectedTaskMode}
              onChange={(e) => setSelectedTaskMode(e.target.value)}
              className="rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] font-semibold text-forge-text focus:outline-none"
            >
              {['Review', 'Fix', 'Plan', 'Act'].map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
            <select
              value={selectedReasoning}
              onChange={(e) => setSelectedReasoning(e.target.value)}
              className="rounded border border-forge-border bg-forge-bg px-2 py-1 text-[10px] font-semibold text-forge-text focus:outline-none"
            >
              {['Default', 'Low', 'Medium', 'High'].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
            <span className="mx-1 h-4 w-px bg-forge-border/60 shrink-0" />
            <button
              disabled={busy || !selectedFile}
              onClick={() => void sendPrompt('explain_diff')}
              className="flex items-center gap-1 rounded-md border border-forge-border bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-forge-text/85 hover:bg-white/10 disabled:opacity-50"
            >
              <Bot className="h-3 w-3" /> Explain
            </button>
            <button
              disabled={busy || !selectedFile}
              onClick={() => void sendPrompt('fix_file')}
              className="flex items-center gap-1 rounded-md border border-forge-orange/25 bg-forge-orange/10 px-2.5 py-1 text-[10px] font-semibold text-forge-orange hover:bg-forge-orange/15 disabled:opacity-50"
            >
              <Wrench className="h-3 w-3" /> Fix file
            </button>
          </div>

          {/* Diff content */}
          <UnifiedDiffView
            diff={cockpit?.selectedDiff?.diff}
            emptyMessage={busy && !cockpit ? 'Loading review cockpit…' : 'Select a changed file to inspect its diff.'}
          />
        </div>

        {/* ── Right: Readiness + PR comments ──────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-2" style={{ display: rightPanelCollapsed ? 'none' : undefined }}>

          {/* Readiness card */}
          <div className="shrink-0 rounded-xl border border-forge-border bg-forge-card/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-forge-muted">Readiness</p>
              <button
                disabled={busy}
                onClick={() => void loadCockpit(true, effectiveSelectedPath)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-forge-muted hover:bg-white/5 hover:text-forge-text/90 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <div className="space-y-2">
              {/* File change counts */}
              <div className="flex items-center justify-between text-[10px] text-forge-muted">
                <span>{cockpit?.files.length ?? 0} files changed</span>
                <span className="font-mono">
                  <span className="text-forge-green">+{totalAdds}</span>
                  <span className="ml-1 text-forge-red">-{totalDels}</span>
                </span>
              </div>
              {/* Risk + readiness badges */}
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  tone={
                    cockpit?.reviewSummary?.riskLevel === 'high'
                      ? 'red'
                      : cockpit?.reviewSummary?.riskLevel === 'medium'
                      ? 'yellow'
                      : 'green'
                  }
                >
                  {cockpit?.reviewSummary?.riskLevel ?? 'no'} risk
                </Badge>
                <Badge
                  tone={
                    cockpit?.mergeReadiness?.readinessLevel === 'blocked'
                      ? 'red'
                      : cockpit?.mergeReadiness?.readinessLevel === 'caution'
                      ? 'yellow'
                      : 'green'
                  }
                >
                  {cockpit?.mergeReadiness?.readinessLevel ?? 'unknown'} readiness
                </Badge>
              </div>
              {/* Summary text */}
              {cockpit?.reviewSummary?.summary && (
                <p className="text-[10px] leading-relaxed text-forge-muted line-clamp-3">
                  {cockpit.reviewSummary.summary}
                </p>
              )}
              {/* Merge readiness detail */}
              {cockpit?.mergeReadiness && (
                <div className="border-t border-forge-border/60 pt-2 text-[10px] text-forge-muted space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span>Ahead</span>
                    <span className="font-mono text-forge-green">{cockpit.mergeReadiness.aheadCount ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Behind</span>
                    <span className="font-mono text-forge-yellow">{cockpit.mergeReadiness.behindCount ?? '—'}</span>
                  </div>
                  {cockpit.mergeReadiness.activeRunStatus && (
                    <p className="truncate">Run: {cockpit.mergeReadiness.activeRunStatus}</p>
                  )}
                </div>
              )}
              {!cockpit && (
                <p className="text-[10px] text-forge-muted">{busy ? 'Loading…' : 'No data yet.'}</p>
              )}
            </div>
          </div>

          {/* PR comments card */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70">
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-forge-border px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-forge-muted">
                PR comments
              </p>
              <button
                disabled={busy}
                onClick={() => void sendPrompt('prepare_pr_summary')}
                className="flex items-center gap-1 rounded-md border border-forge-blue/20 bg-forge-blue/10 px-2.5 py-1 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
              >
                <Send className="h-3 w-3" /> PR summary
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-forge-border/40">
              {commentsForSelected.length === 0 ? (
                <p className="p-4 text-[12px] leading-relaxed text-forge-muted">
                  No comments for this file yet. Use <span className="font-semibold text-forge-text">PR comments</span> in the header to fetch team or Greptile feedback.
                </p>
              ) : (
                commentsForSelected.map((comment) => (
                  <div
                    id={`review-comment-${comment.commentId}`}
                    key={comment.commentId}
                    className={`p-3 ${targetCommentId === comment.commentId ? 'bg-forge-blue/10' : ''}`}
                  >
                    {/* Author + location */}
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-forge-text">
                        <MessageSquare className="h-3 w-3 shrink-0 text-forge-muted" />
                        {comment.author}
                      </span>
                      {(comment.path || comment.line) && (
                        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-forge-muted">
                          {comment.line ? `:${comment.line}` : 'general'}
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    <p className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-forge-text/80">
                      {comment.body}
                    </p>

                    {/* Actions */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => void sendPrompt('address_comment', comment)}
                        className="flex items-center gap-1 rounded-md border border-forge-orange/25 bg-forge-orange/10 px-2 py-1 text-[10px] font-semibold text-forge-orange hover:bg-forge-orange/15 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" /> Send
                      </button>
                      <button
                        disabled={busy || comment.state === 'resolved_local'}
                        onClick={() => void resolveComment(comment.commentId)}
                        className="flex items-center gap-1 rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50"
                      >
                        {comment.state === 'resolved_local' ? (
                          <CheckCircle2 className="h-3 w-3 text-forge-green" />
                        ) : null}
                        {comment.state === 'resolved_local' ? 'Resolved' : 'Resolve'}
                      </button>
                      {comment.url && (
                        <a
                          href={comment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-forge-blue hover:bg-forge-blue/10"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'neutral' | 'green' | 'yellow' | 'red' | 'blue';
  children: ReactNode;
}) {
  const classes = {
    neutral: 'border-forge-border bg-white/5 text-forge-muted',
    green: 'border-forge-green/25 bg-forge-green/10 text-forge-green',
    yellow: 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow',
    red: 'border-forge-red/25 bg-forge-red/10 text-forge-red',
    blue: 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue',
  }[tone];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classes}`}>
      {children}
    </span>
  );
}
