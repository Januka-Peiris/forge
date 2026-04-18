import { useEffect, useMemo, useState } from 'react';
import {
  GitBranch, ArrowUp, ArrowDown, AlertTriangle,
  Clock, ExternalLink, Activity, AlertCircle, CheckCircle2, Circle,
  Link2, Plus, GitPullRequest, Loader2, ChevronRight
} from 'lucide-react';
import type {
  ActivityItem as ForgeActivityItem,
  DiscoveredRepository,
  LinkedWorktreeRef,
  Workspace,
} from '../../types';
import { listWorkspaceActivity } from '../../lib/tauri-api/activity';
import { setWorkspaceCostLimit } from '../../lib/tauri-api/workspaces';
import {
  getWorkspaceForgeConfig,
  runWorkspaceSetup,
  startWorkspaceRunCommand,
  stopWorkspaceRunCommands,
} from '../../lib/tauri-api/workspace-scripts';
import { getWorkspaceReadiness } from '../../lib/tauri-api/workspace-readiness';
import { listWorkspacePorts } from '../../lib/tauri-api/workspace-ports';
import { getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { cleanupWorkspace } from '../../lib/tauri-api/workspace-cleanup';
import { getWorkspaceChangedFiles } from '../../lib/tauri-api/git-review';
import {
  createWorkspaceCheckpoint,
  getWorkspaceCheckpointDiff,
  getWorkspaceCheckpointRestorePlan,
  listWorkspaceCheckpoints,
  restoreWorkspaceCheckpoint,
} from '../../lib/tauri-api/checkpoints';
import type { ForgeWorkspaceConfig } from '../../types/workspace-scripts';
import type { WorkspaceReadiness } from '../../types/workspace-readiness';
import type { WorkspacePrStatus } from '../../types/pr-draft';
import type { WorkspaceCheckpoint, WorkspaceCheckpointRestorePlan } from '../../types/checkpoint';
import type { WorkspaceChangedFile } from '../../types/git-review';
import { StatusBadge } from '../workspaces/StatusBadge';
import { ContextPreviewPanel } from '../context/ContextPreviewPanel';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { cockpitToneClass, deriveWorkspaceCockpit } from '../../lib/workspace-cockpit';
import { UnifiedDiffView } from '../reviews/UnifiedDiffView';

interface DetailPanelProps {
  workspace: Workspace | null;
  isArchived?: boolean;
  onCollapse?: () => void;
  onRefreshWorkspaceState?: () => void;
  onOpenInCursor?: () => void;
  onArchiveWorkspace?: () => void;
  onDeleteWorkspace?: () => void;
  onCreatePr?: () => Promise<{ prUrl: string; prNumber: number } | void>;
  onOpenReviewFile?: (path?: string) => void;
  activityItems?: ForgeActivityItem[];
  repositories?: DiscoveredRepository[];
  linkedWorktrees?: LinkedWorktreeRef[];
  onAttachLinkedWorktree?: (worktreeId: string) => void;
  onDetachLinkedWorktree?: (worktreeId: string) => void;
  onOpenLinkedWorktreeInCursor?: (path: string) => void;
  onCreateChildWorkspace?: () => void;
}

function CockpitLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-1.5">
      <span className="shrink-0 text-forge-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-forge-text/90" title={value}>
        {value}
      </span>
    </div>
  );
}

