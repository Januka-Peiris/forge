export type WorkspaceStatus = 'Running' | 'Waiting' | 'Review Ready' | 'Blocked' | 'Merged';
export type AgentType = 'Claude Code' | 'Codex' | 'Local LLM';
export type WorkspaceStep = 'Planning' | 'Editing' | 'Testing' | 'Review';
export type PRStatus = 'Open' | 'Draft' | 'Merged' | 'Closed' | null;
export type RiskLevel = 'Low' | 'Medium' | 'High';

import type { DiscoveredRepository } from './repository';

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}

export interface BranchHealth {
  aheadBy: number;
  behindBy: number;
  mergeRisk: RiskLevel;
  lastRebase: string;
  baseBranch: string;
}

export interface AgentSessionSummary {
  id: string;
  agent: string;
  status: string;
  model: string;
  tokenCount: number;
  estimatedCost: string;
  lastMessage: string;
  startedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  repo: string;
  branch: string;
  agent: AgentType;
  status: WorkspaceStatus;
  currentStep: WorkspaceStep;
  completedSteps: WorkspaceStep[];
  changedFiles: ChangedFile[];
  lastUpdated: string;
  prStatus: PRStatus;
  prNumber?: number;
  description: string;
  currentTask: string;
  branchHealth: BranchHealth;
  agentSession: AgentSessionSummary;
  repositoryId?: string;
  repositoryPath?: string;
  selectedBranch?: string;
  selectedWorktreeId?: string;
  selectedWorktreePath?: string;
  workspaceRootPath?: string;
  worktreeManagedByForge?: boolean;
  workspaceSource?: string;
  parentWorkspaceId?: string;
  sourceWorkspaceId?: string;
  derivedFromBranch?: string;
  linkedWorktrees?: LinkedWorktreeRef[];
  costLimitUsd?: number;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  worktreePath: string;
  baseBranch: string;
  recentEvents: string[];
}

export interface CreateWorkspaceInput {
  name: string;
  repo: string;
  baseBranch: string;
  branch?: string;
  agent: AgentType;
  taskPrompt: string;
  openInCursor: boolean;
  runTests: boolean;
  createPr: boolean;
  repositoryId?: string;
  selectedWorktreeId?: string;
  selectedBranch?: string;
  parentWorkspaceId?: string;
  sourceWorkspaceId?: string;
  derivedFromBranch?: string;
}

export interface CreateChildWorkspaceInput {
  parentWorkspaceId: string;
  name: string;
  branch?: string;
  agent?: AgentType;
  taskPrompt?: string;
  openInCursor?: boolean;
  runTests?: boolean;
  createPr?: boolean;
}

export interface LinkedWorktreeRef {
  worktreeId: string;
  repoId: string;
  repoName: string;
  path: string;
  branch?: string;
  head?: string;
}

export interface RepositoryWorkspaceOptions {
  repository: DiscoveredRepository;
  branches: string[];
}

// Temporary UI compatibility shape for the existing visual components.
// The backend payload remains represented by WorkspaceSummary/WorkspaceDetail above.
export interface Workspace extends Omit<WorkspaceSummary, 'branchHealth' | 'agentSession'> {
  branchHealth?: BranchHealth;
  agentSession?: AgentSessionSummary;
  aheadBy: number;
  behindBy: number;
  mergeRisk: RiskLevel;
  lastRebase: string;
}

export function toWorkspace(summary: WorkspaceSummary): Workspace {
  return {
    ...summary,
    aheadBy: summary.branchHealth.aheadBy,
    behindBy: summary.branchHealth.behindBy,
    mergeRisk: summary.branchHealth.mergeRisk,
    lastRebase: summary.branchHealth.lastRebase,
    worktreeManagedByForge: summary.worktreeManagedByForge ?? false,
    workspaceSource: summary.workspaceSource ?? 'unknown',
  };
}
