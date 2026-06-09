import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Search, Square, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions, type ISearchResultChangeEvent } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalOutputChunk, TerminalProfile, TerminalSession } from '../../types';
import { PROFILE_LABELS } from './workspace-terminal-constants';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';

const SEARCH_DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#F97316',
  matchBorder: '#FB923C',
  matchOverviewRuler: '#F97316',
  activeMatchBackground: '#00D4FF',
  activeMatchBorder: '#66E5FF',
  activeMatchColorOverviewRuler: '#00D4FF',
};

function sessionBadgeVariant(session: TerminalSession): 'warning' | 'success' | 'destructive' | 'muted' {
  if (session.status === 'running') return 'success';
  if (session.status === 'failed' || session.status === 'interrupted') return 'destructive';
  return 'muted';
}

function formatTerminalTimestamp(value?: string): string {
  if (!value) return 'a previous run';
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? 'a previous run' : date.toLocaleString();
}

export function TerminalPane({
  session,
  chunks,
  focused,
  onFocus,
  onStop,
  onClose,
  onResumeClaude,
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
  onResumeClaude?: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const lastRenderedSeqRef = useRef<number>(-1);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchResults, setSearchResults] = useState<ISearchResultChangeEvent>({
    resultIndex: -1,
    resultCount: 0,
  });

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
    if (!containerRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 10000,
      theme: {
        background: '#0a0a0a',
        foreground: '#d7dce5',
        cursor: '#00D4FF',
        selectionBackground: '#00D4FF40',
      },
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 2000 });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    lastRenderedSeqRef.current = -1;

    const disposable = readOnly
      ? { dispose: () => undefined }
      : terminal.onData((data) => onDataRef.current(data));
    const searchDisposable = searchAddon.onDidChangeResults((event) => {
      setSearchResults(event);
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
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
      if (readOnly) return false;
      return true;
    });
    const fit = () => {
      try {
        fitAddon.fit();
        if (!readOnly && terminal.cols > 0 && terminal.rows > 0) {
          onResizeRef.current(terminal.cols, terminal.rows);
        }
      } catch {
        // xterm can throw before layout settles.
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    return () => {
      disposable.dispose();
      searchDisposable.dispose();
      observer.disconnect();
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
    for (const chunk of next) {
      terminal.write(chunk.data);
      lastRenderedSeqRef.current = Math.max(lastRenderedSeqRef.current, chunk.seq);
    }
    if (!showSearch && next.length > 0) {
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
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-bold text-mn-text">{title}</span>
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
      {restored && (
        <div className="shrink-0 border-b border-mn-border/70 bg-mn-blue/10 px-3 py-1 text-[11px] text-mn-blue">
          Restored read-only session history from {formatTerminalTimestamp(session.endedAt)}. Start a new session to continue.
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
      <div ref={containerRef} className="min-h-[180px] flex-1 overflow-hidden p-2" />
      {chunks.length === 0 && <div className="pointer-events-none absolute hidden">Waiting for terminal output...</div>}
    </section>
  );
}
