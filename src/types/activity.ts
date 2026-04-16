export interface ActivityItem {
  id: string;
  workspaceId?: string;
  repo: string;
  branch?: string;
  event: string;
  level: 'info' | 'success' | 'warning' | 'error';
  details?: string;
  timestamp: string;
}
