import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, GitPullRequest, Network, Plus, RefreshCw } from 'lucide-react';
import type { CoordinationArtifact } from '../../types/coordination-artifact';
import type { DiscoveredRepository, Workspace } from '../../types';
import type { RepositoryRelationship } from '../../types/repository-relationship';
import type { WorkspacePrStatus } from '../../types/pr-draft';
import { deriveCompanionWarnings, listFederatedGroups, summarizeGroupReadiness } from '../../lib/federation';
import { listCoordinationArtifacts } from '../../lib/tauri-api/coordination-artifacts';
import { createWorkspacePr, getWorkspacePrStatus } from '../../lib/tauri-api/pr-draft';
import { Button } from '../ui/button';

interface FederatedTasksViewProps {
  workspaces: Workspace[];
  repositories: DiscoveredRepository[];
  relationships: RepositoryRelationship[];
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspace: () => void;
  onCreateWorkspaceForRepo?: (repositoryId: string, parentWorkspaceId?: string, sourceWorkspaceId?: string) => void;
}

export function FederatedTasksView({ workspaces, repositories, relationships, onSelectWorkspace, onOpenWorkspace, onCreateWorkspaceForRepo }: FederatedTasksViewProps) {
  const groups = useMemo(() => listFederatedGroups(workspaces), [workspaces]);
  const [artifactsByParentId, setArtifactsByParentId] = useState<Record<string, CoordinationArtifact[]>>({});
  const [prStatusesByParentId, setPrStatusesByParentId] = useState<Record<string, Record<string, WorkspacePrStatus | null>>>({});
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [prCreatingByWorkspaceId, setPrCreatingByWorkspaceId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (groups.length === 0) {
      setArtifactsByParentId({});
      setPrStatusesByParentId({});
      setLoadingSignals(false);
      setSignalError(null);
      return () => { cancelled = true; };
    }
    setLoadingSignals(true);
    setSignalError(null);
    void Promise.all(groups.map(async (group) => {
      const [artifacts, prEntries] = await Promise.all([
        listCoordinationArtifacts(group.parentId).catch(() => []),
        Promise.all(group.members.map(async (member) => [member.id, await getWorkspacePrStatus(member.id).catch(() => null)] as const)),
      ]);
      return [group.parentId, artifacts, Object.fromEntries(prEntries)] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        setArtifactsByParentId(Object.fromEntries(entries.map(([parentId, artifacts]) => [parentId, artifacts])));
        setPrStatusesByParentId(Object.fromEntries(entries.map(([parentId, , prStatuses]) => [parentId, prStatuses])));
        setSignalError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSignalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingSignals(false);
      });
    return () => { cancelled = true; };
  }, [groups]);

  const refreshSignals = async () => {
    setLoadingSignals(true);
    setSignalError(null);
    try {
      const entries = await Promise.all(groups.map(async (group) => {
        const [artifacts, prEntries] = await Promise.all([
          listCoordinationArtifacts(group.parentId).catch(() => []),
          Promise.all(group.members.map(async (member) => [member.id, await getWorkspacePrStatus(member.id).catch(() => null)] as const)),
        ]);
        return [group.parentId, artifacts, Object.fromEntries(prEntries)] as const;
      }));
      setArtifactsByParentId(Object.fromEntries(entries.map(([parentId, artifacts]) => [parentId, artifacts])));
      setPrStatusesByParentId(Object.fromEntries(entries.map(([parentId, , prStatuses]) => [parentId, prStatuses])));
    } catch (error) {
      setSignalError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSignals(false);
    }
  };

  const createPrForMember = async (parentId: string, member: Workspace) => {
    setSignalError(null);
    setPrCreatingByWorkspaceId((current) => ({ ...current, [member.id]: true }));
    try {
      await createWorkspacePr(member.id);
      const status = await getWorkspacePrStatus(member.id).catch(() => null);
      setPrStatusesByParentId((current) => ({
        ...current,
        [parentId]: {
          ...(current[parentId] ?? {}),
          [member.id]: status,
        },
      }));
    } catch (error) {
      setSignalError(error instanceof Error ? error.message : String(error));
    } finally {
      setPrCreatingByWorkspaceId((current) => ({ ...current, [member.id]: false }));
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-forge-bg p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-forge-orange" />
              <h1 className="text-xl font-bold text-forge-text">Federated tasks</h1>
            </div>
            <p className="mt-1 text-sm text-forge-muted">All multi-repo workspace groups and their ship-together signals.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refreshSignals()} disabled={loadingSignals}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingSignals ? 'animate-spin' : ''}`} />
            Refresh signals
          </Button>
        </div>
        {signalError && <p className="mb-3 rounded border border-forge-red/30 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">{signalError}</p>}

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-forge-border bg-forge-card/60 p-8 text-center">
            <Network className="mx-auto mb-3 h-8 w-8 text-forge-muted" />
            <p className="text-sm font-semibold text-forge-text">No federated tasks yet</p>
            <p className="mt-1 text-sm text-forge-muted">Create a workspace with selected related repositories to start a federated group.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group) => {
              const artifacts = artifactsByParentId[group.parentId] ?? [];
              const unresolved = artifacts.filter((artifact) => artifact.status === 'active' || artifact.status === 'draft');
              const warnings = deriveCompanionWarnings(group, relationships, repositories);
              const prStatuses = prStatusesByParentId[group.parentId] ?? {};
              const readiness = summarizeGroupReadiness(group, artifacts, prStatuses, warnings);
              const running = group.members.filter((workspace) => workspace.status === 'Running').length;
              const review = group.members.filter((workspace) => workspace.status === 'Review Ready').length;
              const blocked = group.members.filter((workspace) => workspace.status === 'Blocked').length;
              const prsFound = group.members.filter((member) => prStatuses[member.id]?.found).length;
              const prsWithFailingChecks = group.members.filter((member) => prStatuses[member.id]?.checksSummary.toLowerCase().includes('failing')).length;
              const prsWithPendingChecks = group.members.filter((member) => prStatuses[member.id]?.checksSummary.toLowerCase().includes('pending')).length;
              return (
                <section key={group.parentId} className="rounded-xl border border-forge-border bg-forge-card/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-forge-text">{group.parent.name}</p>
                      <p className="mt-0.5 truncate text-xs text-forge-muted">Parent <span className="font-mono">{group.parentId}</span></p>
                    </div>
                    <Button type="button" size="xs" onClick={() => { onSelectWorkspace(group.parentId); onOpenWorkspace(); }}>Open</Button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded border border-forge-border/70 bg-black/20 px-2 py-0.5 text-forge-muted">{group.members.length} repos</span>
                    {running > 0 && <span className="rounded border border-forge-blue/30 bg-forge-blue/10 px-2 py-0.5 text-forge-blue">{running} running</span>}
                    {review > 0 && <span className="rounded border border-forge-green/30 bg-forge-green/10 px-2 py-0.5 text-forge-green">{review} review</span>}
                    {blocked > 0 && <span className="rounded border border-forge-red/30 bg-forge-red/10 px-2 py-0.5 text-forge-red">{blocked} blocked</span>}
                    <span className="rounded border border-forge-blue/30 bg-forge-blue/10 px-2 py-0.5 text-forge-blue">{prsFound}/{group.members.length} PRs</span>
                    {prsWithPendingChecks > 0 && <span className="rounded border border-forge-yellow/30 bg-forge-yellow/10 px-2 py-0.5 text-forge-yellow">{prsWithPendingChecks} pending checks</span>}
                    {prsWithFailingChecks > 0 && <span className="rounded border border-forge-red/30 bg-forge-red/10 px-2 py-0.5 text-forge-red">{prsWithFailingChecks} failing checks</span>}
                    {unresolved.length > 0 && <span className="rounded border border-forge-yellow/30 bg-forge-yellow/10 px-2 py-0.5 text-forge-yellow">{unresolved.length} open artifacts</span>}
                    {warnings.length > 0 && <span className="rounded border border-forge-yellow/30 bg-forge-yellow/10 px-2 py-0.5 text-forge-yellow">{warnings.length} companion warnings</span>}
                    <span className={`rounded border px-2 py-0.5 ${readiness.level === 'ready' ? 'border-forge-green/30 bg-forge-green/10 text-forge-green' : readiness.level === 'blocked' ? 'border-forge-red/30 bg-forge-red/10 text-forge-red' : 'border-forge-yellow/30 bg-forge-yellow/10 text-forge-yellow'}`}>{readiness.label}</span>
                  </div>

                  <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 p-2">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-forge-text">
                      {readiness.level === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5 text-forge-green" /> : <AlertTriangle className="h-3.5 w-3.5 text-forge-yellow" />}
                      Ship-together readiness
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-forge-muted">
                      {readiness.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {group.members.map((member) => {
                      const pr = prStatuses[member.id];
                      return (
                        <div key={member.id} role="button" tabIndex={0} onClick={() => { onSelectWorkspace(member.id); onOpenWorkspace(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectWorkspace(member.id); onOpenWorkspace(); } }} className="rounded-lg border border-forge-border/60 bg-black/10 px-2 py-1.5 text-left hover:border-forge-orange/40">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold text-forge-text">{member.repo}</span>
                            <span className="ml-auto text-[10px] text-forge-muted">{member.status}</span>
                          </div>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-forge-muted">{member.branch}</p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-forge-muted">
                            <GitPullRequest className="h-3 w-3" />
                            {pr?.found ? (pr.url ? <a href={pr.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-forge-blue hover:underline">PR #{pr.number ?? '—'} · {pr.checksSummary}</a> : `PR #${pr.number ?? '—'} · ${pr.checksSummary}`) : (pr?.warning ? 'PR unavailable' : 'No PR found')}
                          </p>
                          {!pr?.found && member.changedFiles.length > 0 && (
                            <Button type="button" variant="success" size="xs" className="mt-1" disabled={prCreatingByWorkspaceId[member.id]} onClick={(event) => { event.stopPropagation(); void createPrForMember(group.parentId, member); }}>
                              <Plus className="h-3 w-3" />
                              {prCreatingByWorkspaceId[member.id] ? 'Creating PR…' : 'Create PR'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {unresolved.length > 0 && (
                    <div className="mt-3 rounded-lg border border-forge-border/60 bg-black/10 p-2">
                      <p className="mb-1 text-xs font-semibold text-forge-text">Open coordination artifacts</p>
                      {unresolved.slice(0, 4).map((artifact) => (
                        <div key={artifact.id} className="border-t border-forge-border/40 py-1 first:border-t-0 first:pt-0">
                          <p className="truncate text-xs font-semibold text-forge-text">
                            <span className="text-forge-yellow">{artifact.status}</span> · {artifact.title}
                          </p>
                          <p className="truncate text-[11px] text-forge-muted">
                            {artifact.artifactKind.replace(/_/g, ' ')}
                            {' · '}
                            source {group.members.find((member) => member.id === artifact.sourceWorkspaceId)?.repo ?? artifact.sourceWorkspaceId}
                            {' · '}
                            {artifact.targetWorkspaceId ? `target ${group.members.find((member) => member.id === artifact.targetWorkspaceId)?.repo ?? artifact.targetWorkspaceId}` : 'group-wide'}
                          </p>
                          {artifact.body && <p className="line-clamp-2 text-xs text-forge-text/75">{artifact.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-forge-yellow/30 bg-forge-yellow/10 p-2">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-forge-yellow"><AlertTriangle className="h-3.5 w-3.5" />Missing companion work</p>
                      {warnings.slice(0, 3).map((warning) => (
                        <div key={`${warning.repoId}:${warning.relationshipKind}`} className="flex items-center gap-2 text-xs text-forge-muted">
                          <span className="min-w-0 flex-1">{warning.reason}</span>
                          {onCreateWorkspaceForRepo && <Button type="button" size="xs" variant="outline" onClick={() => onCreateWorkspaceForRepo(warning.repoId, group.parentId, warning.relatedWorkspaceId)}>Create</Button>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
