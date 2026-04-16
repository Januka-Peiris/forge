import type { OrchestratorStatus } from '../../types/orchestrator';
import { invokeCommand } from './client';

export function getOrchestratorStatus(): Promise<OrchestratorStatus> {
  return invokeCommand<OrchestratorStatus>('get_orchestrator_status', {});
}

export function setOrchestratorEnabled(enabled: boolean): Promise<void> {
  return invokeCommand<void>('set_orchestrator_enabled', { enabled });
}

export function setOrchestratorModel(model: string): Promise<void> {
  return invokeCommand<void>('set_orchestrator_model', { model });
}
