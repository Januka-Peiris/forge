export type EnvironmentCheckStatus = 'ok' | 'missing' | 'unknown';

export interface EnvironmentCheckItem {
  name: string;
  binary: string;
  status: EnvironmentCheckStatus;
  fix: string;
  optional: boolean;
  path?: string | null;
}
