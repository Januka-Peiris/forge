import { useCallback, useEffect, useRef, useState } from 'react';
import { OUTPUT_RETENTION_CHUNKS, type OutputMap } from './workspace-terminal-constants';
import type { TerminalOutputChunk } from '../../types';

export function useWorkspaceTerminalOutput() {
  const [outputs, setOutputs] = useState<OutputMap>({});
  const nextSeqRef = useRef<Record<string, number>>({});
  const pendingOutputRef = useRef<Record<string, TerminalOutputChunk[]>>({});
  const outputFlushRafRef = useRef<number | null>(null);

  const appendOutput = useCallback((sessionId: string, chunks: TerminalOutputChunk[], reset = false) => {
    if (chunks.length === 0 && !reset) return;
    setOutputs((current) => ({
      ...current,
      [sessionId]: reset ? chunks : [...(current[sessionId] ?? []), ...chunks].slice(-OUTPUT_RETENTION_CHUNKS),
    }));
  }, []);

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

      setOutputs((current) => {
        let next = current;
        for (const [pendingSessionId, pendingChunks] of Object.entries(pending)) {
          if (pendingChunks.length === 0) continue;
          if (next === current) next = { ...current };
          next[pendingSessionId] = [...(next[pendingSessionId] ?? []), ...pendingChunks].slice(-OUTPUT_RETENTION_CHUNKS);
        }
        return next;
      });
    });
  }, []);

  const getNextSeq = useCallback((sessionId: string) => nextSeqRef.current[sessionId] ?? 0, []);

  const setNextSeq = useCallback((sessionId: string, nextSeq: number) => {
    nextSeqRef.current[sessionId] = nextSeq;
  }, []);

  const bumpNextSeqFromChunk = useCallback((sessionId: string, seq: number) => {
    nextSeqRef.current[sessionId] = Math.max(nextSeqRef.current[sessionId] ?? 0, seq + 1);
  }, []);

  const removeSessionOutput = useCallback((sessionId: string) => {
    delete nextSeqRef.current[sessionId];
    setOutputs((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
  }, []);

  const resetOutputState = useCallback(() => {
    nextSeqRef.current = {};
    pendingOutputRef.current = {};
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
    setOutputs({});
  }, []);

  useEffect(() => () => {
    if (outputFlushRafRef.current !== null) {
      window.cancelAnimationFrame(outputFlushRafRef.current);
      outputFlushRafRef.current = null;
    }
  }, []);

  return {
    outputs,
    appendOutput,
    enqueueOutput,
    getNextSeq,
    setNextSeq,
    bumpNextSeqFromChunk,
    removeSessionOutput,
    resetOutputState,
  };
}
