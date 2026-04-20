import { GitBranch, FileCode, AlertTriangle, Eye } from 'lucide-react';
import { useState } from 'react';
import type { ReviewItem, RiskLevel } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface PendingReviewsProps {
  reviews: ReviewItem[];
  onOpenWorkspace?: (workspaceId: string) => void;
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const variant = risk === 'Low' ? 'success' : risk === 'Medium' ? 'warning' : 'destructive';
  return (
    <div className="relative">
      <Badge variant={variant}>{risk} Risk</Badge>
      {risk === 'High' && (
        <span className="absolute -right-1 -top-1 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forge-red opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-forge-red"></span>
        </span>
      )}
    </div>
  );
}

function ReviewCard({ review, onOpenWorkspace }: { review: ReviewItem; onOpenWorkspace?: (workspaceId: string) => void }) {
  const canOpen = Boolean(review.workspaceId && onOpenWorkspace);
  return (
    <div className="bg-forge-card border border-forge-border rounded-xl p-4 hover:border-forge-border-light transition-colors group">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <h4 className="text-ui-body font-semibold text-forge-text group-hover:text-forge-text transition-colors">
            {review.workspaceName}
          </h4>
          <div className="flex items-center gap-1.5 text-ui-label text-forge-muted mt-0.5">
            <span className="font-medium text-forge-text/88">{review.repo}</span>
            <span className="text-forge-muted">/</span>
            <GitBranch className="w-3 h-3" />
            <span className="font-mono truncate">{review.branch}</span>
          </div>
        </div>
        <RiskBadge risk={review.risk} />
      </div>

      <div className="flex items-center gap-3 text-ui-label text-forge-muted mb-3">
        <span className="flex items-center gap-1">
          <FileCode className="w-3 h-3" />
          {review.filesChanged} files
        </span>
        <span className="font-mono text-forge-green">+{review.additions}</span>
        <span className="font-mono text-forge-red">-{review.deletions}</span>
        <span className="ml-auto text-forge-muted">{review.createdAt}</span>
      </div>

      <div className="bg-forge-surface/60 rounded-lg px-3 py-2 mb-3 border border-forge-border/50">
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-forge-muted mt-0.5 shrink-0" />
          <p className="text-ui-label text-forge-muted/90 leading-relaxed">{review.aiSummary}</p>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={!canOpen}
        onClick={() => review.workspaceId && onOpenWorkspace?.(review.workspaceId)}
      >
        <Eye className="w-3 h-3" />
        Open review cockpit
      </Button>
    </div>
  );
}

export function PendingReviews({ reviews, onOpenWorkspace }: PendingReviewsProps) {
  const [expanded, setExpanded] = useState(false);
  const sortedReviews = [...reviews].sort((a, b) => (
    riskRank(b.risk) - riskRank(a.risk)
    || churnScore(b) - churnScore(a)
    || a.workspaceName.localeCompare(b.workspaceName)
  ));
  const visibleReviews = expanded ? sortedReviews : sortedReviews.slice(0, 3);
  const hiddenCount = Math.max(0, sortedReviews.length - visibleReviews.length);
  const riskCounts = sortedReviews.reduce<Record<RiskLevel, number>>((acc, review) => {
    acc[review.risk] = (acc[review.risk] ?? 0) + 1;
    return acc;
  }, { Low: 0, Medium: 0, High: 0 });

  if (reviews.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-ui-body font-bold text-forge-text">Pending Reviews</h2>
            <p className="text-ui-label text-forge-muted mt-0.5">AI-summarized changes awaiting approval</p>
          </div>
          <Badge variant="default">0 pending</Badge>
        </div>
        <div className="rounded-xl border border-forge-border bg-forge-card/60 px-4 py-6 text-center">
          <p className="text-ui-body text-forge-muted">No pending reviews right now.</p>
          <p className="mt-1 text-ui-label text-forge-muted/80">Workspaces with changed files still appear in the Review attention filter.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-ui-body font-bold text-forge-text">Pending Reviews</h2>
          <p className="text-ui-label text-forge-muted mt-0.5">AI-summarized changes awaiting cockpit review</p>
        </div>
        <Badge variant="info">{reviews.length} pending</Badge>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <RiskSummary label="High" count={riskCounts.High} tone="high" />
        <RiskSummary label="Medium" count={riskCounts.Medium} tone="medium" />
        <RiskSummary label="Low" count={riskCounts.Low} tone="low" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {visibleReviews.map((r) => (
          <ReviewCard key={r.id} review={r} onOpenWorkspace={onOpenWorkspace} />
        ))}
      </div>
      {sortedReviews.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-ui-label font-semibold text-forge-muted hover:text-forge-text"
        >
          {expanded ? 'Show fewer pending reviews' : `Show ${hiddenCount} more pending review${hiddenCount === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function RiskSummary({ label, count, tone }: { label: string; count: number; tone: 'high' | 'medium' | 'low' }) {
  const toneClass = {
    high: 'border-forge-red/20 bg-forge-red/10 text-forge-red',
    medium: 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow',
    low: 'border-forge-green/20 bg-forge-green/10 text-forge-green',
  }[tone];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-ui-label font-semibold ${toneClass}`}>
      {count} {label}
    </span>
  );
}

function riskRank(risk: RiskLevel): number {
  if (risk === 'High') return 3;
  if (risk === 'Medium') return 2;
  return 1;
}

function churnScore(review: ReviewItem): number {
  return review.filesChanged * 10 + review.additions + review.deletions;
}
