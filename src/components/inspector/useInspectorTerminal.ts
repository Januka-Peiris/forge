import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TerminalOutputChunk, TerminalOutputEvent, TerminalSession } from '../../types';
import {
  createWorkspaceTerminal,
  getWorkspaceTerminalOutputForSession,
  listWorkspaceTerminalSessions,
  resizeWorkspaceTerminalSession,
  stopWorkspaceTerminalSessionById,
  writeWorkspaceTerminalSessionInput,
} from '../../lib/tauri-api/terminal';

const INSPECTOR_SHELL_TITLE = 'Inspector Shell';

interface UseInspectorTerminalResult {
  session: TerminalSession | null;
  chunks: TerminalOutputChunk[];
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onStop: () => void;
}

export function useInspectorTerminal(
  workspaceId: string | null,
  isOpen: boolean,
): UseInspectorTerminalResult {
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [chunks, setChunks] = useState<TerminalOutputChunk[]>([]);
  const nextSeqRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const initingRef = useRef(false);

  useEffect(() => {
    if (!workspaceId || !isOpen) {
      setSession(null);
      setChunks([]);
      nextSeqRef.current = 0;
      sessionIdRef.current = null;
      return;
    }

    let cancelled = false;
    initingRef.current = true;

    const init = async () => {
      try {
        const sessions = await listWorkspaceTerminalSessions(workspaceId);
        const existing = sessions.find(
          (s) =>
            s.title === INSPECTOR_SHELL_TITLE &&
            s.terminalKind === 'shell' &&
            s.status === 'running',
        );

        if (cancelled) return;

        let active: TerminalSession;
        if (existing) {
          active = existing;
        } else {
          active = await createWorkspaceTerminal({
            workspaceId,
            kind: 'shell',
            profile: 'shell',
            title: INSPECTOR_SHELL_TITLE,
          });
        }

        if (cancelled) return;

        sessionIdRef.current = active.id;
        setSession(active);

        const output = await getWorkspaceTerminalOutputForSession(
          workspaceId,
          active.id,
          0,
        );
        if (cancelled) return;
        setChunks(output.chunks);
        nextSeqRef.current = output.nextSeq;
      } catch (err) {
        console.warn('Inspector terminal init failed:', err);
      } finally {
        initingRef.current = false;
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, isOpen]);

  useEffect(() => {
    if (!workspaceId || !isOpen) return;

    let disposed = false;
    let unlisten: UnlistenFn | null = null;

    listen<TerminalOutputEvent>('mn://terminal-output', (event) => {
      if (disposed) return;
      if (event.payload.workspaceId !== workspaceId) return;
      if (!sessionIdRef.current) return;
      if (event.payload.chunk.sessionId !== sessionIdRef.current) return;

      const chunk = event.payload.chunk;
      setChunks((prev) => [...prev, chunk]);
      nextSeqRef.current = Math.max(nextSeqRef.current, chunk.seq + 1);
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => console.warn('Inspector terminal event listener failed:', err));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [workspaceId, isOpen]);

  useEffect(() => {
    if (!workspaceId || !isOpen || !sessionIdRef.current) return;

    const interval = window.setInterval(async () => {
      if (document.hidden || !sessionIdRef.current) return;
      try {
        const output = await getWorkspaceTerminalOutputForSession(
          workspaceId,
          sessionIdRef.current,
          nextSeqRef.current,
        );
        if (output.chunks.length > 0) {
          setChunks((prev) => [...prev, ...output.chunks]);
          nextSeqRef.current = output.nextSeq;
        }
        if (output.session) {
          setSession(output.session);
        }
      } catch {
        // Polling failure is non-critical
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [workspaceId, isOpen, session?.id]);

  const onData = useCallback((data: string) => {
    if (!sessionIdRef.current) return;
    void writeWorkspaceTerminalSessionInput(sessionIdRef.current, data);
  }, []);

  const onResize = useCallback((cols: number, rows: number) => {
    if (!sessionIdRef.current) return;
    void resizeWorkspaceTerminalSession(sessionIdRef.current, cols, rows);
  }, []);

  const onStop = useCallback(() => {
    if (!sessionIdRef.current) return;
    void stopWorkspaceTerminalSessionById(sessionIdRef.current);
  }, []);

  return { session, chunks, onData, onResize, onStop };
}
