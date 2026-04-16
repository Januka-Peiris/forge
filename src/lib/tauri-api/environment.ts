import type { EnvironmentCheckItem } from '../../types/environment';
import { invokeCommand } from './client';

export function checkEnvironment(): Promise<EnvironmentCheckItem[]> {
  return invokeCommand<EnvironmentCheckItem[]>('check_environment');
}
