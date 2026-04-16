import type { CleanupWorkspaceInput, CleanupWorkspaceResult } from '../../types';
import { invokeCommand } from './client';

export function cleanupWorkspace(input: CleanupWorkspaceInput): Promise<CleanupWorkspaceResult> {
  return invokeCommand<CleanupWorkspaceResult>('cleanup_workspace', { input });
}
