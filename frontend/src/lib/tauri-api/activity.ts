import type { ActivityItem } from '../../types/activity';
import { invokeCommand } from './client';

export function listActivity(): Promise<ActivityItem[]> {
  return invokeCommand<ActivityItem[]>('list_activity');
}
