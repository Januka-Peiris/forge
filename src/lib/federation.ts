import type { CoordinationArtifact } from '../types/coordination-artifact';
import type { DiscoveredRepository, Workspace } from '../types';
import type { RepositoryRelationship } from '../types/repository-relationship';
import type { WorkspacePrStatus } from '../types/pr-draft';

export interface FederatedWorkspaceGroup {
  parentId: string;
  parent: Workspace;
  members: Workspace[];
}

export interface CompanionWorkWarning {
  repoId: string;
  repoName: string;
  relationshipKind: string;
  relatedWorkspaceId: string;
  reason: string;
}

export function parentWorkspaceId(workspace: Workspace): string {
  return workspace.parentWorkspaceId || workspace.id;
}

export function getFederatedGroup(workspace: Workspace | null, workspaces: Workspace[]): FederatedWorkspaceGroup | null {
  if (!workspace) return null;
  const parentId = parentWorkspaceId(workspace);
  const parent = workspaces.find((candidate) => candidate.id === parentId) ?? workspace;
  const members = workspaces
    .filter((candidate) => candidate.id === parent.id || candidate.parentWorkspaceId === parent.id)
    .sort((a, b) => (a.id === parent.id ? -1 : b.id === parent.id ? 1 : a.repo.localeCompare(b.repo)));
  return { parentId: parent.id, parent, members: members.length > 0 ? members : [workspace] };
}

export function listFederatedGroups(workspaces: Workspace[]): FederatedWorkspaceGroup[] {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const parentIds = new Set(workspaces.map(parentWorkspaceId));
  return Array.from(parentIds)
    .map((parentId) => {
      const parent = byId.get(parentId);
      if (!parent) return null;
      const members = workspaces
        .filter((workspace) => workspace.id === parentId || workspace.parentWorkspaceId === parentId)
        .sort((a, b) => (a.id === parentId ? -1 : b.id === parentId ? 1 : a.repo.localeCompare(b.repo)));
      return members.length > 1 ? { parentId, parent, members } : null;
    })
    .filter((group): group is FederatedWorkspaceGroup => group !== null);
}

export function deriveCompanionWarnings(
  group: FederatedWorkspaceGroup | null,
  relationships: RepositoryRelationship[],
  repositories: DiscoveredRepository[],
): CompanionWorkWarning[] {
  if (!group) return [];
  const memberRepoIds = new Set(group.members.map((workspace) => workspace.repositoryId).filter((id): id is string => Boolean(id)));
  if (memberRepoIds.size === 0) return [];
  const repoById = new Map(repositories.map((repo) => [repo.id, repo]));
  const warnings = new Map<string, CompanionWorkWarning>();

  for (const relationship of relationships) {
    const fromInGroup = memberRepoIds.has(relationship.fromRepoId);
    const toInGroup = memberRepoIds.has(relationship.toRepoId);
    if (fromInGroup === toInGroup) continue;
    const missingRepoId = fromInGroup ? relationship.toRepoId : relationship.fromRepoId;
    if (memberRepoIds.has(missingRepoId)) continue;
    const relatedWorkspace = group.members.find((workspace) => workspace.repositoryId === (fromInGroup ? relationship.fromRepoId : relationship.toRepoId));
    const relatedWorkspaceId = relatedWorkspace?.id ?? group.parentId;
    const relatedRepoName = relatedWorkspace?.repo ?? (fromInGroup ? relationship.fromRepoName : relationship.toRepoName);
    const repoName = repoById.get(missingRepoId)?.name ?? (fromInGroup ? relationship.toRepoName : relationship.fromRepoName);
    const key = `${missingRepoId}:${relationship.kind}`;
    if (!warnings.has(key)) {
      warnings.set(key, {
        repoId: missingRepoId,
        repoName,
        relationshipKind: relationship.kind,
        relatedWorkspaceId,
        reason: `${repoName} is related to ${relatedRepoName} via ${relationship.kind.replace(/_/g, ' ')} but has no workspace in this group.`,
      });
    }
  }
  return Array.from(warnings.values()).sort((a, b) => a.repoName.localeCompare(b.repoName));
}

export function summarizeGroupReadiness(
  group: FederatedWorkspaceGroup,
  artifacts: CoordinationArtifact[],
  prStatuses: Record<string, WorkspacePrStatus | null>,
  warnings: CompanionWorkWarning[],
): { level: 'ready' | 'caution' | 'blocked'; label: string; reasons: string[] } {
  const reasons: string[] = [];
  const activeArtifacts = artifacts.filter((artifact) => artifact.status === 'active' || artifact.status === 'draft');
  if (activeArtifacts.length > 0) reasons.push(`${activeArtifacts.length} unresolved artifact${activeArtifacts.length === 1 ? '' : 's'}`);
  if (warnings.length > 0) reasons.push(`${warnings.length} missing companion repo${warnings.length === 1 ? '' : 's'}`);
  const missingPrs = group.members.filter((member) => !prStatuses[member.id]?.found).length;
  const failingChecks = group.members.filter((member) => prStatuses[member.id]?.checksSummary.toLowerCase().includes('failing')).length;
  const pendingChecks = group.members.filter((member) => prStatuses[member.id]?.checksSummary.toLowerCase().includes('pending')).length;
  if (missingPrs > 0) reasons.push(`${missingPrs} workspace${missingPrs === 1 ? '' : 's'} without PR`);
  if (failingChecks > 0) reasons.push(`${failingChecks} failing PR check set${failingChecks === 1 ? '' : 's'}`);
  if (pendingChecks > 0) reasons.push(`${pendingChecks} pending PR check set${pendingChecks === 1 ? '' : 's'}`);

  if (failingChecks > 0 || activeArtifacts.length > 0) {
    return { level: 'blocked', label: 'Not ship-ready', reasons };
  }
  if (warnings.length > 0 || missingPrs > 0 || pendingChecks > 0) {
    return { level: 'caution', label: 'Needs review', reasons };
  }
  return { level: 'ready', label: 'Ship together ready', reasons: ['All known group PRs and artifacts look clear.'] };
}
