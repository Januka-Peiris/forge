import React, { useState } from 'react';
import { buildWorkspaceRepoContext } from '../../lib/tauri-api/context';
import { useContextPreview } from '../../hooks/useContextPreview';
import type { ContextSegment } from '../../types/context';

interface Props {
  workspaceId: string;
}

export function ContextPreviewPanel({ workspaceId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const { preview, loading, refresh } = useContextPreview(expanded ? workspaceId : null);

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await buildWorkspaceRepoContext(workspaceId, true);
      await refresh();
    } finally {
      setBuilding(false);
    }
  };

  const tokenCount = preview ? Math.round(preview.estimatedTokensContext / 1) : null;
  const tokenDisplay = tokenCount != null ? `~${Math.round(preview!.estimatedTokensContext / 4).toLocaleString()} tokens` : null;

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">Context</span>
          {tokenDisplay && (
            <span className="text-xs text-white/40">{tokenDisplay}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {preview && (
            <StatusChip stale={preview.staleMap} lowSignal={preview.lowSignal} signalScore={preview.signalScore} />
          )}
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
          {/* Warnings */}
          {preview?.warning && (
            <p className="text-xs text-amber-400 bg-amber-500/10 rounded p-2">{preview.warning}</p>
          )}
          {preview?.staleMap && !preview.warning && (
            <p className="text-xs text-amber-400 bg-amber-500/10 rounded p-2">
              Repo map is stale — default branch has new commits.
            </p>
          )}

          {loading && <p className="text-xs text-white/40">Loading context…</p>}

          {/* Segments */}
          {preview && !loading && (
            <div className="space-y-1">
              {preview.included.length === 0 && (
                <p className="text-xs text-white/40 italic">No context entries (map may need building).</p>
              )}
              {/* Mandatory */}
              {preview.included.filter(s => s.tier === 'mandatory').length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mt-2">Mandatory</p>
                  {preview.included.filter(s => s.tier === 'mandatory').map((seg, i) => (
                    <SegmentRow key={i} seg={seg} />
                  ))}
                </>
              )}
              {/* Related */}
              {preview.included.filter(s => s.tier === 'related').length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mt-2">Related</p>
                  {preview.included.filter(s => s.tier === 'related').map((seg, i) => (
                    <SegmentRow key={i} seg={seg} />
                  ))}
                </>
              )}
              {/* Excluded */}
              {preview.excluded.length > 0 && (
                <p className="text-[10px] text-white/30 mt-2">{preview.excluded.length} file(s) excluded (over budget)</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-white/5">
            <button
              onClick={refresh}
              disabled={loading || building}
              className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              onClick={handleBuild}
              disabled={loading || building}
              className="text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              {building ? 'Building…' : 'Rebuild map'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentRow({ seg }: { seg: ContextSegment }) {
  const kindColour = {
    mandatory: 'bg-blue-500/20 text-blue-400',
    related: 'bg-purple-500/20 text-purple-400',
  }[seg.tier] ?? 'bg-white/10 text-white/50';

  const modeLabel: Record<string, string> = {
    full: 'full',
    diff_hunks: 'diff',
    symbol_card: 'symbols',
    summary_line: 'summary',
  };

  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${kindColour}`}>
          {modeLabel[seg.renderMode] ?? seg.renderMode}
        </span>
        <span className="text-white/60 truncate">{seg.path}</span>
      </div>
      <span className="shrink-0 text-white/30 ml-2">~{seg.estimatedTokens}t</span>
    </div>
  );
}

function StatusChip({ stale, lowSignal, signalScore }: { stale: boolean; lowSignal: boolean; signalScore: number }) {
  if (lowSignal) return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">low signal</span>;
  if (stale) return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">stale</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">fresh {Math.round(signalScore * 100)}%</span>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
