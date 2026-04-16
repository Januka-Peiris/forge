import type { OpenDeepLinkInput, OpenDeepLinkResult } from '../../types/deep-link';
import { invokeCommand } from './client';

export function openDeepLink(input: OpenDeepLinkInput): Promise<OpenDeepLinkResult> {
  return invokeCommand<OpenDeepLinkResult>('open_deep_link', { input });
}
