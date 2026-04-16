export interface AgentProfile {
  id: string;
  label: string;
  agent: 'codex' | 'claude_code' | 'shell' | string;
  command: string;
  args: string[];
  model?: string | null;
  reasoning?: string | null;
  mode?: string | null;
  description?: string | null;
  skills: string[];
  templates: string[];
}
