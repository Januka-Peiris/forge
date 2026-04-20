import { useCallback, useEffect, useRef, useState } from 'react';
import { listWorkspaceAttention, markWorkspaceAttentionRead } from '../tauri-api/workspace-attention';
import { getWorkspaceConflicts } from '../tauri-api/workspace-health';
import { forgeWarn } from '../forge-log';
import type { WorkspaceAttention } from '../../types';

export function useWorkspaceAttentionState(selectedWorkspaceId: string | null, view: string) {
  const [workspaceAttention, setWorkspaceAttention] = useState<Record<string, WorkspaceAttention>>({});
  const [conflictingWorkspaceIds, setConflictingWorkspaceIds] = useState<Set<string>>(new Set());
  const attentionRefreshTimerRef = useRef<number | null>(null);
  const markReadTimerRef = useRef<Record<string, number>>({});

  const loadAttention = useCallback(async () => {
    try {
      const rows = await listWorkspaceAttention();
      setWorkspaceAttention(Object.fromEntries(rows.map((row) => [row.workspaceId, row])));
    } catch (err) {
      forgeWarn('attention', 'load failed', { err });
    }
    try {
      const result = await getWorkspaceConflicts();
      setConflictingWorkspaceIds(new Set(result.conflictingWorkspaceIds));
    } catch {
      // non-fatal
    }
  }, []);

  const scheduleAttentionLoad = useCallback((delay = 300) => {
    if (attentionRefreshTimerRef.current !== null) return;
    attentionRefreshTimerRef.current = window.setTimeout(() => {
      attentionRefreshTimerRef.current = null;
      void loadAttention();
    }, delay);
  }, [loadAttention]);

  const scheduleMarkAttentionRead = useCallback((workspaceId: string) => {
    if (markReadTimerRef.current[workspaceId] !== undefined) return;
    markReadTimerRef.current[workspaceId] = window.setTimeout(() => {
      delete markReadTimerRef.current[workspaceId];
      void markWorkspaceAttentionRead(workspaceId)
        .then(() => scheduleAttentionLoad(50))
        .catch((err) => forgeWarn('attention', 'mark read failed', { err, workspaceId }));
    }, 300);
  }, [scheduleAttentionLoad]);

  useEffect(() => () => {
    if (attentionRefreshTimerRef.current !== null) window.clearTimeout(attentionRefreshTimerRef.current);
    for (const timer of Object.values(markReadTimerRef.current)) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadAttention();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadAttention]);

  useEffect(() => {
    if (!selectedWorkspaceId || view !== 'workspaces') return;
    scheduleMarkAttentionRead(selectedWorkspaceId);
  }, [scheduleMarkAttentionRead, selectedWorkspaceId, view]);

  return {
    conflictingWorkspaceIds,
    loadAttention,
    scheduleAttentionLoad,
    scheduleMarkAttentionRead,
    workspaceAttention,
  };
}
