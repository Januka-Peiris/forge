import type { DiscoveredRepository } from '../../types/repository';
import { invokeCommand } from './client';

export function removeRepository(repositoryId: string): Promise<void> {
  return invokeCommand<void>('remove_repository', { repositoryId });
}

/** Add a single repository by its resolved git root path — no directory walking. */
export function addRepository(path: string): Promise<DiscoveredRepository[]> {
  return invokeCommand<DiscoveredRepository[]>('add_repository', { path });
}

/** Return the list of known repositories from the DB without scanning. */
export function listRepositories(): Promise<DiscoveredRepository[]> {
  return invokeCommand<DiscoveredRepository[]>('list_repositories');
}
