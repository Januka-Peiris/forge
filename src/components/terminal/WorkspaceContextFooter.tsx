import { useEffect, useState } from 'react';
import { getContextStatus } from '../../lib/tauri-api/context';

interface WorkspaceContextFooterProps {
  workspaceId: string;
}

export function WorkspaceContextFooter({ workspaceId }: WorkspaceContextFooterProps) {
  const [status, setStatus] = useState<{ stale: boolean; tokens: number; engine: string } | null>(null);

  useEffect(() => {
    getContextStatus(workspaceId)
      .then((next) => {
        setStatus({ stale: next.stale, tokens: (next.symbolCount ?? 0) * 3, engine: next.engine });
      })
      .catch(() => {});
  }, [workspaceId]);

  if (!status) return null;

  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-3 py-0.5 text-xs text-white/30">
      <span>ctx {status.engine}</span>
      {status.stale && (
        <span className="text-amber-400/70">[stale]</span>
      )}
    </div>
  );
}
