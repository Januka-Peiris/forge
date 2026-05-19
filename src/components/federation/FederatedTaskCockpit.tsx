import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, GitPullRequest, Network, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { CoordinationArtifact, CoordinationArtifactKind, CoordinationArtifactStatus } from '../../types/coordination-artifact';
import type { DiscoveredRepository, Workspace } from '../../types';
import type { RepositoryRelationship } from '../../types/repository-relationship';
import type { WorkspacePrStatus } from '../../types/pr-draft';
import { createCoordinationArtifact, deleteCoordinationArtifact, listCoordinationArtifacts, updateCoordinationArtifact, updateCoordinationArtifactStatus } from '../../lib/tauri-api/coordination-artifacts';
import { createWorkspacePr, getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { deriveCompanionWarnings, getFederatedGroup, summarizeGroupReadiness } from '../../lib/federation';
import { Button } from '../ui/button';

const KIND_OPTIONS: Array<{ value: CoordinationArtifactKind; label: string }> = [
  { value: 'api_diff', label: 'API diff' },
  { value: 'schema_change', label: 'Schema change' },
  { value: 'decision_summary', label: 'Decision summary' },
  { value: 'dependency_note', label: 'Dependency note' },
  { value: 'release_ordering_note', label: 'Release ordering' },
];
const STATUS_OPTIONS: CoordinationArtifactStatus[] = ['draft', 'active', 'resolved', 'dismissed'];

interface ArtifactFormState {
  editingId: string | null;
  artifactKind: CoordinationArtifactKind;
  targetWorkspaceId: string;
  title: string;
  body: string;
  status: CoordinationArtifactStatus;
}

const emptyForm: ArtifactFormState = { editingId: null, artifactKind: 'decision_summary', targetWorkspaceId: '', title: '', body: '', status: 'active' };

interface FederatedTaskCockpitProps {
  workspace: Workspace | null;
  workspaces: Workspace[];
  repositories: DiscoveredRepository[];
  relationships: RepositoryRelationship[];
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspaceForRepo?: (repositoryId: string, parentWorkspaceId?: string, sourceWorkspaceId?: string) => void;
}

export function FederatedTaskCockpit({ workspace, workspaces, repositories, relationships, onSelectWorkspace, onCreateWorkspaceForRepo }: FederatedTaskCockpitProps) {
  const group = useMemo(() => getFederatedGroup(workspace, workspaces), [workspace, workspaces]);
  const [artifacts, setArtifacts] = useState<CoordinationArtifact[]>([]);
  const [prStatuses, setPrStatuses] = useState<Record<string, WorkspacePrStatus | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ArtifactFormState>(emptyForm);
  const [artifactStatusFilter, setArtifactStatusFilter] = useState<CoordinationArtifactStatus | 'all'>('all');
  const [artifactKindFilter, setArtifactKindFilter] = useState<CoordinationArtifactKind | 'all'>('all');
  const [prCreatingByWorkspaceId, setPrCreatingByWorkspaceId] = useState<Record<string, boolean>>({});

  const warnings = useMemo(() => deriveCompanionWarnings(group, relationships, repositories), [group, relationships, repositories]);
  const readiness = useMemo(() => group ? summarizeGroupReadiness(group, artifacts, prStatuses, warnings) : null, [artifacts, group, prStatuses, warnings]);
  const visibleArtifacts = useMemo(() => artifacts.filter((artifact) => (artifactStatusFilter === 'all' || artifact.status === artifactStatusFilter) && (artifactKindFilter === 'all' || artifact.artifactKind === artifactKindFilter)), [artifactKindFilter, artifactStatusFilter, artifacts]);

  const refresh = useCallback(async () => {
    if (!workspace || !group) return;
    setLoading(true);
    setError(null);
    try {
      const [nextArtifacts, nextPrEntries] = await Promise.all([
        listCoordinationArtifacts(workspace.id),
        Promise.all(group.members.map(async (member) => [member.id, await getWorkspacePrStatus(member.id).catch(() => null)] as const)),
      ]);
      setArtifacts(nextArtifacts);
      setPrStatuses(Object.fromEntries(nextPrEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [group, workspace]);

  useEffect(() => {
    setArtifacts([]);
    setPrStatuses({});
    setForm(emptyForm);
    void refresh();
  }, [refresh]);

  if (!workspace || !group || group.members.length <= 1) return null;

  const resetForm = () => setForm(emptyForm);
  const editArtifact = (artifact: CoordinationArtifact) => setForm({
    editingId: artifact.id,
    artifactKind: artifact.artifactKind,
    targetWorkspaceId: artifact.targetWorkspaceId ?? '',
    title: artifact.title,
    body: artifact.body,
    status: artifact.status,
  });

  const submitArtifact = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { targetWorkspaceId: form.targetWorkspaceId || null, artifactKind: form.artifactKind, title: form.title.trim(), body: form.body.trim(), status: form.status };
      const saved = form.editingId
        ? await updateCoordinationArtifact({ id: form.editingId, ...payload })
        : await createCoordinationArtifact({ sourceWorkspaceId: workspace.id, ...payload });
      setArtifacts((current) => [saved, ...current.filter((artifact) => artifact.id !== saved.id)]);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const changeArtifactStatus = async (artifact: CoordinationArtifact, status: CoordinationArtifactStatus) => {
    setError(null);
    try {
      const updated = await updateCoordinationArtifactStatus({ id: artifact.id, status });
      setArtifacts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteArtifact = async (artifact: CoordinationArtifact) => {
    if (!window.confirm(`Delete coordination artifact "${artifact.title}"?`)) return;
    setError(null);
    try {
      await deleteCoordinationArtifact(artifact.id);
      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
      if (form.editingId === artifact.id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const createPrForMember = async (member: Workspace) => {
    if (prCreatingByWorkspaceId[member.id]) return;
    setError(null);
    setPrCreatingByWorkspaceId((current) => ({ ...current, [member.id]: true }));
    try {
      await createWorkspacePr(member.id);
      const status = await getWorkspacePrStatus(member.id).catch(() => null);
      setPrStatuses((current) => ({ ...current, [member.id]: status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrCreatingByWorkspaceId((current) => ({ ...current, [member.id]: false }));
    }
  };

  const activeArtifactCount = artifacts.filter((artifact) => artifact.status === 'active' || artifact.status === 'draft').length;
  const readinessClass = readiness?.level === 'ready'
    ? 'border-mn-cyan/30 bg-mn-cyan/10 text-mn-cyan'
    : readiness?.level === 'blocked'
      ? 'border-mn-red/30 bg-mn-red/10 text-mn-red'
      : 'border-mn-yellow/30 bg-mn-yellow/10 text-mn-yellow';

  return (
    <section className="mx-2 mt-2 rounded-xl border border-mn-border bg-mn-card/75 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-mn-orange" />
            <h2 className="text-sm font-bold text-mn-text">Federated task cockpit</h2>
            <span className="rounded border border-mn-border/70 bg-black/20 px-1.5 py-0.5 text-[10px] text-mn-muted">{group.members.length} repos</span>
            {activeArtifactCount > 0 && <span className="rounded border border-mn-blue/30 bg-mn-blue/10 px-1.5 py-0.5 text-[10px] text-mn-blue">{activeArtifactCount} artifact{activeArtifactCount === 1 ? '' : 's'} open</span>}
          </div>
          <p className="mt-1 text-xs text-mn-muted">Coordinate ship-together state across related repo workspaces.</p>
        </div>
        <div className="flex items-center gap-2">
          {readiness && <span className={`rounded border px-2 py-1 text-xs font-semibold ${readinessClass}`}>{readiness.label}</span>}
          <Button type="button" variant="ghost" size="xs" onClick={() => void refresh()} disabled={loading || saving}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 rounded border border-mn-red/30 bg-mn-red/10 px-2 py-1 text-xs text-mn-red">{error}</p>}
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-mn-muted/70">Group members & PR set</p>
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {group.members.map((member) => {
              const pr = prStatuses[member.id];
              return (
                <div
                  key={member.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectWorkspace(member.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectWorkspace(member.id); } }}
                  className={`rounded-lg border px-2 py-1.5 text-left hover:border-mn-orange/40 ${member.id === workspace.id ? 'border-mn-orange/40 bg-mn-orange/10' : 'border-mn-border/60 bg-black/10'}`}
                >
                  <div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-mn-text">{member.repo}</span><span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-mn-muted">{member.status}</span></div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-mn-muted">{member.branch}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-mn-muted"><GitPullRequest className="h-3 w-3" />{pr?.found ? (pr.url ? <a href={pr.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-mn-blue hover:underline">PR #{pr.number ?? '—'} · {pr.checksSummary}</a> : `PR #${pr.number ?? '—'} · ${pr.checksSummary}`) : (pr?.warning ? 'PR unavailable' : 'No PR found')}</p>
                  {!pr?.found && member.changedFiles.length > 0 && (
                    <Button
                      type="button"
                      variant="success"
                      size="xs"
                      className="mt-1"
                      disabled={prCreatingByWorkspaceId[member.id]}
                      onClick={(event) => { event.stopPropagation(); void createPrForMember(member); }}
                    >
                      {prCreatingByWorkspaceId[member.id] ? 'Creating PR…' : 'Create PR'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-mn-yellow/30 bg-mn-yellow/10 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-mn-yellow"><AlertTriangle className="h-3.5 w-3.5" /> Companion work warnings</div>
              <div className="space-y-1">
                {warnings.slice(0, 3).map((warning) => (
                  <div key={`${warning.repoId}:${warning.relationshipKind}`} className="flex items-start gap-2 text-xs text-mn-muted">
                    <span className="min-w-0 flex-1">{warning.reason}</span>
                    {onCreateWorkspaceForRepo && <Button type="button" variant="outline" size="xs" onClick={() => onCreateWorkspaceForRepo(warning.repoId, group.parentId, warning.relatedWorkspaceId)}>Create</Button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {readiness && (
            <div className="rounded-lg border border-mn-border/60 bg-black/10 p-2">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-mn-text">{readiness.level === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5 text-mn-cyan" /> : <AlertTriangle className="h-3.5 w-3.5 text-mn-yellow" />} Ship-together readiness</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-mn-muted">{readiness.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-mn-muted/70">Coordination artifacts</p>
            <select value={artifactStatusFilter} onChange={(event) => setArtifactStatusFilter(event.target.value as CoordinationArtifactStatus | 'all')} className="ml-auto rounded border border-mn-border bg-mn-card px-1 py-0.5 text-[11px] text-mn-text">
              <option value="all">all statuses</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={artifactKindFilter} onChange={(event) => setArtifactKindFilter(event.target.value as CoordinationArtifactKind | 'all')} className="rounded border border-mn-border bg-mn-card px-1 py-0.5 text-[11px] text-mn-text">
              <option value="all">all kinds</option>
              {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {artifacts.length === 0 && <p className="rounded-lg border border-dashed border-mn-border/60 px-2 py-2 text-xs text-mn-muted">No artifacts yet.</p>}
            {artifacts.length > 0 && visibleArtifacts.length === 0 && <p className="rounded-lg border border-dashed border-mn-border/60 px-2 py-2 text-xs text-mn-muted">No artifacts match the current filters.</p>}
            {visibleArtifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-lg border border-mn-border/60 bg-black/10 p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-mn-text">{artifact.title}</p><p className="mt-0.5 text-[11px] text-mn-muted">{artifact.artifactKind.replace(/_/g, ' ')} · {artifact.targetWorkspaceId ? `target ${group.members.find((member) => member.id === artifact.targetWorkspaceId)?.repo ?? artifact.targetWorkspaceId}` : 'group-wide'}</p></div>
                  <select value={artifact.status} onChange={(event) => void changeArtifactStatus(artifact, event.target.value as CoordinationArtifactStatus)} className="rounded border border-mn-border bg-mn-card px-1 py-0.5 text-[11px] text-mn-text">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => editArtifact(artifact)}><Pencil className="h-3 w-3" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => void deleteArtifact(artifact)}><Trash2 className="h-3 w-3 text-mn-red" /></Button>
                </div>
                {artifact.body && <p className="mt-1 line-clamp-2 text-xs text-mn-text/80">{artifact.body}</p>}
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-mn-border/60 bg-black/10 p-2">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-mn-text">{form.editingId ? 'Edit artifact' : 'Add artifact'}</p>{form.editingId && <Button type="button" variant="ghost" size="icon-xs" onClick={resetForm}><X className="h-3 w-3" /></Button>}</div>
            <div className="grid grid-cols-2 gap-1.5">
              <select value={form.artifactKind} onChange={(event) => setForm((current) => ({ ...current, artifactKind: event.target.value as CoordinationArtifactKind }))} className="rounded border border-mn-border bg-mn-card px-2 py-1 text-xs text-mn-text">{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select value={form.targetWorkspaceId} onChange={(event) => setForm((current) => ({ ...current, targetWorkspaceId: event.target.value }))} className="rounded border border-mn-border bg-mn-card px-2 py-1 text-xs text-mn-text"><option value="">Group-wide</option>{group.members.map((member) => <option key={member.id} value={member.id}>{member.repo}</option>)}</select>
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className="col-span-2 rounded border border-mn-border bg-mn-card px-2 py-1 text-xs text-mn-text placeholder:text-mn-muted/50" />
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Handoff details…" rows={2} className="col-span-2 resize-none rounded border border-mn-border bg-mn-card px-2 py-1 text-xs text-mn-text placeholder:text-mn-muted/50" />
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CoordinationArtifactStatus }))} className="rounded border border-mn-border bg-mn-card px-2 py-1 text-xs text-mn-text">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select>
              <Button type="button" size="xs" disabled={saving || !form.title.trim()} onClick={() => void submitArtifact()}><Plus className="h-3 w-3" /> {saving ? 'Saving…' : form.editingId ? 'Save' : 'Add'}</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
