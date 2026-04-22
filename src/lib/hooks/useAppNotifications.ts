import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { forgeWarn } from '../forge-log';
import type { TerminalOutputEvent, Workspace } from '../../types';
import { getSetting } from '../tauri-api/settings';

export interface AttentionToast {
  id: string;
  workspaceId: string;
  workspaceName: string;
  text: string;
}

type NotificationSeverity = 'info' | 'warn' | 'error';
type NotificationSource = 'orchestrator' | 'coordinator' | 'rebase' | 'terminal' | 'approval' | 'budget' | 'system';

interface ForgeNotificationEnvelope {
  source: NotificationSource;
  severity: NotificationSeverity;
  workspaceId: string;
  dedupeKey: string;
  message: string;
  actionable?: boolean;
}

interface DedupeState {
  count: number;
  lastAt: number;
  toastId: string;
}

interface UseAppNotificationsInput {
  selectedWorkspaceId: string | null;
  view: string;
  workspaces: Workspace[];
  onScheduleAttentionLoad: () => void;
  onScheduleMarkAttentionRead: (workspaceId: string) => void;
}

async function sendForgeNotification(title: string, body: string) {
  try {
    const notificationsEnabled = window.localStorage.getItem('forge:notifications-enabled');
    if (notificationsEnabled === 'false') return;
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) sendNotification({ title, body });
  } catch { /* non-fatal */ }
}