function ChecksShippingPanel({
  config,
  readiness,
  prStatus,
  portCount,
  loading,
  actionBusy,
  actionMessage,
  onRunSetup,
  onRunCommand,
  onStopRuns,
}: {
  config: ForgeWorkspaceConfig | null;
  readiness: WorkspaceReadiness | null;
  prStatus: WorkspacePrStatus | null;
  portCount: number | null;
  loading: boolean;
  actionBusy: string | null;
  actionMessage: string | null;
  onRunSetup: () => void;
  onRunCommand: (index: number) => void;
  onStopRuns: () => void;
}) {
  const runCount = config?.run.length ?? 0;
  const setupCount = config?.setup.length ?? 0;
  const teardownCount = config?.teardown.length ?? 0;
  const hasConfig = config?.exists;
  const testStatus = readiness?.testStatus ?? (runCount > 0 ? 'available' : 'not configured');
  const blockers = [
    readiness?.terminalHealth && readiness.terminalHealth !== 'healthy' ? `terminal: ${readiness.terminalHealth}` : null,
    readiness?.changedFiles === 0 ? 'no changes yet' : null,
    config?.warning ?? null,
    prStatus?.warning ?? null,
  ].filter((item): item is string => Boolean(item));
  const prLabel = prStatus?.found
    ? `#${prStatus.number ?? '?'} · ${prStatus.state ?? 'unknown'}${prStatus.isDraft ? ' · draft' : ''}`
    : 'No PR found';
  const reviewLabel = prStatus?.reviewDecision
    ? prStatus.reviewDecision.toLowerCase().replace(/_/g, ' ')
    : 'no review decision';

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Checks & Shipping</p>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-forge-muted" />}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <CockpitLine label="Config" value={hasConfig ? '.forge/config.json' : 'No config'} />
          <CockpitLine label="Checks" value={`${runCount} run command${runCount === 1 ? '' : 's'} · ${testStatus}`} />
          <CockpitLine label="Ports" value={portCount === null ? 'not scanned' : `${portCount} active`} />
          <CockpitLine label="GitHub PR" value={prLabel} />
          <CockpitLine label="CI" value={prStatus?.checksSummary ?? 'not checked'} />
          <CockpitLine label="Review" value={`${reviewLabel} · ${readiness?.prCommentCount ?? 0} comment(s)`} />
        </div>
        {(setupCount > 0 || runCount > 0 || teardownCount > 0) && (
          <>
            <div className="mt-2 flex flex-wrap gap-1">
              {setupCount > 0 && <span className="rounded border border-forge-blue/20 bg-forge-blue/10 px-1.5 py-0.5 text-xs text-forge-blue">{setupCount} setup</span>}
              {runCount > 0 && <span className="rounded border border-forge-green/20 bg-forge-green/10 px-1.5 py-0.5 text-xs text-forge-green">{runCount} run/check</span>}
              {teardownCount > 0 && <span className="rounded border border-forge-yellow/20 bg-forge-yellow/10 px-1.5 py-0.5 text-xs text-forge-yellow">{teardownCount} teardown</span>}
            </div>
            <div className="mt-3 space-y-2 rounded-lg border border-forge-border/60 bg-black/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={Boolean(actionBusy) || setupCount === 0}
                  onClick={onRunSetup}
                >
                  {actionBusy === 'setup' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Run setup
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={Boolean(actionBusy) || runCount === 0}
                  onClick={onStopRuns}
                >
                  {actionBusy === 'stop' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Stop checks
                </Button>
                <span className="text-xs text-forge-muted">Commands run in inspectable terminals and are written to activity.</span>
              </div>
              {config?.run.slice(0, 3).map((command, index) => (
                <div key={`${index}-${command}`} className="flex items-center justify-between gap-2 rounded border border-forge-border/50 bg-black/15 px-2 py-1">
                  <code className="min-w-0 truncate text-[11px] text-forge-muted" title={command}>{command}</code>
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={Boolean(actionBusy)}
                    onClick={() => onRunCommand(index)}
                  >
                    {actionBusy === `run-${index}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Run
                  </Button>
                </div>
              ))}
              {runCount > 3 && <p className="text-xs text-forge-muted">+{runCount - 3} more command(s) available in terminal tools.</p>}
              {actionMessage && <p className="text-xs text-forge-muted">{actionMessage}</p>}
            </div>
          </>
        )}
        {blockers.length > 0 && (
          <div className="mt-2 rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
            {blockers[0]}
          </div>
        )}
      </div>
    </div>
  );
}

function ShippingGuidePanel({
  changedFiles,
  runCount,
  prStatus,
  prCreating,
  cleanupBusy,
  message,
  onCreatePr,
  onRunFirstCheck,
  onCleanup,
}: {
  changedFiles: number;
  runCount: number;
  prStatus: WorkspacePrStatus | null;
  prCreating: boolean;
  cleanupBusy: boolean;
  message: string | null;
  onCreatePr: () => void;
  onRunFirstCheck: () => void;
  onCleanup: () => void;
}) {
  const hasChanges = changedFiles > 0;
  const hasPr = Boolean(prStatus?.found);
  const checksReady = runCount > 0 || (prStatus?.checksSummary && !['not checked', 'no checks'].includes(prStatus.checksSummary));
  const steps = [
    { label: 'Review changes', done: hasChanges, hint: hasChanges ? `${changedFiles} changed file(s)` : 'No local changes yet' },
    { label: 'Run checks', done: Boolean(checksReady), hint: runCount > 0 ? `${runCount} configured check(s)` : prStatus?.checksSummary ?? 'No checks configured' },
    { label: 'Prepare PR', done: hasPr, hint: hasPr ? `PR #${prStatus?.number ?? '?'}` : 'No PR linked yet' },
    { label: 'Cleanup/archive', done: false, hint: 'Stop run terminals and start teardown when finished' },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Ship Flow</p>
            <p className="mt-0.5 text-xs text-forge-muted">Guided local path: review → checks → PR → cleanup.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-2 rounded border border-forge-border/50 bg-black/10 px-2 py-1.5">
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-forge-green" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-forge-muted" />}
              <span className="min-w-0 flex-1 text-xs font-medium text-forge-text/90">{step.label}</span>
              <span className="min-w-0 truncate text-right text-xs text-forge-muted" title={step.hint}>{step.hint}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={runCount === 0} onClick={onRunFirstCheck}>
            Run first check
          </Button>
          <Button variant="secondary" size="xs" disabled={prCreating || hasPr || !hasChanges} onClick={onCreatePr}>
            {prCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
            {hasPr ? 'PR linked' : 'Create PR'}
          </Button>
          <Button variant="secondary" size="xs" disabled={cleanupBusy} onClick={onCleanup}>
            {cleanupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Cleanup
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-forge-muted">{message}</p>}
      </div>
    </div>
  );
}

function LifecyclePanel({
  isArchived,
  terminalHealth,
  cleanupBusy,
  message,
  onCleanup,
  onArchive,
  onDelete,
}: {
  isArchived: boolean;
  terminalHealth?: string | null;
  cleanupBusy: boolean;
  message: string | null;
  onCleanup: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Lifecycle</p>
          <p className="mt-0.5 text-xs text-forge-muted">Explicit workspace actions with safe defaults and recoverable history.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <CockpitLine label="View state" value={isArchived ? 'Archived — hidden from active flow' : 'Active — visible in cockpit'} />
          <CockpitLine label="Terminal state" value={terminalHealth ?? 'not checked'} />
          <CockpitLine label="Cleanup mode" value="Stop terminals + teardown only; no worktree removal" />
          <CockpitLine label="History" value="Activity, checkpoints, and context remain inspectable" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" disabled={cleanupBusy} onClick={onCleanup}>
            {cleanupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Safe cleanup
          </Button>
          <Button variant="secondary" size="xs" disabled={!onArchive} onClick={onArchive}>
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            variant="secondary"
            size="xs"
            disabled={!onDelete}
            onClick={onDelete}
            className="text-forge-red/80 hover:text-forge-red"
          >
            Delete workspace
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-forge-muted">{message}</p>}
      </div>
    </div>
  );
}

function ChangeUnderstandingPanel({
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

export function DetailPanel({
  workspace,
  isArchived = false,
  onCollapse,
  onRefreshWorkspaceState,
  onOpenInCursor,
  onArchiveWorkspace,
  onDeleteWorkspace,
  onCreatePr,
  onOpenReviewFile,
  activityItems = [],
  repositories = [],
  linkedWorktrees = [],
  onAttachLinkedWorktree,
  onDetachLinkedWorktree,
  onOpenLinkedWorktreeInCursor,
  onCreateChildWorkspace,
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'config'>('status');
  const [selectedLinkedWorktreeId, setSelectedLinkedWorktreeId] = useState('');
  const [prCreating, setPrCreating] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [timelineItems, setTimelineItems] = useState<ForgeActivityItem[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [forgeConfig, setForgeConfig] = useState<ForgeWorkspaceConfig | null>(null);
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WorkspaceReadiness | null>(null);
  const [workspacePrStatus, setWorkspacePrStatus] = useState<WorkspacePrStatus | null>(null);
  const [workspacePortCount, setWorkspacePortCount] = useState<number | null>(null);
  const [workspaceChangedFiles, setWorkspaceChangedFiles] = useState<WorkspaceChangedFile[]>([]);
  const [scriptActionBusy, setScriptActionBusy] = useState<string | null>(null);
  const [scriptActionMessage, setScriptActionMessage] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [selectedCheckpointRef, setSelectedCheckpointRef] = useState<string | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<string | null>(null);
  const [checkpointRestorePlan, setCheckpointRestorePlan] = useState<WorkspaceCheckpointRestorePlan | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [cockpitLoading, setCockpitLoading] = useState(false);
  const workspaceId = workspace?.id;
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setTimelineLoading(true);
    listWorkspaceActivity(workspaceId, 50)
      .then((items) => { if (!cancelled) setTimelineItems(items); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setForgeConfig(null);
      setWorkspaceReadiness(null);
      setWorkspacePrStatus(null);
      setWorkspacePortCount(null);
      setWorkspaceChangedFiles([]);
      setScriptActionBusy(null);
      setScriptActionMessage(null);
      setCheckpoints([]);
      setSelectedCheckpointRef(null);
      setCheckpointDiff(null);
      setCheckpointRestorePlan(null);
      return;
    }
    let cancelled = false;
    setCockpitLoading(true);
    Promise.allSettled([
      getWorkspaceForgeConfig(workspaceId),
      getWorkspaceReadiness(workspaceId),
      listWorkspacePorts(workspaceId),
      getWorkspacePrStatus(workspaceId),
      listWorkspaceCheckpoints(workspaceId),
      getWorkspaceChangedFiles(workspaceId),
    ])
      .then(([configResult, readinessResult, portsResult, prStatusResult, checkpointsResult, changedFilesResult]) => {
        if (cancelled) return;
        setForgeConfig(configResult.status === 'fulfilled' ? configResult.value : null);
        setWorkspaceReadiness(readinessResult.status === 'fulfilled' ? readinessResult.value : null);
        setWorkspacePortCount(portsResult.status === 'fulfilled' ? portsResult.value.length : null);
        setWorkspacePrStatus(prStatusResult.status === 'fulfilled' ? prStatusResult.value : null);
        setCheckpoints(checkpointsResult.status === 'fulfilled' ? checkpointsResult.value : []);
        setWorkspaceChangedFiles(changedFilesResult.status === 'fulfilled' ? changedFilesResult.value : []);
      })
      .finally(() => {
        if (!cancelled) setCockpitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const createManualCheckpoint = async () => {
    if (!workspaceId) return;
    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const checkpoint = await createWorkspaceCheckpoint(workspaceId, 'manual checkpoint from cockpit');
      setCheckpoints(await listWorkspaceCheckpoints(workspaceId));
      setCheckpointMessage(checkpoint ? 'Checkpoint created.' : 'No local changes to checkpoint.');
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const previewCheckpoint = async (checkpoint: WorkspaceCheckpoint) => {
    if (!workspaceId) return;
    if (selectedCheckpointRef === checkpoint.reference) {
      setSelectedCheckpointRef(null);
      setCheckpointDiff(null);
      setCheckpointRestorePlan(null);
      return;
    }
    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await getWorkspaceCheckpointDiff(workspaceId, checkpoint.reference);
      const plan = await getWorkspaceCheckpointRestorePlan(workspaceId, checkpoint.reference);
      setSelectedCheckpointRef(checkpoint.reference);
      setCheckpointDiff(result.diff);
      setCheckpointRestorePlan(plan);
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const refreshCockpitData = async () => {
    if (!workspaceId) return;
    const [configResult, readinessResult, portsResult, prStatusResult, checkpointsResult, changedFilesResult] = await Promise.allSettled([
      getWorkspaceForgeConfig(workspaceId),
      getWorkspaceReadiness(workspaceId),
      listWorkspacePorts(workspaceId),
      getWorkspacePrStatus(workspaceId),
      listWorkspaceCheckpoints(workspaceId),
      getWorkspaceChangedFiles(workspaceId),
    ]);
    setForgeConfig(configResult.status === 'fulfilled' ? configResult.value : null);
    setWorkspaceReadiness(readinessResult.status === 'fulfilled' ? readinessResult.value : null);
    setWorkspacePortCount(portsResult.status === 'fulfilled' ? portsResult.value.length : null);
    setWorkspacePrStatus(prStatusResult.status === 'fulfilled' ? prStatusResult.value : null);
    setCheckpoints(checkpointsResult.status === 'fulfilled' ? checkpointsResult.value : []);
    setWorkspaceChangedFiles(changedFilesResult.status === 'fulfilled' ? changedFilesResult.value : []);
  };

  const runSetupFromCockpit = async () => {
    if (!workspaceId) return;
    setScriptActionBusy('setup');
    setScriptActionMessage(null);
    try {
      const sessions = await runWorkspaceSetup(workspaceId);
      setScriptActionMessage(sessions.length > 0 ? `Started ${sessions.length} setup terminal(s).` : 'No setup commands were started.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const runCheckFromCockpit = async (index: number) => {
    if (!workspaceId) return;
    setScriptActionBusy(`run-${index}`);
    setScriptActionMessage(null);
    try {
      await startWorkspaceRunCommand(workspaceId, index);
      setScriptActionMessage(`Started check command ${index + 1}.`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const stopChecksFromCockpit = async () => {
    if (!workspaceId) return;
    setScriptActionBusy('stop');
    setScriptActionMessage(null);
    try {
      const sessions = await stopWorkspaceRunCommands(workspaceId);
      setScriptActionMessage(`Stopped ${sessions.length} run/check terminal(s).`);
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setScriptActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptActionBusy(null);
    }
  };

  const createPrFromCockpit = async () => {
    if (!onCreatePr) return;
    setPrCreating(true);
    setPrError(null);
    setShippingMessage(null);
    try {
      await onCreatePr();
      setShippingMessage('Pull request created or refreshed.');
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPrError(message);
      setShippingMessage(message);
    } finally {
      setPrCreating(false);
    }
  };

  const cleanupFromCockpit = async () => {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      [
        'Cleanup this workspace?',
        '',
        'Forge will stop running workspace terminals and start configured teardown commands.',
        'It will not remove the worktree or kill ports from this button.',
      ].join('\n'),
    );
    if (!confirmed) return;
    setCleanupBusy(true);
    setShippingMessage(null);
    try {
      const result = await cleanupWorkspace({
        workspaceId,
        killPorts: false,
        removeManagedWorktree: false,
      });
      setShippingMessage(
        `Cleanup started: stopped ${result.stoppedSessions} terminal(s), launched ${result.teardownSessions} teardown command(s).`,
      );
      await refreshCockpitData();
      onRefreshWorkspaceState?.();
    } catch (err) {
      setShippingMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCleanupBusy(false);
    }
  };

  const archiveFromCockpit = () => {
    if (!onArchiveWorkspace) return;
    const confirmed = window.confirm(
      isArchived
        ? 'Unarchive this workspace? It will return to the active workspace view.'
        : 'Archive this workspace? It will be hidden from the active view, but Forge keeps its history, checkpoints, and local files.',
    );
    if (confirmed) onArchiveWorkspace();
  };

  const restoreSelectedCheckpoint = async () => {
    if (!workspaceId || !selectedCheckpointRef || !checkpointRestorePlan) return;
    const confirmed = window.confirm(
      [
        'Restore this checkpoint into the workspace?',
        '',
        'Forge will only continue if the current workspace is clean.',
        'The checkpoint tree will be restored into the index and working tree without creating a commit.',
      ].join('\n'),
    );
    if (!confirmed) return;

    setCheckpointBusy(true);
    setCheckpointMessage(null);
    try {
      const result = await restoreWorkspaceCheckpoint(workspaceId, selectedCheckpointRef);
      setCheckpointMessage(result.message);
      setCheckpoints(await listWorkspaceCheckpoints(workspaceId));
      onRefreshWorkspaceState?.();
    } catch (err) {
      setCheckpointMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointBusy(false);
    }
  };

  const workspaceRepositoryId = workspace?.repositoryId;
  const linkedById = useMemo(
    () => new Set(linkedWorktrees.map((item) => item.worktreeId)),
    [linkedWorktrees],
  );
  const primaryPath = workspace?.workspaceRootPath ?? workspace?.selectedWorktreePath;
  const groupedAttachOptions = useMemo(() => {
    const search = linkedSearch.trim().toLowerCase();
    return repositories.map((repo) => ({
      repoId: repo.id,
      repoName: repo.name,
      worktrees: repo.worktrees.filter((wt) => {
        if (workspaceRepositoryId && repo.id === workspaceRepositoryId) return false;
        if (linkedById.has(wt.id)) return false;
        if (primaryPath && wt.path === primaryPath) return false;
        if (!search) return true;
        return (
          repo.name.toLowerCase().includes(search)
          || wt.path.toLowerCase().includes(search)
          || (wt.branch ?? '').toLowerCase().includes(search)
        );
      }),
    })).filter((group) => group.worktrees.length > 0);
  }, [linkedById, linkedSearch, primaryPath, repositories, workspaceRepositoryId]);

  if (!workspace) {
    return (
      <aside className="w-[300px] shrink-0 h-full bg-forge-surface flex flex-col items-center justify-center">
        <div className="text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-forge-card border border-forge-border flex items-center justify-center mx-auto mb-3">
            <Activity className="w-5 h-5 text-forge-muted" />
          </div>
          <p className="text-sm font-medium text-forge-muted">No workspace selected</p>
          <p className="text-sm text-forge-muted mt-1">Select a workspace to inspect it</p>
        </div>
      </aside>
    );
  }

  const riskColor = {
    Low: 'text-forge-green',
    Medium: 'text-forge-yellow',
    High: 'text-forge-red',
  }[workspace.mergeRisk];

  const sessionStatus = workspace.agentSession?.status ?? 'idle';
  const sessionModel = workspace.agentSession?.model ?? 'not started';
  const cockpit = deriveWorkspaceCockpit(workspace, { isArchived });
  const changedFileCount = workspaceReadiness?.changedFiles
    ?? (Array.isArray(workspace.changedFiles) ? workspace.changedFiles.length : workspace.changedFiles);
  const activityRows = activityItems.slice(0, 8).map((item) => {
    const tone = item.level === 'error'
      ? { icon: AlertCircle, color: 'bg-forge-red/70' }
      : item.level === 'warning'
      ? { icon: AlertTriangle, color: 'bg-forge-yellow/70' }
      : item.level === 'success'
      ? { icon: CheckCircle2, color: 'bg-forge-green/70' }
      : { icon: Circle, color: 'bg-forge-muted/60' };
    return {
      icon: tone.icon,
      color: tone.color,
      label: item.details ? `${item.event} · ${item.details}` : item.event,
      time: item.timestamp,
    };
  });

  return (
    <aside className="w-full shrink-0 h-full bg-forge-surface flex flex-col overflow-hidden">
      {/* Header — always visible */}
      <div className="px-4 py-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-bold text-forge-text truncate flex-1">{workspace.name}</h2>
          <StatusBadge status={workspace.status} />
          {onCollapse && (
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onCollapse}
              title="Collapse detail panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-forge-muted mt-1">
          <span className="text-forge-text/90 font-medium">{workspace.repo}</span>
          <span className="text-forge-muted">/</span>
          <GitBranch className="w-3 h-3 shrink-0 text-forge-muted" />
          <span className="font-mono truncate text-forge-text/90">{workspace.branch}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-forge-muted">{sessionStatus} · {sessionModel}</span>
        </div>
      </div>

      {/* Tab bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'status' | 'config')} className="flex flex-col flex-1 min-h-0">
        <TabsList className="px-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="status">
            {/* Cockpit Overview */}
            <div className="px-4 py-4">
              <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Workspace Cockpit</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${cockpitToneClass(cockpit.nextActionTone)}`}>
                    {cockpit.nextAction}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <CockpitLine label="Agent" value={cockpit.agentState} />
                  <CockpitLine label="Changes" value={cockpit.changeSummary} />
                  <CockpitLine label="Checks" value={cockpit.checkSummary} />
                  <CockpitLine label="Git / PR" value={`${cockpit.prSummary} · ${cockpit.trustSummary}`} />
                </div>
              </div>
            </div>

            {/* Current Task */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-1.5">Current Task</p>
              <p className="text-sm text-forge-text/90 leading-relaxed">{workspace.currentTask || <span className="text-forge-muted italic">No task set</span>}</p>
            </div>

            <ChecksShippingPanel
              config={forgeConfig}
              readiness={workspaceReadiness}
              prStatus={workspacePrStatus}
              portCount={workspacePortCount}
              loading={cockpitLoading}
              actionBusy={scriptActionBusy}
              actionMessage={scriptActionMessage}
              onRunSetup={() => void runSetupFromCockpit()}
              onRunCommand={(index) => void runCheckFromCockpit(index)}
              onStopRuns={() => void stopChecksFromCockpit()}
            />

            <ChangeUnderstandingPanel
              changedFiles={workspaceChangedFiles}
              loading={cockpitLoading}
              onOpenReviewFile={onOpenReviewFile}
            />

            <ShippingGuidePanel
              changedFiles={changedFileCount}
              runCount={forgeConfig?.run.length ?? 0}
              prStatus={workspacePrStatus}
              prCreating={prCreating}
              cleanupBusy={cleanupBusy}
              message={shippingMessage}
              onCreatePr={() => void createPrFromCockpit()}
              onRunFirstCheck={() => void runCheckFromCockpit(0)}
              onCleanup={() => void cleanupFromCockpit()}
            />

            <LifecyclePanel
              isArchived={isArchived}
              terminalHealth={workspaceReadiness?.terminalHealth}
              cleanupBusy={cleanupBusy}
              message={shippingMessage}
              onCleanup={() => void cleanupFromCockpit()}
              onArchive={onArchiveWorkspace ? archiveFromCockpit : undefined}
              onDelete={onDeleteWorkspace}
            />

            {/* Safe Iteration */}
            <div className="px-4 pb-4">
              <div className="rounded-xl border border-forge-border bg-forge-card/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Safe Iteration</p>
                    <p className="mt-0.5 text-xs text-forge-muted">Git-backed checkpoints before risky agent turns.</p>
                  </div>
                  <Button variant="secondary" size="xs" disabled={checkpointBusy} onClick={() => void createManualCheckpoint()}>
                    {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Checkpoint
                  </Button>
                </div>
                {checkpointMessage && <p className="mb-2 text-xs text-forge-muted">{checkpointMessage}</p>}
                {checkpoints.length === 0 ? (
                  <p className="text-xs text-forge-muted">No checkpoints yet. Forge creates them automatically before dirty agent runs.</p>
                ) : (
                  <div className="space-y-1">
                    {checkpoints.slice(0, 4).map((checkpoint) => (
                      <div key={checkpoint.reference} className="rounded border border-forge-border/60 bg-black/15 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-forge-text" title={checkpoint.subject}>
                            {checkpoint.subject || 'Forge checkpoint'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void previewCheckpoint(checkpoint)}
                            className="shrink-0 rounded border border-forge-border bg-white/5 px-1.5 py-0.5 font-mono text-xs text-forge-muted hover:bg-white/10 hover:text-forge-text"
                          >
                            {selectedCheckpointRef === checkpoint.reference ? 'hide' : checkpoint.shortOid}
                          </button>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-forge-muted/70" title={checkpoint.reference}>
                          {checkpoint.reference}
                        </p>
                        {selectedCheckpointRef === checkpoint.reference && (
                          <div className="mt-2 space-y-2">
                            {checkpointRestorePlan && (
                              <div className="rounded border border-forge-yellow/20 bg-forge-yellow/10 px-2 py-1.5 text-xs text-forge-yellow">
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
                                  onClick={() => void restoreSelectedCheckpoint()}
                                >
                                  {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  Restore checkpoint
                                </Button>
                              </div>
                            )}
                            <div className="max-h-72 overflow-hidden rounded border border-forge-border">
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
                      <p className="text-xs text-forge-muted">+{checkpoints.length - 4} more checkpoint(s)</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pull Request — prominent, dev-flow first */}
            <div className="px-4 pb-4">
              {workspace.prStatus && workspace.prNumber ? (
                <div className="flex items-center gap-2.5 rounded-lg bg-forge-green/10 border border-forge-green/20 px-3 py-2.5">
                  <GitPullRequest className="w-4 h-4 text-forge-green shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-forge-green">PR #{workspace.prNumber}</p>
                    <p className="text-xs text-forge-muted capitalize">{workspace.prStatus}</p>
                  </div>
                </div>
              ) : (
                <>
                  {prError && <p className="text-xs text-forge-red mb-2">{prError}</p>}
                  <button
                    disabled={prCreating || !onCreatePr}
                    onClick={() => void createPrFromCockpit()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-forge-green/15 hover:bg-forge-green/25 disabled:opacity-50 text-sm font-semibold text-forge-green border border-forge-green/20 transition-colors"
                  >
                    {prCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                    {prCreating ? 'Creating PR…' : 'Create Pull Request'}
                  </button>
                </>
              )}
            </div>

            {/* Activity — collapsed by default */}
            <div className="px-4 pb-2">
              <button
                type="button"
                onClick={() => setActivityOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-xs font-semibold text-forge-muted hover:text-forge-text/80 uppercase tracking-widest"
              >
                <ChevronRight className={`w-3 h-3 transition-transform ${activityOpen ? 'rotate-90' : ''}`} />
                Activity
                {timelineLoading && <Loader2 className="ml-1 w-3 h-3 animate-spin" />}
              </button>
              {activityOpen && (() => {
                const allItems = timelineItems.length > 0 ? timelineItems : activityRows.map((r, i) => ({
                  id: String(i), event: r.label, level: 'info' as const, timestamp: r.time,
                  repo: '', workspaceId: workspace.id,
                }));
                const visibleItems = timelineExpanded ? allItems : allItems.slice(0, 8);
                return (
                  <div className="mt-1.5 space-y-0.5">
                    {visibleItems.length === 0 ? (
                      <p className="text-xs text-forge-muted">No activity yet.</p>
                    ) : visibleItems.map((item, i) => {
                      const label = 'details' in item && item.details ? `${item.event} · ${item.details}` : item.event;
                      const time = 'timestamp' in item ? String(item.timestamp) : '';
                      const levelColor = item.level === 'error' ? 'text-forge-red' : item.level === 'warning' ? 'text-forge-yellow' : item.level === 'success' ? 'text-forge-green' : 'text-forge-muted';
                      return (
                        <div key={i} className="flex items-baseline gap-2">
                          <span className={`shrink-0 text-xs font-mono ${levelColor}`}>›</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-forge-text/85" title={label}>{label}</span>
                          <span className="shrink-0 text-[10px] text-forge-muted/60">{time}</span>
                        </div>
                      );
                    })}
                    {allItems.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setTimelineExpanded((e) => !e)}
                        className="mt-1 text-xs text-forge-muted hover:text-forge-text"
                      >
                        {timelineExpanded ? '↑ Show less' : `↓ ${allItems.length - 8} more`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          <TabsContent value="config">
            {/* Branch Health */}
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-3">Branch Health</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-green mb-1">
                    <ArrowUp className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Ahead</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.aheadBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-forge-yellow mb-1">
                    <ArrowDown className="w-3 h-3" />
                    <span className="text-xs text-forge-muted">Behind</span>
                  </div>
                  <p className="text-lg font-bold text-forge-text">{workspace.behindBy}</p>
                </div>
                <div className="bg-forge-card rounded-lg p-2.5 border border-forge-border/60 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-forge-muted" />
                    <span className="text-xs text-forge-muted">Risk</span>
                  </div>
                  <p className={`text-sm font-bold ${riskColor}`}>{workspace.mergeRisk}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-forge-muted">
                <Clock className="w-3 h-3 shrink-0" />
                <span>Last rebase: {workspace.lastRebase}</span>
              </div>
            </div>

            {/* Budget Cap */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Budget Cap</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(budgetInput);
                    void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat(budgetInput);
                      void setWorkspaceCostLimit(workspace.id, isNaN(val) || val <= 0 ? null : val).catch(() => undefined);
                    }
                  }}
                  placeholder={workspace.costLimitUsd ? `$${workspace.costLimitUsd.toFixed(2)}` : 'No cap'}
                  className="flex-1"
                />
                <span className="text-xs text-forge-muted shrink-0">USD</span>
              </div>
            </div>

            {/* Context Preview */}
            <div className="mx-4 pb-4">
              <ContextPreviewPanel workspaceId={workspace.id} />
            </div>

            {/* Linked Worktrees */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest mb-2">Linked Worktrees</p>
              <Input
                value={linkedSearch}
                onChange={(event) => setLinkedSearch(event.target.value)}
                placeholder="Search repos/worktrees..."
                className="mb-2"
              />
              <div className="flex gap-2 mb-2">
                <Select value={selectedLinkedWorktreeId} onValueChange={setSelectedLinkedWorktreeId}>
                  <SelectTrigger compact className="flex-1 min-w-0">
                    <SelectValue placeholder="Select worktree to attach" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedAttachOptions.length === 0 && (
                      <SelectItem value="" disabled>No worktrees available</SelectItem>
                    )}
                    {groupedAttachOptions.map((group) => (
                      <SelectGroup key={group.repoId}>
                        <SelectLabel>{group.repoName}</SelectLabel>
                        {group.worktrees.map((wt) => (
                          <SelectItem key={wt.id} value={wt.id}>
                            {wt.branch ?? 'detached'} · {wt.path}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => selectedLinkedWorktreeId && onAttachLinkedWorktree?.(selectedLinkedWorktreeId)}
                >
                  Attach
                </Button>
              </div>
              {linkedWorktrees.length === 0 ? (
                <p className="text-xs text-forge-muted leading-relaxed">No linked worktrees. Attach a worktree from another repo for supporting context.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedWorktrees.map((linked) => (
                    <div key={linked.worktreeId} className="rounded border border-forge-border/60 bg-forge-card/60 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-forge-text">
                        <Link2 className="w-3 h-3 text-forge-blue" />
                        <span className="font-semibold">{linked.repoName}</span>
                        <span className="font-mono text-forge-text/85">{linked.branch ?? 'detached'}</span>
                      </div>
                      <p className="mt-1 text-xs font-mono text-forge-muted truncate">{linked.path}</p>
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => onOpenLinkedWorktreeInCursor?.(linked.path)} className="text-xs text-forge-blue hover:underline">Open in Cursor</button>
                        <button onClick={() => onDetachLinkedWorktree?.(linked.worktreeId)} className="text-xs text-forge-red hover:underline">Detach</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lineage */}
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-forge-muted uppercase tracking-widest">Lineage</p>
                <Button variant="secondary" size="xs" onClick={onCreateChildWorkspace}>
                  <Plus className="w-3 h-3" /> Branch From Here
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-forge-muted">Parent: <span className="font-mono text-forge-text">{workspace.parentWorkspaceId ?? 'none'}</span></p>
                <p className="text-xs text-forge-muted">Source: <span className="font-mono text-forge-text">{workspace.sourceWorkspaceId ?? 'self'}</span></p>
                <p className="text-xs text-forge-muted">Derived: <span className="font-mono text-forge-text">{workspace.derivedFromBranch ?? workspace.branch}</span></p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer — always visible */}
      <div className="px-4 py-3 shrink-0 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenInCursor}
          className="w-full text-forge-blue hover:bg-forge-blue/15 border border-forge-blue/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Cursor
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={archiveFromCockpit}
            disabled={!onArchiveWorkspace}
            className="flex-1"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onDeleteWorkspace}
            className="flex-1 text-forge-red/70 hover:text-forge-red hover:bg-forge-red/10"
          >
            Delete
          </Button>
        </div>
      </div>
    </aside>
  );
}
