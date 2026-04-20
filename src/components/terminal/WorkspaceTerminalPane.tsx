import { useEffect, useRef } from 'react';
import { Square, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalOutputChunk, TerminalProfile, TerminalSession } from '../../types';
import { PROFILE_LABELS } from './workspace-terminal-constants';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

function sessionBadgeVariant(session: TerminalSession): 'warning' | 'success' | 'destructive' | 'muted' {
  if (session.status === 'running') return 'success';
  if (session.status === 'failed' || session.status === 'interrupted') return 'destructive';
  return 'muted';
}

export function TerminalPane({
  session,
  chunks,
  focused,
  onFocus,
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
        background: '#0a0a0a',
        foreground: '#d7dce5',
        cursor: '#22c55e',
        selectionBackground: '#22c55e40',
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
      title={session.cwd}
      className={`relative flex min-h-0 flex-1 flex-col rounded-md border bg-forge-bg ${focused ? 'border-forge-green/50 shadow-lg shadow-emerald-950/20' : 'border-forge-border'}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-forge-border/70 bg-forge-surface px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-bold text-forge-text">{title}</span>
          <Badge variant={sessionBadgeVariant(session)}>
            {session.status}
          </Badge>
          <Badge variant="muted">{session.backend}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {running && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
              className="text-forge-red hover:bg-forge-red/10"
            >
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X className="h-3 w-3" /> Close
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-[180px] flex-1 overflow-hidden p-2" />
      {chunks.length === 0 && <div className="pointer-events-none absolute hidden">Waiting for terminal output...</div>}
    </section>
  );
}
