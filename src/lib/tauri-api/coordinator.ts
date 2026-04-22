import type {
  ReplayWorkspaceCoordinatorActionInput,
  StartWorkspaceCoordinatorInput,
  StepWorkspaceCoordinatorInput,
  WorkspaceCoordinatorStatus,
} from '../../types/coordinator';
import { invokeCommand } from './client';

export function getWorkspaceCoordinatorStatus(workspaceId: string): Promise<WorkspaceCoordinatorStatus> {
  return invokeCommand<WorkspaceCoordinatorStatus>('get_workspace_coordinator_status', { workspaceId });
}

export function startWorkspaceCoordinator(input: StartWorkspaceCoordinatorInput): Promise<WorkspaceCoordinatorStatus> {
  return invokeCommand<WorkspaceCoordinatorStatus>('start_workspace_coordinator', { input });
}

export function stepWorkspaceCoordinator(input: StepWorkspaceCoordinatorInput): Promise<WorkspaceCoordinatorStatus> {
  return invokeCommand<WorkspaceCoordinatorStatus>('step_workspace_coordinator', { input });
}

export function stopWorkspaceCoordinator(workspaceId: string): Promise<WorkspaceCoordinatorStatus> {
  return invokeCommand<WorkspaceCoordinatorStatus>('stop_workspace_coordinator', { workspaceId });
}

export function replayWorkspaceCoordinatorAction(
  input: ReplayWorkspaceCoordinatorActionInput,
): Promise<WorkspaceCoordinatorStatus> {
  return invokeCommand<WorkspaceCoordinatorStatus>('replay_workspace_coordinator_action', { input });
}
