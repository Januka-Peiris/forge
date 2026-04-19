import type { AgentProfile, LocalLlmModel, LocalLlmProfileDiagnostic } from '../../types';
import { invokeCommand } from './client';

export function listLocalLlmModels(provider = 'ollama'): Promise<LocalLlmModel[]> {
  return invokeCommand<LocalLlmModel[]>('list_local_llm_models', { provider });
}

export function diagnoseLocalLlmProfile(profile: AgentProfile): Promise<LocalLlmProfileDiagnostic> {
  return invokeCommand<LocalLlmProfileDiagnostic>('diagnose_local_llm_profile', { profile });
}
