export type {
  AgentType,
  BranchHealth,
  ChangedFile,
  CreateWorkspaceInput,
  CreateChildWorkspaceInput,
  LinkedWorktreeRef,
  PRStatus,
  RiskLevel,
  Workspace,
  WorkspaceDetail,
  WorkspaceStatus,
  WorkspaceStep,
  WorkspaceSummary,
  RepositoryWorkspaceOptions,
} from './workspace';
export { toWorkspace } from './workspace';
export type { AgentContextWorktree, RepoMap, RepoMapEntry, RepoMapMeta, WorkspaceAgentContext, WorkspaceContextItem, WorkspaceContextPreview } from './agent-context';
export type { AgentProfile } from './agent-profile';
export type { ReviewItem } from './review';
export type { MarkWorkspaceFileReviewedInput, QueueReviewAgentPromptInput, QueueReviewAgentPromptResult, ReviewCockpitFile, WorkspaceFileReviewState, WorkspacePrComment, WorkspaceReviewCockpit } from './review-cockpit';
export type { FileReviewInsight, ReviewRiskLevel, WorkspaceReviewSummary } from './review-summary';
export type { ActivityItem } from './activity';
export type { OpenDeepLinkInput, OpenDeepLinkResult } from './deep-link';
export type { MergeReadinessLevel, WorkspaceMergeReadiness } from './merge-readiness';
export type { WorkspacePrDraft } from './pr-draft';
export type { PromptTemplate, WorkspacePromptTemplates } from './prompt-template';
export type { ReviewFileStatus, WorkspaceChangedFile, WorkspaceFileDiff } from './git-review';
export type { AgentRunStatus, AgentRunStreamType, AgentRunType, StartWorkspaceRunInput, WorkspaceRun, WorkspaceRunLog } from './agent-run';
export type { DiscoveredRepository, DiscoveredWorktree, ScanRepositoriesResult } from './repository';
export type { AppSettings, SaveRepoRootsInput } from './settings';
export type { EnvironmentCheckItem, EnvironmentCheckStatus } from './environment';
export type { WorkspaceAttention, WorkspaceAttentionStatus } from './workspace-attention';
export type { WorkspaceHealth, WorkspaceTerminalHealth } from './workspace-health';
export type { WorkspaceReadiness } from './workspace-readiness';
export type { CleanupWorkspaceInput, CleanupWorkspaceResult } from './workspace-cleanup';
export type { WorkspacePort } from './workspace-ports';
export type { ForgeWorkspaceConfig, WorkspaceScriptTerminalSession } from './workspace-scripts';
export type {
  AgentPromptEntry,
  AgentPromptStatus,
  QueueAgentPromptInput,
  StartTerminalSessionInput,
  TerminalOutputChunk,
  TerminalOutputEvent,
  TerminalOutputResponse,
  TerminalProfile,
  TerminalSession,
  TerminalSessionState,
  TerminalSessionStatus,
} from './terminal';

export interface AgentMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  event: string;
  level: 'info' | 'success' | 'warning' | 'error';
  details?: string;
}

export interface DiffFile {
  name: string;
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  lineNumber?: number;
}
