import type { AgentProfile } from '../../types';
import { invokeCommand } from './client';

export function listWorkspaceAgentProfiles(workspaceId?: string | null): Promise<AgentProfile[]> {
  return invokeCommand<AgentProfile[]>('list_workspace_agent_profiles', { workspaceId });
}

export function listAppAgentProfiles(): Promise<AgentProfile[]> {
  return invokeCommand<AgentProfile[]>('list_app_agent_profiles');
}

export function saveAppAgentProfiles(profiles: AgentProfile[]): Promise<AgentProfile[]> {
  return invokeCommand<AgentProfile[]>('save_app_agent_profiles', { profiles });
}

/** Non-shell profiles for pickers: Claude first, then Codex, then others. */
export function agentProfilesForPromptPicker(profiles: AgentProfile[]): AgentProfile[] {
  return profiles
    .filter((p) => p.agent !== 'shell')
    .sort((a, b) => {
      const rank = (p: AgentProfile) => (p.agent === 'claude_code' ? 0 : p.agent === 'codex' ? 1 : 2);
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.label.localeCompare(b.label);
    });
}

export function defaultWorkspaceAgentProfileId(profiles: AgentProfile[]): string {
  const ordered = agentProfilesForPromptPicker(profiles);
  return ordered[0]?.id ?? 'claude-default';
}
