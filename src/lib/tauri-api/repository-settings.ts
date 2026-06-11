import { invokeCommand } from './client';

export function getRepositorySetting(repositoryId: string, key: string): Promise<string | null> {
  return invokeCommand<string | null>('get_repository_setting', { repositoryId, key });
}

export function setRepositorySetting(repositoryId: string, key: string, value: string): Promise<void> {
  return invokeCommand<void>('set_repository_setting', { repositoryId, key, value });
}
