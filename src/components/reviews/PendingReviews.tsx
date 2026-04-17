import { GitBranch, FileCode, AlertTriangle, CheckCircle2, MessageSquare } from 'lucide-react';
import type { ReviewItem, RiskLevel } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface PendingReviewsProps {
  reviews: ReviewItem[];
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const variant = risk === 'Low' ? 'success' : risk === 'Medium' ? 'warning' : 'destructive';
  return <Badge variant={variant}>{risk} Risk</Badge>;
}

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <div className="bg-forge-card border border-forge-border rounded-xl p-4 hover:border-forge-border-light transition-colors group">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <h4 className="text-[13px] font-semibold text-forge-text group-hover:text-white transition-colors">
            {review.workspaceName}
          </h4>
          <div className="flex items-center gap-1.5 text-[11px] text-forge-muted mt-0.5">
            <span className="font-medium text-forge-text/88">{review.repo}</span>
            <span className="text-forge-muted">/</span>
            <GitBranch className="w-3 h-3" />
            <span className="font-mono truncate">{review.branch}</span>
          </div>
        </div>
        <RiskBadge risk={review.risk} />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-forge-muted mb-3">
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
          <p className="text-[11px] text-forge-muted/90 leading-relaxed">{review.aiSummary}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="success" size="sm" className="flex-1">
          <CheckCircle2 className="w-3 h-3" />
          Approve
        </Button>
        <Button variant="secondary" size="sm" className="flex-1">
          <MessageSquare className="w-3 h-3" />
          Request Changes
        </Button>
      </div>
    </div>
  );
}

export function PendingReviews({ reviews }: PendingReviewsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-bold text-forge-text">Pending Reviews</h2>
          <p className="text-[11px] text-forge-muted mt-0.5">AI-summarized changes awaiting approval</p>
        </div>
        <Badge variant="info">{reviews.length} pending</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}
