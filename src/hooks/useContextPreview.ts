import { useState, useEffect, useCallback } from 'react';
import { getContextPreview } from '../lib/tauri-api/context';
import type { ContextPreview } from '../types/context';

export function useContextPreview(workspaceId: string | null, promptHint?: string) {
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getContextPreview(workspaceId, promptHint);
      setPreview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, promptHint]);

  useEffect(() => {
    setPreview(null);
    load();
  }, [load, workspaceId]);

  return { preview, loading, error, refresh: load };
}
