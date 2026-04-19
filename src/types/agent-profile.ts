export interface AgentProfile {
  id: string;
  label: string;
  agent: 'codex' | 'claude_code' | 'shell' | string;
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
}
