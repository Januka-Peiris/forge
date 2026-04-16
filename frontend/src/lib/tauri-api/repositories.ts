import type { ScanRepositoriesResult } from '../../types/repository';
import { invokeCommand } from './client';

export function scanRepositories(): Promise<ScanRepositoriesResult> {
  return invokeCommand<ScanRepositoriesResult>('scan_repositories');
}

export function removeRepository(repositoryId: string): Promise<void> {
  return invokeCommand<void>('remove_repository', { repositoryId });
}
