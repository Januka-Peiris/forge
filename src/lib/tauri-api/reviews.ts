import type { ReviewItem } from '../../types/review';
import { invokeCommand } from './client';

export function listPendingReviews(): Promise<ReviewItem[]> {
  return invokeCommand<ReviewItem[]>('list_pending_reviews');
}
