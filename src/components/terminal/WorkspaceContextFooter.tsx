import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getContextStatus } from '../../lib/tauri-api/context';
import { refreshWorkspaceRepoContext } from '../../lib/tauri-api/agent-context';

interface WorkspaceContextFooterProps {
  workspaceId: string;
}

/**
 * Compact, actionable notice shown only when the cached repo context is out
 * of date. One click refreshes it; the notice disappears on success.
 */
export function WorkspaceContextFooter({ workspaceId }: WorkspaceContextFooterProps) {
  const [mode, setMode] = useState<string>('repo_map');
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContextStatus(workspaceId)
      .then((next) => {
        setStale(next.stale);
        setMode(next.mode ?? 'repo_map');
      })
      .catch(() => {});
  }, [workspaceId]);

  if (!stale) return null;

  const label = mode === 'repo_intelligence' ? 'Repo intelligence out of date' : 'Repo context out of date';

  const refresh = () => {
    if (busy) return;
    setBusy(true);
    refreshWorkspaceRepoContext(workspaceId)
      .then(() => setStale(false))
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-white/5 px-3 py-1 text-xs text-mn-muted">
      <span title="The cached repo summary used for prompt context no longer matches the latest commits.">
        {label}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-mn-cyan hover:bg-mn-cyan/10 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} /> Refresh
      </button>
    </div>
  );
}
