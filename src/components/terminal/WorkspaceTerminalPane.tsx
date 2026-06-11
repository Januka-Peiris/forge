import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TerminalWebSocket } from '../../lib/terminal-ws';
import { ChevronDown, ChevronUp, RotateCcw, Search, Square, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions, type ISearchResultChangeEvent } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalOutputChunk, TerminalProfile, TerminalSession } from '../../types';
import { invokeCommand } from '../../lib/tauri-api/client';
import { PROFILE_LABELS } from './workspace-terminal-constants';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';

const SEARCH_DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#c47a3a',
  matchBorder: '#d49560',
  matchOverviewRuler: '#c47a3a',
  activeMatchBackground: '#4a9ab5',
  activeMatchBorder: '#6db3ca',
  activeMatchColorOverviewRuler: '#4a9ab5',
};

function sessionBadgeVariant(session: TerminalSession): 'warning' | 'success' | 'destructive' | 'muted' {
  if (session.status === 'running') return 'success';
  if (session.status === 'failed' || session.status === 'interrupted') return 'destructive';
  return 'muted';
}

/** Human label instead of raw internal status vocabulary. */
function sessionStatusLabel(session: TerminalSession): string {
  switch (session.status) {
    case 'running': return 'running';
    case 'succeeded': return 'ended';
    case 'interrupted':
    case 'stopped': return 'stopped';
    case 'failed': return 'failed';
    default: return session.status;
  }
}

/** Opens a terminal link in the default browser via the backend (http/https only). */
function openExternalUrl(uri: string): void {
  void invokeCommand<void>('open_external_url', { url: uri }).catch(() => {});
}

function formatTerminalTimestamp(value?: string): string {
  if (!value) return 'a previous run';
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? 'a previous run' : date.toLocaleString();
}

