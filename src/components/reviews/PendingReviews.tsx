import { GitBranch, FileCode, AlertTriangle, CheckCircle2, MessageSquare } from 'lucide-react';
import type { ReviewItem, RiskLevel } from '../../types';

interface PendingReviewsProps {
  reviews: ReviewItem[];
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config = {
    Low: 'bg-forge-green/10 text-forge-green border-forge-green/20',
    Medium: 'bg-forge-yellow/10 text-forge-yellow border-forge-yellow/20',
    High: 'bg-forge-red/10 text-forge-red border-forge-red/20',
  }[risk];

  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${config}`}>
      {risk} Risk
    </span>
  );
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
        <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-forge-green/10 hover:bg-forge-green/20 text-[11px] font-semibold text-forge-green transition-colors border border-forge-green/20">
          <CheckCircle2 className="w-3 h-3" />
          Approve
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-[11px] font-medium text-forge-muted hover:text-forge-text transition-colors border border-forge-border">
          <MessageSquare className="w-3 h-3" />
          Request Changes
        </button>
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
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forge-blue/15 text-forge-blue border border-forge-blue/20">
          {reviews.length} pending
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    </div>
  );
}
