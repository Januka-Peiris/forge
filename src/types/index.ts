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
export type { AgentContextWorktree, WorkspaceAgentContext, WorkspaceContextItem, WorkspaceContextPreview } from './agent-context';
export type { AgentProfile } from './agent-profile';
export type {
  CoordinatorActionLog,
  ReplayWorkspaceCoordinatorActionInput,
  CoordinatorRun,
  CoordinatorWorker,
  StartWorkspaceCoordinatorInput,
  StepWorkspaceCoordinatorInput,
  WorkspaceCoordinatorStatus,
} from './coordinator';
export type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointDiff,
  WorkspaceCheckpointRestorePlan,
  WorkspaceCheckpointRestoreResult,
} from './checkpoint';
export type { AgentChatEvent, AgentChatEventEnvelope, AgentChatSession } from './agent-chat';
export type { ReviewItem } from './review';
export type { MarkWorkspaceFileReviewedInput, QueueReviewAgentPromptInput, QueueReviewAgentPromptResult, ReviewCockpitFile, WorkspaceFileReviewState, WorkspacePrComment, WorkspaceReviewCockpit } from './review-cockpit';
export type { FileReviewInsight, ReviewRiskLevel, WorkspaceReviewSummary } from './review-summary';
export type { ActivityItem } from './activity';
export type { OpenDeepLinkInput, OpenDeepLinkResult } from './deep-link';
export type { MergeReadinessLevel, WorkspaceMergeReadiness } from './merge-readiness';
export type { WorkspacePrCheck, WorkspacePrDraft, WorkspacePrStatus } from './pr-draft';
export type { PromptTemplate, WorkspacePromptTemplates } from './prompt-template';
export type { ReviewFileStatus, WorkspaceChangedFile, WorkspaceFileDiff } from './git-review';
export type { AgentRunStatus, AgentRunStreamType, AgentRunType, StartWorkspaceRunInput, WorkspaceRun, WorkspaceRunLog } from './agent-run';
export type { DiscoveredRepository, DiscoveredWorktree, ScanRepositoriesResult } from './repository';
export type { AppSettings, SaveRepoRootsInput } from './settings';
export type { EnvironmentCheckItem, EnvironmentCheckStatus } from './environment';
export type {
  LocalLlmModel,
  LocalLlmProfileDiagnostic,
  LocalLlmProfileDiagnosticCheck,
} from './local-llm';
export type { WorkspaceAttention, WorkspaceAttentionStatus } from './workspace-attention';
export type {
  WorkspaceHealth,
  WorkspaceSessionRecoveryResult,
  WorkspaceTerminalHealth,
} from './workspace-health';
export type { WorkspaceReadiness } from './workspace-readiness';
export type { CleanupWorkspaceInput, CleanupWorkspaceResult } from './workspace-cleanup';
export type { WorkspacePort } from './workspace-ports';
export type { ListWorkspaceFileTreeInput, WorkspaceFileTreeNode, WorkspaceFileTreeNodeKind } from './workspace-file-tree';
export type { ForgeWorkspaceConfig, WorkspaceScriptTerminalSession } from './workspace-scripts';
export type { WorkspaceHookCommand, WorkspaceHookEvent, WorkspaceHookInspector } from './workspace-hooks';
export type { TaskEvent, TaskRun, WorkspaceSchedulerJob, WorkspaceTaskSnapshot } from './task-lifecycle';
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
