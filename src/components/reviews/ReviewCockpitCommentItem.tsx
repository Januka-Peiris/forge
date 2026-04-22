import { CheckCircle2, ExternalLink, FileCode, MessageSquare, Send } from 'lucide-react';
import type { WorkspacePrComment } from '../../types';

interface ReviewCockpitCommentItemProps {
  comment: WorkspacePrComment;
  busy: boolean;
  targetCommentId?: string | null;
  effectiveSelectedPath: string | null;
  onSelectFile: (path: string) => void;
  onSendPrompt: (action: string, comment?: WorkspacePrComment) => void;
  onResolveCommentLocal: (commentId: string) => void;
  onResolveThread: (commentId: string) => void;
  onReopenThread: (commentId: string) => void;
}

export function ReviewCockpitCommentItem({
  comment,
  busy,
  targetCommentId,
  effectiveSelectedPath,
  onSelectFile,
  onSendPrompt,
  onResolveCommentLocal,
  onResolveThread,
  onReopenThread,
}: ReviewCockpitCommentItemProps) {
  const canResolveThread = !!comment.threadId && comment.threadResolvable && !comment.threadOutdated && !comment.threadResolved;
  const canReopenThread = !!comment.threadId && comment.threadResolvable && !comment.threadOutdated && !!comment.threadResolved;
  return (
    <div
      id={`review-comment-${comment.commentId}`}
      key={comment.commentId}
      className={`p-3 ${targetCommentId === comment.commentId ? 'bg-forge-blue/10' : ''}`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 text-ui-label font-semibold text-forge-text">
          <MessageSquare className="h-3 w-3 shrink-0 text-forge-muted" />
          {comment.author}
        </span>
        {(comment.path || comment.line || comment.state === 'resolved_local' || comment.threadResolved) && (
          <span className="shrink-0 rounded bg-forge-surface-overlay px-1.5 py-0.5 font-mono text-ui-tiny text-forge-muted">
            {comment.threadOutdated
              ? 'outdated'
              : comment.threadResolved
                ? 'thread resolved'
                : comment.state === 'resolved_local'
                  ? 'resolved local'
                  : comment.line
                    ? `:${comment.line}`
                    : 'general'}
          </span>
        )}
      </div>

      <p className="max-h-28 overflow-auto whitespace-pre-wrap text-ui-label leading-relaxed text-forge-text/80">
        {comment.body}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {comment.path && comment.path !== effectiveSelectedPath && (
          <button
            disabled={busy}
            onClick={() => onSelectFile(comment.path!)}
            className="flex items-center gap-1 rounded-md border border-forge-border bg-forge-surface-overlay px-2 py-1 text-ui-caption font-semibold text-forge-muted hover:bg-forge-surface-overlay-high disabled:opacity-50"
          >
            <FileCode className="h-3 w-3" /> Open file
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => onSendPrompt('address_comment', comment)}
          className="flex items-center gap-1 rounded-md border border-forge-green/25 bg-forge-green/10 px-2 py-1 text-ui-caption font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50"
        >
          <Send className="h-3 w-3" /> Send
        </button>
        {canResolveThread && (
          <button
            disabled={busy}
            onClick={() => onResolveThread(comment.commentId)}
            className="flex items-center gap-1 rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-ui-caption font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
          >
            Resolve thread
          </button>
        )}
        {canReopenThread && (
          <button
            disabled={busy}
            onClick={() => onReopenThread(comment.commentId)}
            className="flex items-center gap-1 rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-ui-caption font-semibold text-forge-blue hover:bg-forge-blue/15 disabled:opacity-50"
          >
            Reopen thread
          </button>
        )}
        <button
          disabled={busy || comment.state === 'resolved_local'}
          onClick={() => onResolveCommentLocal(comment.commentId)}
          className="flex items-center gap-1 rounded-md border border-forge-border bg-forge-surface-overlay px-2 py-1 text-ui-caption font-semibold text-forge-muted hover:bg-forge-surface-overlay-high disabled:opacity-50"
          title="Local only (does not resolve on GitHub)"
        >
          {comment.state === 'resolved_local' ? <CheckCircle2 className="h-3 w-3 text-forge-green" /> : null}
          {comment.state === 'resolved_local' ? 'Local resolved' : 'Resolve local'}
        </button>
        {comment.url && (
          <a
            href={comment.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-ui-caption font-semibold text-forge-blue hover:bg-forge-blue/10"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