export function useAppNotifications({
  selectedWorkspaceId,
  view,
  workspaces,
  onScheduleAttentionLoad,
  onScheduleMarkAttentionRead,
}: UseAppNotificationsInput) {
  const [attentionToasts, setAttentionToasts] = useState<AttentionToast[]>([]);
  const [minLevel, setMinLevel] = useState<NotificationSeverity>('info');
  const [dedupeSeconds, setDedupeSeconds] = useState<number>(30);
  const selectedWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  const viewRef = useRef(view);
  const workspacesRef = useRef<Workspace[]>(workspaces);
  const dedupeRef = useRef<Map<string, DedupeState>>(new Map());

  useEffect(() => { selectedWorkspaceIdRef.current = selectedWorkspaceId; }, [selectedWorkspaceId]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);

  const dismissAttentionToast = useCallback((id: string) => {
    setAttentionToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const shouldPassMinLevel = useCallback((severity: NotificationSeverity) => {
    const rank = (value: NotificationSeverity) => (value === 'error' ? 3 : value === 'warn' ? 2 : 1);
    return rank(severity) >= rank(minLevel);
  }, [minLevel]);

  const routeEnvelope = useCallback((envelope: ForgeNotificationEnvelope) => {
    if (!shouldPassMinLevel(envelope.severity)) return;
    const workspace = workspacesRef.current.find((item) => item.id === envelope.workspaceId);
    const workspaceName = workspace?.name ?? envelope.workspaceId;
    const now = Date.now();
    const key = `${envelope.workspaceId}:${envelope.source}:${envelope.dedupeKey}`;
    const existing = dedupeRef.current.get(key);
    const withinWindow = existing && (now - existing.lastAt) < dedupeSeconds * 1000;
    const isForeground = document.visibilityState === 'visible' && viewRef.current === 'workspaces';
    const shouldShowInForeground = envelope.severity !== 'info' || envelope.actionable === true;
    const shouldShow = !isForeground || shouldShowInForeground;
    const nextCount = withinWindow ? existing.count + 1 : 1;
    const toastId = withinWindow ? existing.toastId : `${key}-${now}`;
    dedupeRef.current.set(key, { count: nextCount, lastAt: now, toastId });
    if (shouldShow) {
      const text = nextCount > 1 ? `${envelope.message} (x${nextCount})` : envelope.message;
      setAttentionToasts((current) => {
        const filtered = current.filter((item) => item.id !== toastId);
        return [{ id: toastId, workspaceId: envelope.workspaceId, workspaceName, text }, ...filtered].slice(0, 3);
      });
      window.setTimeout(() => dismissAttentionToast(toastId), 8000);
    }
    if (!isForeground || envelope.severity !== 'info') {
      void sendForgeNotification(envelope.source[0].toUpperCase() + envelope.source.slice(1), envelope.message);
    }
  }, [dedupeSeconds, dismissAttentionToast, shouldPassMinLevel]);

  useEffect(() => {
    void getSetting('notifications_min_level')
      .then((value) => {
        if (value === 'warn' || value === 'error' || value === 'info') setMinLevel(value);
      })
      .catch(() => undefined);
    void getSetting('notifications_dedupe_seconds')
      .then((value) => {
        const parsed = Number(value ?? '');
        if (Number.isFinite(parsed) && parsed > 0) setDedupeSeconds(parsed);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; message: string }>(
      'forge://orchestrator-notify',
      (event) => {
        if (disposed) return;
        const { workspaceId, message } = event.payload;
        routeEnvelope({
          source: 'orchestrator',
          severity: 'warn',
          workspaceId,
          dedupeKey: message,
          message: `Orchestrator: ${message}`,
          actionable: true,
        });
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; })
      .catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [routeEnvelope]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; branch: string; baseBranch: string }>(
      'forge://workspace-rebase-conflict',
      (event) => {
        if (disposed) return;
        const { workspaceId, workspaceName, branch, baseBranch } = event.payload;
        routeEnvelope({
          source: 'rebase',
          severity: 'error',
          workspaceId,
          dedupeKey: `rebase:${branch}:${baseBranch}`,
          message: `Rebase conflict: ${branch} → origin/${baseBranch} (${workspaceName})`,
          actionable: true,
        });
      },
    ).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [routeEnvelope]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<TerminalOutputEvent>('forge://terminal-output', (event) => {
      if (disposed) return;
      const workspaceId = event.payload.workspaceId;
      if (workspaceId === selectedWorkspaceIdRef.current && viewRef.current === 'workspaces') {
        onScheduleMarkAttentionRead(workspaceId);
        return;
      }
      const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
      const text = event.payload.chunk.data.replace(/\s+/g, ' ').trim();
      if (!workspace || !text || event.payload.chunk.streamType === 'pty_snapshot') {
        onScheduleAttentionLoad();
        return;
      }
      routeEnvelope({
        source: 'terminal',
        severity: 'info',
        workspaceId,
        dedupeKey: `${event.payload.chunk.sessionId}:${event.payload.chunk.streamType}`,
        message: text.slice(0, 120),
        actionable: false,
      });
      onScheduleAttentionLoad();
    }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch((err) => forgeWarn('attention', 'event listener failed', { err }));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [onScheduleAttentionLoad, onScheduleMarkAttentionRead, routeEnvelope]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; stuckFor: number }>(
      'forge://terminal-stuck',
      (event) => {
        if (disposed) return;
        const { workspaceId, workspaceName, stuckFor } = event.payload;
        routeEnvelope({
          source: 'terminal',
          severity: 'warn',
          workspaceId,
          dedupeKey: 'terminal-stuck',
          message: `${workspaceName} has been stuck for ${stuckFor}min`,
          actionable: true,
        });
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [routeEnvelope]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; command: string }>(
      'forge://command-approval-required',
      (event) => {
        if (disposed) return;
        routeEnvelope({
          source: 'approval',
          severity: 'warn',
          workspaceId: event.payload.workspaceId,
          dedupeKey: event.payload.command,
          message: `Approval needed for command: ${event.payload.command}`,
          actionable: true,
        });
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [routeEnvelope]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; cost: string; limit: number }>(
      'forge://workspace-budget-exceeded',
      (event) => {
        if (disposed) return;
        routeEnvelope({
          source: 'budget',
          severity: 'error',
          workspaceId: event.payload.workspaceId,
          dedupeKey: 'workspace-budget',
          message: `Budget cap reached: $${event.payload.cost}`,
          actionable: true,
        });
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [routeEnvelope]);

  return { attentionToasts, dismissAttentionToast };
}
