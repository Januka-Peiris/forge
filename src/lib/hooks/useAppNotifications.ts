import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { forgeWarn } from '../forge-log';
import type { TerminalOutputEvent, Workspace } from '../../types';

export interface AttentionToast {
  id: string;
  workspaceId: string;
  workspaceName: string;
  text: string;
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
  const selectedWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  const viewRef = useRef(view);
  const workspacesRef = useRef<Workspace[]>(workspaces);

  useEffect(() => { selectedWorkspaceIdRef.current = selectedWorkspaceId; }, [selectedWorkspaceId]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);

  const dismissAttentionToast = useCallback((id: string) => {
    setAttentionToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; message: string }>(
      'forge://orchestrator-notify',
      (event) => {
        if (disposed) return;
        const { workspaceId, message } = event.payload;
        const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
        const id = `orch-notify-${workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId, workspaceName: workspace?.name ?? workspaceId, text: `Orchestrator: ${message}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => dismissAttentionToast(id), 8000);
        void sendForgeNotification('Orchestrator', message);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; })
      .catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [dismissAttentionToast]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; branch: string; baseBranch: string }>(
      'forge://workspace-rebase-conflict',
      (event) => {
        if (disposed) return;
        const { workspaceId, workspaceName, branch, baseBranch } = event.payload;
        const id = `rebase-conflict-${workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId, workspaceName, text: `Rebase conflict: ${branch} → origin/${baseBranch}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => dismissAttentionToast(id), 8000);
        void sendForgeNotification('Rebase Conflict', `Conflict in ${branch} (${workspaceName})`);
      },
    ).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [dismissAttentionToast]);

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
      const id = `${workspaceId}-${event.payload.chunk.sessionId}-${event.payload.chunk.seq}`;
      setAttentionToasts((current) => [
        { id, workspaceId, workspaceName: workspace.name, text: text.slice(0, 120) },
        ...current.filter((toast) => toast.workspaceId !== workspaceId).slice(0, 2),
      ]);
      window.setTimeout(() => dismissAttentionToast(id), 5000);
      onScheduleAttentionLoad();
    }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch((err) => forgeWarn('attention', 'event listener failed', { err }));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [dismissAttentionToast, onScheduleAttentionLoad, onScheduleMarkAttentionRead]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; workspaceName: string; stuckFor: number }>(
      'forge://terminal-stuck',
      (event) => {
        if (disposed) return;
        const { workspaceName, stuckFor } = event.payload;
        void sendForgeNotification('Agent Stuck', `${workspaceName} has been stuck for ${stuckFor}min`);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; command: string }>(
      'forge://command-approval-required',
      (event) => {
        if (disposed) return;
        const workspace = workspacesRef.current.find((item) => item.id === event.payload.workspaceId);
        const workspaceName = workspace?.name ?? event.payload.workspaceId;
        void sendForgeNotification('Approval Needed', `Agent wants to run a command in ${workspaceName}`);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<{ workspaceId: string; cost: string; limit: number }>(
      'forge://workspace-budget-exceeded',
      (event) => {
        if (disposed) return;
        const { cost } = event.payload;
        void sendForgeNotification('Budget exceeded', `Workspace spend reached $${cost}`);
        const workspace = workspacesRef.current.find((item) => item.id === event.payload.workspaceId);
        const id = `budget-${event.payload.workspaceId}-${Date.now()}`;
        setAttentionToasts((current) => [
          { id, workspaceId: event.payload.workspaceId, workspaceName: workspace?.name ?? event.payload.workspaceId, text: `Budget cap reached: $${cost}` },
          ...current.slice(0, 2),
        ]);
        window.setTimeout(() => dismissAttentionToast(id), 8000);
      },
    ).then((fn) => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, [dismissAttentionToast]);

  return { attentionToasts, dismissAttentionToast };
}
