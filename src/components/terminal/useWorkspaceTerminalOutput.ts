import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { OUTPUT_RETENTION_CHUNKS, type OutputMap } from './workspace-terminal-constants';
import type { TerminalOutputChunk } from '../../types';

const EMPTY_CHUNKS: TerminalOutputChunk[] = [];

function mergeChunks(existing: TerminalOutputChunk[], incoming: TerminalOutputChunk[]): TerminalOutputChunk[] {
  const lastSeq = existing.length > 0 ? existing[existing.length - 1].seq : -1;
  const fresh = incoming.filter((chunk) => chunk.seq > lastSeq);
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh].slice(-OUTPUT_RETENTION_CHUNKS);
}

export interface TerminalOutputStore {
  subscribe: (sessionId: string, listener: () => void) => () => void;
  getSessionChunks: (sessionId: string) => TerminalOutputChunk[];
  getOutputs: () => OutputMap;
}

export function useWorkspaceTerminalOutput() {
  const outputsRef = useRef<OutputMap>({});
  const listenersRef = useRef(new Map<string, Set<() => void>>());
  const nextSeqRef = useRef<Record<string, number>>({});
  const pendingOutputRef = useRef<Record<string, TerminalOutputChunk[]>>({});
  const outputFlushRafRef = useRef<number | null>(null);

  const notify = useCallback((sessionId: string) => {
    listenersRef.current.get(sessionId)?.forEach((l) => l());
  }, []);

  const subscribe = useCallback((sessionId: string, listener: () => void) => {
    if (!listenersRef.current.has(sessionId)) {
      listenersRef.current.set(sessionId, new Set());
    }
    listenersRef.current.get(sessionId)!.add(listener);
    return () => {
      listenersRef.current.get(sessionId)?.delete(listener);
    };
  }, []);

  const getSessionChunks = useCallback((sessionId: string) => {
    return outputsRef.current[sessionId] ?? EMPTY_CHUNKS;
  }, []);

  const getOutputs = useCallback(() => outputsRef.current, []);

  const appendOutput = useCallback((sessionId: string, chunks: TerminalOutputChunk[], reset = false) => {
    if (chunks.length === 0 && !reset) return;
    const current = outputsRef.current;
    outputsRef.current = {
      ...current,
      [sessionId]: reset ? chunks : mergeChunks(current[sessionId] ?? [], chunks),
    };
    notify(sessionId);
  }, [notify]);

  const enqueueOutput = useCallback((sessionId: string, chunks: TerminalOutputChunk[]) => {
    if (chunks.length === 0) return;
    pendingOutputRef.current[sessionId] = [
      ...(pendingOutputRef.current[sessionId] ?? []),
      ...chunks,
    ];
    if (outputFlushRafRef.current !== null) return;

    outputFlushRafRef.current = window.requestAnimationFrame(() => {
      outputFlushRafRef.current = null;
      const pending = pendingOutputRef.current;
      pendingOutputRef.current = {};

      const current = outputsRef.current;
      let next = current;
      const notifyIds: string[] = [];
      for (const [pendingSessionId, pendingChunks] of Object.entries(pending)) {
        if (pendingChunks.length === 0) continue;
        const existing = next[pendingSessionId] ?? [];
        const merged = mergeChunks(existing, pendingChunks);
        if (merged === existing) continue;
        if (next === current) next = { ...current };
        next[pendingSessionId] = merged;
        notifyIds.push(pendingSessionId);
      }
      if (next !== current) {
        outputsRef.current = next;
        for (const id of notifyIds) notify(id);
      }
    });
  }, [notify]);

  const getNextSeq = useCallback((sessionId: string) => nextSeqRef.current[sessionId] ?? 0, []);

  const setNextSeq = useCallback((sessionId: string, nextSeq: number) => {
    nextSeqRef.current[sessionId] = nextSeq;
  }, []);

  const bumpNextSeqFromChunk = useCallback((sessionId: string, seq: number) => {
    nextSeqRef.current[sessionId] = Math.max(nextSeqRef.current[sessionId] ?? 0, seq + 1);
  }, []);

  const removeSessionOutput = useCallback((sessionId: string) => {
    delete nextSeqRef.current[sessionId];
    const current = outputsRef.current;
    if (sessionId in current) {
      const next = { ...current };
      delete next[sessionId];
      outputsRef.current = next;
      notify(sessionId);
    }
  }, [notify]);

  const resetOutputState = useCallback(() => {
    nextSeqRef.current = {};
    pendingOutputRef.current = {};
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
    outputsRef.current = {};
  }, []);

  useEffect(() => () => {
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
  }, []);

  const store: TerminalOutputStore = { subscribe, getSessionChunks, getOutputs };

  return {
    outputStore: store,
    appendOutput,
    enqueueOutput,
    getNextSeq,
    setNextSeq,
    bumpNextSeqFromChunk,
    removeSessionOutput,
    resetOutputState,
  };
}

export function useSessionChunks(store: TerminalOutputStore, sessionId: string): TerminalOutputChunk[] {
  return useSyncExternalStore(
    (cb) => store.subscribe(sessionId, cb),
    () => store.getSessionChunks(sessionId),
  );
}
