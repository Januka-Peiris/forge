export interface AgentProfile {
  id: string;
  label: string;
  agent: 'codex' | 'claude_code' | 'kimi_code' | 'local_llm' | 'openai' | 'shell' | string;
  command: string;
  args: string[];
  model?: string | null;
  reasoning?: string | null;
  mode?: string | null;
  provider?: string | null;
  endpoint?: string | null;
  local: boolean;
  description?: string | null;
  skills: string[];
  templates: string[];
  rolePreference?: 'brain' | 'coder' | 'general' | string | null;
  coordinatorEligible?: boolean | null;
}
