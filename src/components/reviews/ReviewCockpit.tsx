import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bot,
  CheckCircle2,
  FileCode,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Wrench,
  XCircle,
  AlertCircle,
  Info,
  ClipboardList,
  Plus,
  Minus,
} from 'lucide-react';
import type { AgentProfile, Workspace, WorkspacePrComment, WorkspaceReviewCockpit } from '../../types';
import {
  getWorkspaceReviewCockpit,
  markWorkspaceFileReviewed,
  markWorkspacePrCommentResolvedLocal,
  queueReviewAgentPrompt,
  reopenWorkspacePrThread,
  resolveWorkspacePrThread,
  refreshWorkspaceReviewCockpit,
  syncWorkspacePrThreads,
} from '../../lib/tauri-api/review-cockpit';
import { formatSessionError } from '../../lib/ui-errors';
import { measureAsync } from '../../lib/perf';
import {
  agentProfilesForPromptPicker,
  defaultWorkspaceAgentProfileId,
  listWorkspaceAgentProfiles,
} from '../../lib/tauri-api/agent-profiles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { UnifiedDiffView } from './UnifiedDiffView';
import { useAgentProfile } from '../../lib/hooks/useAgentProfile';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ReviewCockpitCommentItem } from './ReviewCockpitCommentItem';
import { ReviewBadge } from './ReviewBadge';
import {
  buildPrCommentGroups,
  computeDiffTotals,
  countReviewedFiles,
} from './reviewCockpitViewModel';

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
  const reviewedCount = useMemo(
    () => countReviewedFiles(cockpit?.files ?? []),
    [cockpit?.files],
  );
  const prCommentGroups = useMemo(() => {
    return buildPrCommentGroups(cockpit?.prComments ?? [], effectiveSelectedPath);
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
      setCockpit(await syncWorkspacePrThreads(workspaceId));
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const resolveCommentLocal = async (commentId: string) => {
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

  const resolveThread = async (commentId: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      setCockpit(await resolveWorkspacePrThread(workspaceId, commentId));
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const reopenThread = async (commentId: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      setCockpit(await reopenWorkspacePrThread(workspaceId, commentId));
    } catch (err) {
      setError(formatSessionError(err));
    } finally {
      setBusy(false);
    }
  };

  const { totalAdds, totalDels } = useMemo(
    () => computeDiffTotals(cockpit?.files ?? []),
    [cockpit?.files],
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-dashed border-forge-border p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-9 w-9 text-forge-muted" />
          <p className="text-ui-body font-semibold text-forge-text">No workspace selected</p>
          <p className="mt-1.5 text-ui-label leading-relaxed text-forge-muted">
            Select a workspace from the sidebar to start reviewing changes.
          </p>
        </div>
      </div>
    );
  }

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
                className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-forge-border bg-forge-surface-overlay px-2.5 py-1 text-ui-caption font-semibold text-forge-text/90 hover:bg-forge-surface-overlay-high"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Workspaces
              </button>
            )}
            <h1 className="truncate text-ui-headline font-bold text-forge-text">Review Cockpit</h1>
            <p className="mt-0.5 truncate text-ui-label text-forge-muted">
              {workspace.name} · {workspace.repo} / {workspace.branch}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              disabled={busy}
              onClick={() => void loadCockpit(true, effectiveSelectedPath)}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border bg-forge-surface-overlay px-3 py-1.5 text-ui-label font-semibold text-forge-text hover:bg-forge-surface-overlay-high disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              disabled={busy}
              onClick={() => void refreshComments()}
              className="flex items-center gap-1.5 rounded-lg border border-forge-blue/25 bg-forge-blue/10 px-3 py-1.5 text-ui-label font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              PR comments
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRightPanelCollapsed((current) => !current)}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border bg-forge-surface-overlay px-3 py-1.5 text-ui-label font-semibold text-forge-text hover:bg-forge-surface-overlay-high disabled:opacity-50"
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
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-full border border-forge-border bg-forge-surface-overlay px-2 py-0.5 text-ui-caption font-semibold text-forge-text/80 transition-all hover:bg-forge-surface-overlay-high">
                <FileCode className="h-3 w-3" />
                {cockpit?.files.length ?? 0}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2 text-ui-label">
              {cockpit?.files.length ?? 0} Files Changed
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-full border border-forge-green/20 bg-forge-green/10 px-2 py-0.5 text-ui-caption font-semibold text-forge-green transition-all hover:bg-forge-green/15">
                <CheckCircle2 className="h-3 w-3" />
                {reviewedCount}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2 text-ui-label">
              {reviewedCount} Accepted Changes
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-full border border-forge-border bg-forge-surface-overlay px-2 py-0.5 text-ui-caption font-semibold transition-all hover:bg-forge-surface-overlay-high">
                <span className="flex items-center text-forge-green"><Plus className="h-2.5 w-2.5" />{totalAdds}</span>
                <span className="h-3 w-px bg-forge-border" />
                <span className="flex items-center text-forge-red"><Minus className="h-2.5 w-2.5" />{totalDels}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2 text-ui-label">
              Churn: +{totalAdds} / -{totalDels} lines
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-full border border-forge-blue/20 bg-forge-blue/10 px-2 py-0.5 text-ui-caption font-semibold text-forge-blue transition-all hover:bg-forge-blue/15">
                <MessageSquare className="h-3 w-3" />
                {cockpit?.prComments.length ?? 0}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2 text-ui-label">
              {cockpit?.prComments.length ?? 0} PR Comments
            </PopoverContent>
          </Popover>
        </div>

        {/* Error / warning strip */}
        {(error || (cockpit?.warnings.length ?? 0) > 0) && (
          <div className="mt-2 rounded-lg border border-forge-yellow/20 bg-forge-yellow/10 px-3 py-2 text-ui-label text-forge-yellow">
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
            <p className="text-ui-caption font-bold uppercase tracking-wider text-forge-muted">
              Changed files
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-forge-border/40">
            {!cockpit && (
              <p className="p-3 text-ui-label text-forge-muted">
                {busy ? 'Loading…' : 'No data yet.'}
              </p>
            )}
            {cockpit?.files.length === 0 && (
              <p className="p-3 text-ui-label text-forge-muted">No changed files.</p>
            )}
            {cockpit?.files.map((item) => {
              const reviewed = item.review?.status === 'reviewed';
              const active = item.file.path === effectiveSelectedPath;
              const isRisky = (item.file.additions ?? 0) + (item.file.deletions ?? 0) > 100 || item.file.path.includes('config') || item.file.path.includes('.env');
              
              return (
                <button
                  key={item.file.path}
                  onClick={() => void selectFile(item.file.path)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-forge-surface-overlay ${
                    active ? 'bg-forge-green/10' : ''
                  }`}
                >
                  <div className="relative mt-0.5 shrink-0">
                    {reviewed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-forge-green" />
                    ) : (
                      <FileCode
                        className={`h-3.5 w-3.5 ${active ? 'text-forge-green' : 'text-forge-muted'}`}
                      />
                    )}
                    {isRisky && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forge-red opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-forge-red"></span>
                      </span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-mono text-ui-label ${
                        active ? 'text-forge-green' : 'text-forge-text/90'
                      }`}
                    >
                      {item.file.path}
                    </span>
                    <span className="mt-0.5 block text-ui-tiny uppercase tracking-wide text-forge-muted">
                      {item.file.status}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-ui-caption leading-none mt-0.5">
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
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="min-w-0 truncate font-mono text-ui-label font-semibold text-forge-text">
                {selectedFile?.file.path ?? 'No file selected'}
              </p>
              {(selectedFile?.file.path.includes('config') || selectedFile?.file.path.includes('.env')) && (
                <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-forge-red/10 border border-forge-red/25 text-ui-tiny font-bold text-forge-red uppercase tracking-tighter">
                  <ShieldCheck className="h-2.5 w-2.5" /> High Risk File
                </span>
              )}
            </div>
            <div className="shrink-0">
              {selectedFile?.review?.status === 'reviewed' ? (
                <button
                  disabled={busy}
                  onClick={() => void setReviewed(false)}
                  className="flex items-center gap-1 rounded-md border border-forge-yellow/25 bg-forge-yellow/10 px-2.5 py-1 text-ui-caption font-semibold text-forge-yellow hover:bg-forge-yellow/15 disabled:opacity-50"
                >
                  <XCircle className="h-3 w-3" /> Unaccept
                </button>
              ) : (
                <button
                  disabled={busy || !selectedFile}
                  onClick={() => void setReviewed(true)}
                  className="flex items-center gap-1 rounded-md bg-forge-green px-2.5 py-1 text-ui-caption font-bold text-white shadow-electric-glow hover:bg-forge-green-high disabled:opacity-50 transition-all"
                >
                  <ShieldCheck className="h-3 w-3" /> Accept
                </button>
              )}
            </div>
          </div>

          {/* Sub-row 2: agent selects + action buttons */}
          <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b border-forge-border px-3 py-2 bg-forge-surface/40">
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger compact><SelectValue /></SelectTrigger>
              <SelectContent>
                {agentProfilesForPromptPicker(agentProfiles).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedTaskMode} onValueChange={setSelectedTaskMode}>
              <SelectTrigger compact><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Review', 'Fix', 'Plan', 'Act'].map((mode) => (
                  <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedReasoning} onValueChange={setSelectedReasoning}>
              <SelectTrigger compact><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Default', 'Low', 'Medium', 'High'].map((level) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="mx-1 h-4 w-px bg-forge-border/60 shrink-0" />
            <button
              disabled={busy || !selectedFile}
              onClick={() => void sendPrompt('explain_diff')}
              className="flex items-center gap-1 rounded-md border border-forge-border bg-forge-surface-overlay px-2.5 py-1 text-ui-caption font-semibold text-forge-text/85 hover:bg-forge-surface-overlay-high disabled:opacity-50"
            >
              <Bot className="h-3 w-3" /> Explain
            </button>
            <button
              disabled={busy || !selectedFile}
              onClick={() => void sendPrompt('fix_file')}
              className="flex items-center gap-1 rounded-md bg-forge-green px-2.5 py-1 text-ui-caption font-bold text-white shadow-electric-glow hover:bg-forge-green-high disabled:opacity-50 transition-all"
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
              <p className="text-ui-caption font-bold uppercase tracking-wider text-forge-muted">Readiness</p>
              <button
                disabled={busy}
                onClick={() => void loadCockpit(true, effectiveSelectedPath)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ui-caption text-forge-muted hover:bg-forge-surface-overlay hover:text-forge-text/90 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <div className="space-y-2">
              {/* File change counts */}
              <div className="flex items-center justify-between text-ui-caption text-forge-muted">
                <span>{cockpit?.files.length ?? 0} files changed</span>
                <span className="font-mono">
                  <span className="text-forge-green">+{totalAdds}</span>
                  <span className="ml-1 text-forge-red">-{totalDels}</span>
                </span>
              </div>
              {/* Risk + readiness badges */}
              <div className="flex flex-wrap gap-1.5">
                <ReviewBadge
                  tone={
                    cockpit?.reviewSummary?.riskLevel === 'high'
                      ? 'red'
                      : cockpit?.reviewSummary?.riskLevel === 'medium'
                      ? 'yellow'
                      : 'green'
                  }
                >
                  {cockpit?.reviewSummary?.riskLevel ?? 'no'} risk
                </ReviewBadge>
                <ReviewBadge
                  tone={
                    cockpit?.mergeReadiness?.readinessLevel === 'blocked'
                      ? 'red'
                      : cockpit?.mergeReadiness?.readinessLevel === 'caution'
                      ? 'yellow'
                      : 'green'
                  }
                >
                  {cockpit?.mergeReadiness?.readinessLevel ?? 'unknown'} readiness
                </ReviewBadge>
              </div>
              {/* Summary text */}
              {cockpit?.reviewSummary?.summary && (
                <p className="text-ui-caption leading-relaxed text-forge-muted line-clamp-3">
                  {cockpit.reviewSummary.summary}
                </p>
              )}
              {/* Merge readiness detail */}
              {cockpit?.mergeReadiness && (
                <div className="border-t border-forge-border/60 pt-2 text-ui-caption text-forge-muted space-y-0.5">
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
                  <p className="text-ui-caption text-forge-muted">{busy ? 'Loading…' : 'No data yet.'}</p>
                  )}
                  </div>
                  </div>

                  {/* Pre-Flight Health card */}
                  <div className="shrink-0 rounded-xl border border-forge-border bg-forge-card/70 p-3">
                  <p className="mb-2 text-ui-caption font-bold uppercase tracking-wider text-forge-muted flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Pre-Flight Health
                  </p>
                  <div className="space-y-1.5">
                  {!cockpit?.mergeReadiness?.preFlightChecks?.length && (
                  <p className="text-ui-caption text-forge-muted italic">No automated checks run yet.</p>
                  )}
                  {cockpit?.mergeReadiness?.preFlightChecks.map((check) => {
                  const statusColor = check.status === 'pass' ? 'text-forge-green' : check.status === 'fail' ? 'text-forge-red' : 'text-forge-yellow';
                  const StatusIcon = check.status === 'pass' ? CheckCircle2 : check.status === 'fail' ? AlertCircle : Info;

                  return (
                  <div key={check.id} className="rounded-lg border border-forge-border/40 bg-black/10 p-2">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-ui-caption font-bold text-forge-text/90">{check.label}</span>
                      <StatusIcon className={`h-3 w-3 ${statusColor}`} />
                    </div>
                    <p className="text-ui-tiny text-forge-muted leading-snug">{check.message}</p>
                  </div>
                  );
                  })}
                  </div>
                  </div>

                  {/* PR comments list */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70">
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-forge-border px-3 py-2">
              <p className="text-ui-caption font-bold uppercase tracking-wider text-forge-muted">
                PR comments
              </p>
              <button
                disabled={busy}
                onClick={() => void sendPrompt('prepare_pr_summary')}
                className="flex items-center gap-1 rounded-md border border-forge-blue/20 bg-forge-blue/10 px-2.5 py-1 text-ui-caption font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
              >
                <Send className="h-3 w-3" /> PR summary
              </button>
            </div>

            <div className="shrink-0 border-b border-forge-border/60 px-3 py-2 text-ui-caption text-forge-muted">
              {prCommentGroups.total === 0 ? (
                <span>No PR comments cached</span>
              ) : (
                <span>
                  <span className="font-semibold text-forge-text/85">{prCommentGroups.openCount}</span> needing attention · {prCommentGroups.fileGroups.length} file group{prCommentGroups.fileGroups.length === 1 ? '' : 's'} · {prCommentGroups.general.length} general
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-forge-border/40">
              {prCommentGroups.total === 0 ? (
                <p className="p-4 text-ui-body leading-relaxed text-forge-muted">
                  No PR comments cached yet. Use <span className="font-semibold text-forge-text">PR comments</span> in the header to fetch team or Greptile feedback.
                </p>
              ) : (
                <>
                  {prCommentGroups.fileGroups.map((group) => (
                    <div key={group.path}>
                      <button
                        type="button"
                        onClick={() => void selectFile(group.path)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ui-caption font-bold uppercase tracking-wider hover:bg-forge-surface-overlay ${group.path === effectiveSelectedPath ? 'bg-forge-green/10 text-forge-green' : 'text-forge-muted'}`}
                      >
                        <span className="min-w-0 truncate">{group.path}</span>
                        <span className="shrink-0 rounded bg-forge-surface-overlay px-1.5 py-0.5 font-mono">{group.comments.length}</span>
                      </button>
                      <div className="divide-y divide-forge-border/40">
                        {group.comments.map((comment) => (
                          <ReviewCockpitCommentItem
                            key={comment.commentId}
                            comment={comment}
                            busy={busy}
                            targetCommentId={targetCommentId}
                            effectiveSelectedPath={effectiveSelectedPath}
                            onSelectFile={(path) => void selectFile(path)}
                            onSendPrompt={(action, payload) => void sendPrompt(action, payload)}
                            onResolveCommentLocal={(commentId) => void resolveCommentLocal(commentId)}
                            onResolveThread={(commentId) => void resolveThread(commentId)}
                            onReopenThread={(commentId) => void reopenThread(commentId)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {prCommentGroups.general.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-ui-caption font-bold uppercase tracking-wider text-forge-muted">
                        <span>General comments</span>
                        <span className="rounded bg-forge-surface-overlay px-1.5 py-0.5 font-mono">{prCommentGroups.general.length}</span>
                      </div>
                      <div className="divide-y divide-forge-border/40">
                        {prCommentGroups.general.map((comment) => (
                          <ReviewCockpitCommentItem
                            key={comment.commentId}
                            comment={comment}
                            busy={busy}
                            targetCommentId={targetCommentId}
                            effectiveSelectedPath={effectiveSelectedPath}
                            onSelectFile={(path) => void selectFile(path)}
                            onSendPrompt={(action, payload) => void sendPrompt(action, payload)}
                            onResolveCommentLocal={(commentId) => void resolveCommentLocal(commentId)}
                            onResolveThread={(commentId) => void resolveThread(commentId)}
                            onReopenThread={(commentId) => void reopenThread(commentId)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
