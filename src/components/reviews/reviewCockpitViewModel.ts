import type { ReviewCockpitFile, WorkspacePrComment } from '../../types';

export interface PrCommentGroups {
  general: WorkspacePrComment[];
  fileGroups: Array<{ path: string; comments: WorkspacePrComment[] }>;
  openCount: number;
  total: number;
}

export function buildPrCommentGroups(
  comments: WorkspacePrComment[],
  effectiveSelectedPath: string | null,
): PrCommentGroups {
  const general = comments.filter((comment) => !comment.path);
  const byPath = new Map<string, WorkspacePrComment[]>();

  for (const comment of comments) {
    if (!comment.path) continue;
    const existing = byPath.get(comment.path) ?? [];
    existing.push(comment);
    byPath.set(comment.path, existing);
  }

  const fileGroups = Array.from(byPath.entries())
    .map(([path, groupedComments]) => ({ path, comments: groupedComments }))
    .sort((a, b) => {
      if (a.path === effectiveSelectedPath) return -1;
      if (b.path === effectiveSelectedPath) return 1;
      return a.path.localeCompare(b.path);
    });

  const openCount = comments.filter(
    (comment) => comment.state !== 'resolved_local' && !comment.resolvedAt,
  ).length;

  return { general, fileGroups, openCount, total: comments.length };
}

export function countReviewedFiles(files: ReviewCockpitFile[]): number {
  return files.filter((item) => item.review?.status === 'reviewed').length;
}

export function computeDiffTotals(files: ReviewCockpitFile[]): { totalAdds: number; totalDels: number } {
  return files.reduce(
    (totals, item) => ({
      totalAdds: totals.totalAdds + (item.file.additions ?? 0),
      totalDels: totals.totalDels + (item.file.deletions ?? 0),
    }),
    { totalAdds: 0, totalDels: 0 },
  );
}
