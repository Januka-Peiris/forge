import { useEffect, useRef } from 'react';
import { RefreshCw, Square, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalOutputChunk, TerminalProfile, TerminalSession } from '../../types';
import { PROFILE_LABELS } from './workspace-terminal-constants';

export function terminalStatusBadgeClass(session: TerminalSession) {
  if (session.stale) return 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow';
  if (session.status === 'running') return 'border-forge-green/25 bg-forge-green/10 text-forge-green';
  if (session.status === 'failed' || session.status === 'interrupted') return 'border-forge-red/25 bg-forge-red/10 text-forge-red';
  return 'border-forge-border bg-white/5 text-forge-muted';
}

export function TerminalPane({
  session,
  chunks,
  focused,
  onFocus,
  onAttach,
  onStop,
  onClose,
  onData,
  onResize,
}: {
  session: TerminalSession;
  chunks: TerminalOutputChunk[];
  focused: boolean;
  stuckSince?: string | null;
  onFocus: () => void;
  onAttach: () => void;
  onStop: () => void;
  onClose: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastRenderedSeqRef = useRef<number>(-1);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 2500,
      theme: {
        background: '#08090c',
        foreground: '#d7dce5',
        cursor: '#ff6a00',
        selectionBackground: '#ff6a0040',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    lastRenderedSeqRef.current = -1;

    const disposable = terminal.onData((data) => onDataRef.current(data));
    const fit = () => {
      try {
        fitAddon.fit();
        if (terminal.cols > 0 && terminal.rows > 0) onResizeRef.current(terminal.cols, terminal.rows);
      } catch {
        // xterm can throw before layout settles.
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    window.setTimeout(fit, 30);
    return () => {
      disposable.dispose();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session.id]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const next = chunks.filter((chunk) => chunk.seq > lastRenderedSeqRef.current);
    for (const chunk of next) {
      terminal.write(chunk.data);
      lastRenderedSeqRef.current = Math.max(lastRenderedSeqRef.current, chunk.seq);
    }
  }, [chunks]);

  useEffect(() => {
    if (focused) terminalRef.current?.focus();
  }, [focused]);

  const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
  const running = session.status === 'running';
  return (
    <section
      onMouseDown={onFocus}
      className={`relative flex min-h-0 flex-1 flex-col rounded-xl border bg-[#08090c] ${focused ? 'border-forge-orange/50 shadow-lg shadow-orange-950/20' : 'border-forge-border'}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-forge-border/70 bg-forge-surface px-2 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-bold text-forge-text">{title}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${terminalStatusBadgeClass(session)}`}>
              {session.stale ? 'stale' : session.status}
            </span>
            <span className="rounded-full border border-forge-border bg-white/5 px-1.5 py-0.5 text-[9px] uppercase text-forge-muted">{session.backend}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-forge-text/82">{session.cwd}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onAttach();
            }}
            className="rounded px-2 py-1 text-[10px] text-forge-muted hover:bg-white/10"
          >
            <RefreshCw className="inline h-3 w-3" /> Attach
          </button>
          {running && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
              className="rounded px-2 py-1 text-[10px] text-forge-red hover:bg-forge-red/10"
            >
              <Square className="inline h-3 w-3" /> Stop
            </button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="rounded px-2 py-1 text-[10px] text-forge-muted hover:bg-white/10"
          >
            <X className="inline h-3 w-3" /> Close
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-[180px] flex-1 overflow-hidden p-2" />
      {chunks.length === 0 && <div className="pointer-events-none absolute hidden">Waiting for terminal output...</div>}
    </section>
  );
}
