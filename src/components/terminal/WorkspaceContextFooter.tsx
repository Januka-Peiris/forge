import { useEffect, useState } from 'react';
import { getContextStatus } from '../../lib/tauri-api/context';

interface WorkspaceContextFooterProps {
  workspaceId: string;
}

export function WorkspaceContextFooter({ workspaceId }: WorkspaceContextFooterProps) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    getContextStatus(workspaceId)
      .then((next) => setStale(next.stale))
      .catch(() => {});
  }, [workspaceId]);

  if (!stale) return null;

  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-3 py-0.5 text-xs text-white/30">
      <span className="text-amber-400/70">context stale</span>
    </div>
  );
}