export const TerminalPane = memo(function TerminalPane({
  session,
  chunks,
  focused,
  onFocus,
  onStop,
  onClose,
  onResumeClaude,
  onData,
  onResize,
  compact = false,
  terminalWs,
}: {
  session: TerminalSession;
  chunks: TerminalOutputChunk[];
  focused: boolean;
  stuckSince?: string | null;
  onFocus: () => void;
  onStop: () => void;
  onClose: () => void;
  onResumeClaude?: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  compact?: boolean;
  terminalWs?: TerminalWebSocket | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const lastRenderedSeqRef = useRef<number>(-1);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const terminalWsRef = useRef(terminalWs);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchResults, setSearchResults] = useState<ISearchResultChangeEvent>({
    resultIndex: -1,
    resultCount: 0,
  });
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [, setIsAltBuffer] = useState(false);
  const [scrollbackLines, setScrollbackLines] = useState<string[]>([]);
  const [showScrollback, setShowScrollback] = useState(false);
  const scrollbackRef = useRef<HTMLDivElement | null>(null);

  const searchOptions: ISearchOptions = useMemo(() => ({
    caseSensitive,
    decorations: SEARCH_DECORATIONS,
  }), [caseSensitive]);
  const running = session.status === 'running';
  const readOnly = !running;

  const focusSearchInput = useCallback(() => {
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, []);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    focusSearchInput();
  }, [focusSearchInput]);

  const closeSearch = () => {
    setShowSearch(false);
    setSearchTerm('');
    setSearchResults({ resultIndex: -1, resultCount: 0 });
    searchAddonRef.current?.clearDecorations();
    window.setTimeout(() => searchAddonRef.current?.clearDecorations(), 50);
    window.setTimeout(() => terminalRef.current?.focus(), 0);
  };

  const findNext = (incremental = false) => {
    const term = searchTerm.trim();
    if (!term) return;
    searchAddonRef.current?.findNext(term, { ...searchOptions, incremental });
  };

  const findPrevious = () => {
    const term = searchTerm.trim();
    if (!term) return;
    searchAddonRef.current?.findPrevious(term, searchOptions);
  };

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    terminalWsRef.current = terminalWs;
  }, [terminalWs]);

  useEffect(() => {
    if (!containerRef.current) return;
    setIsScrolledUp(false);
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 10000,
      // OSC 8 hyperlinks (e.g. from gh, modern CLIs) open in the browser.
      linkHandler: {
        activate: (_event, text) => openExternalUrl(text),
      },
      theme: {
        background: '#0a0a0a',
        foreground: '#d7dce5',
        cursor: '#4a9ab5',
        selectionBackground: '#4a9ab540',
      },
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 2000 });
    // Plain-text URLs become clickable links.
    const webLinksAddon = new WebLinksAddon((_event, uri) => openExternalUrl(uri));
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    lastRenderedSeqRef.current = -1;

    const snapshotNormalBuffer = () => {
      const buf = terminal.buffer.normal;
      const lines: string[] = [];
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines;
    };

    const bufferChangeDisposable = terminal.buffer.onBufferChange((buf) => {
      const alt = buf.type === 'alternate';
      setIsAltBuffer(alt);
      if (alt) {
        setScrollbackLines(snapshotNormalBuffer());
      } else {
        setShowScrollback(false);
      }
    });

    // xterm.js handles scroll natively. No custom wheel handler needed.

    const disposable = readOnly
      ? { dispose: () => undefined }
      : terminal.onData((data) => {
          const ws = terminalWsRef.current;
          if (ws?.connected) {
            ws.send(data);
          } else {
            onDataRef.current(data);
          }
        });
    const searchDisposable = searchAddon.onDidChangeResults((event) => {
      setSearchResults(event);
    });
    const scrollDisposable = terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      setIsScrolledUp(buffer.viewportY < buffer.baseY);
    });
    const onComposerScroll = (e: Event) => {
      const delta = (e as CustomEvent).detail?.deltaY;
      if (typeof delta === 'number') {
        terminal.scrollLines(delta > 0 ? 3 : -3);
      }
    };
    window.addEventListener('mn:composer-scroll', onComposerScroll);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;

      if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
        if (event.key === 'PageUp') {
          event.preventDefault();
          terminal.scrollLines(-(terminal.rows || 24));
          return false;
        }
        if (event.key === 'PageDown') {
          event.preventDefault();
          terminal.scrollLines(terminal.rows || 24);
          return false;
        }
      }

      if (!(event.metaKey || event.ctrlKey)) return true;
      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        openSearch();
        return false;
      }
      if (key === 'w' || key === '\\' || key === '-') {
        return false;
      }
      if (readOnly) {
        const navKeys = ['home', 'end', 'pageup', 'pagedown', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
        if (navKeys.includes(key)) return true;
        return false;
      }
      return true;
    });
    const fit = () => {
      try {
        fitAddon.fit();
        if (!readOnly && terminal.cols > 0 && terminal.rows > 0) {
          const ws = terminalWsRef.current;
          if (ws?.connected) {
            ws.sendResize(terminal.cols, terminal.rows);
          } else {
            onResizeRef.current(terminal.cols, terminal.rows);
          }
        }
      } catch {
        // xterm can throw before layout settles.
      }
    };
    // Initial fit: the ResizeObserver only fires on size changes, so without
    // this the terminal can render its first chunks at the 80x24 default (or
    // stay blank when mounted while the container has no layout yet). Retry
    // briefly while the container is still zero-sized (tab transitions).
    let fitRetryTimer = 0;
    const fitWhenSized = (attempt = 0) => {
      const element = containerRef.current;
      if (!element) return;
      if (element.clientWidth === 0 || element.clientHeight === 0) {
        if (attempt < 10) {
          fitRetryTimer = window.setTimeout(() => fitWhenSized(attempt + 1), 100);
        }
        return;
      }
      fit();
    };
    requestAnimationFrame(() => requestAnimationFrame(() => fitWhenSized()));

    // Coming back to the app/tab: re-fit and force a repaint, since layout
    // and renderer work may have been skipped while hidden.
    const onVisible = () => {
      if (document.hidden) return;
      requestAnimationFrame(() => {
        fitWhenSized();
        try {
          terminal.refresh(0, Math.max(0, terminal.rows - 1));
        } catch {
          // xterm can throw before layout settles.
        }
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    return () => {
      disposable.dispose();
      searchDisposable.dispose();
      scrollDisposable.dispose();
      bufferChangeDisposable.dispose();
      observer.disconnect();
      // wheelHandler removed: xterm.js handles scroll natively.
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('mn:composer-scroll', onComposerScroll);
      window.clearTimeout(fitRetryTimer);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [openSearch, readOnly, session.id]);

  useEffect(() => {
    if (!showSearch) return;
    focusSearchInput();
  }, [focusSearchInput, showSearch]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const next = chunks.filter((chunk) => chunk.seq > lastRenderedSeqRef.current);
    if (next.length === 0) return;

    const buffer = terminal.buffer.active;
    const wasScrolledUp = buffer.viewportY < buffer.baseY;
    const savedOffset = buffer.baseY - buffer.viewportY;

    for (const chunk of next) {
      terminal.write(chunk.data);
      lastRenderedSeqRef.current = Math.max(lastRenderedSeqRef.current, chunk.seq);
    }

    if (wasScrolledUp && savedOffset > 0) {
      requestAnimationFrame(() => {
        terminal.scrollToBottom();
        terminal.scrollLines(-savedOffset);
      });
    }

    if (!showSearch) {
      searchAddonRef.current?.clearDecorations();
    }
  }, [chunks, showSearch]);

  useEffect(() => {
    const searchAddon = searchAddonRef.current;
    if (!searchAddon || !showSearch) return;
    const term = searchTerm.trim();
    if (!term) {
      searchAddon.clearDecorations();
      setSearchResults({ resultIndex: -1, resultCount: 0 });
      return;
    }
    searchAddon.findNext(term, { ...searchOptions, incremental: true });
  }, [searchOptions, searchTerm, showSearch]);

  useEffect(() => {
    if (focused && !readOnly) terminalRef.current?.focus();
  }, [focused, readOnly]);

  // When a WebSocket is active, write its output directly to xterm (bypasses chunk store).
  useEffect(() => {
    if (!terminalWs) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminalWs.onData = (bytes: Uint8Array) => {
      terminal.write(bytes);
    };
  }, [terminalWs]);

  useEffect(() => {
    if (showScrollback && scrollbackRef.current) {
      scrollbackRef.current.scrollTop = scrollbackRef.current.scrollHeight;
    }
  }, [showScrollback]);

  const title = session.title || PROFILE_LABELS[session.profile as TerminalProfile] || session.profile;
  const restored = readOnly && chunks.length > 0;
  const canResumeClaude = readOnly
    && Boolean(session.claudeSessionId)
    && session.terminalKind === 'agent'
    && (session.profile === 'claude_code' || session.command.includes('claude'));
  const resultLabel = searchTerm.trim()
    ? searchResults.resultCount === 0
      ? 'No results'
      : searchResults.resultIndex >= 0
        ? `${searchResults.resultIndex + 1}/${searchResults.resultCount}`
        : `${searchResults.resultCount} results`
    : '';
  return (
    <section
      onFocusCapture={onFocus}
      title={session.cwd}
      className={`relative flex min-h-0 flex-1 flex-col rounded-md border bg-mn-bg ${focused ? 'border-mn-cyan/50 shadow-lg shadow-emerald-950/20' : 'border-mn-border'}`}
    >
      <div
        onMouseDown={onFocus}
        className="flex shrink-0 items-center justify-between gap-2 border-b border-mn-border/70 bg-mn-surface px-2 py-1.5"
      >
        <div className="flex min-w-0 items-center gap-2" title={`${session.status} · ${session.backend}`}>
          <span className="truncate text-[12px] font-bold text-mn-text">{title}</span>
          <Badge variant={sessionBadgeVariant(session)}>
            {sessionStatusLabel(session)}
          </Badge>
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
              className="text-mn-red hover:bg-mn-red/10"
            >
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
          {canResumeClaude && onResumeClaude && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                onResumeClaude();
              }}
              className="text-mn-cyan hover:bg-mn-cyan/10"
            >
              <RotateCcw className="h-3 w-3" /> Resume Claude
            </Button>
          )}
          {!compact && (
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
          )}
        </div>
      </div>
      {restored && (
        <div className="shrink-0 border-b border-mn-border/70 bg-black/20 px-3 py-1 text-[11px] text-mn-muted">
          Read-only history · ended {formatTerminalTimestamp(session.endedAt)}
        </div>
      )}
      {showSearch && (
        <div
          className="absolute right-3 top-12 z-20 flex items-center gap-1 rounded-md border border-mn-border bg-mn-surface/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Search className="h-3.5 w-3.5 text-mn-muted" />
          <Input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) {
                  findPrevious();
                } else {
                  findNext();
                }
              }
            }}
            placeholder="Search terminal"
            className="h-7 w-56"
          />
          <span className="min-w-[58px] text-center text-[11px] text-mn-muted">{resultLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Previous match (Shift+Enter)"
            disabled={!searchTerm.trim()}
            onClick={() => findPrevious()}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Next match (Enter)"
            disabled={!searchTerm.trim()}
            onClick={() => findNext()}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant={caseSensitive ? 'default' : 'ghost'}
            size="xs"
            title="Toggle case-sensitive search"
            onClick={() => setCaseSensitive((current) => !current)}
            className="px-1.5"
          >
            Aa
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Close search (Escape)"
            onClick={closeSearch}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div ref={containerRef} className={`${compact ? 'min-h-[80px]' : 'min-h-[180px]'} flex-1 p-2 ${showScrollback ? 'hidden' : ''}`} />
      {showScrollback && (
        <div
          ref={scrollbackRef}
          className={`${compact ? 'min-h-[80px]' : 'min-h-[180px]'} terminal-scrollbar flex-1 overflow-y-auto bg-[#0a0a0a] p-2 font-mono text-[12px] leading-[1.15] text-[#d7dce5]`}
        >
          <div className="sticky top-0 z-10 mb-2 flex items-center justify-between rounded border border-mn-border/50 bg-mn-surface/90 px-2 py-1 backdrop-blur">
            <span className="text-[11px] text-mn-muted">Scrollback - {scrollbackLines.length} lines</span>
            <button
              onClick={() => setShowScrollback(false)}
              className="text-[11px] text-mn-cyan hover:text-mn-text"
            >
              Back to terminal
            </button>
          </div>
          {scrollbackLines.map((line, i) => (
            <div key={i} className="whitespace-pre">{line || ' '}</div>
          ))}
        </div>
      )}
      {isScrolledUp && !showScrollback && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            terminalRef.current?.scrollToBottom();
            setIsScrolledUp(false);
          }}
          className="absolute bottom-4 right-4 z-20 border border-mn-border bg-mn-surface/95 shadow-xl shadow-black/40 backdrop-blur"
          title="Scroll to bottom"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Scroll to bottom
        </Button>
      )}
      {chunks.length === 0 && <div className="pointer-events-none absolute hidden">Waiting for terminal output...</div>}
    </section>
  );
});
