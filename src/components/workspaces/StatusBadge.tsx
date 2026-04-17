import type { WorkspaceStatus, AgentType } from '../../types';
import { Badge } from '../ui/badge';

export function StatusBadge({ status }: { status: WorkspaceStatus }) {
  switch (status) {
    case 'Running':
      return <Badge variant="success" dot>{status}</Badge>;
    case 'Waiting':
      return <Badge variant="warning" dot>{status}</Badge>;
    case 'Review Ready':
      return <Badge variant="info">{status}</Badge>;
    case 'Blocked':
      return <Badge variant="destructive" dot>{status}</Badge>;
    case 'Merged':
      return <Badge variant="violet">{status}</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

export function AgentBadge({ agent }: { agent: AgentType }) {
  switch (agent) {
    case 'Claude Code':
      return <Badge variant="violet">{agent}</Badge>;
    case 'Codex':
      return <Badge variant="success">{agent}</Badge>;
    default:
      return <Badge variant="default">{agent}</Badge>;
  }
}
