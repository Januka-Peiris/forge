import { useMemo, useState } from 'react';
import { DiffAnnotationComposer } from './DiffAnnotationComposer';

export interface DiffAnnotationPayload {
  filePath: string | null;
  startLine: number;
  endLine: number;
  selectedDiff: string;
  instruction: string;
}

interface UnifiedDiffViewProps {
  diff: string | null | undefined;
  filePath?: string | null;
  emptyMessage?: string;
  className?: string;
  annotationBusy?: boolean;
  onSendAnnotation?: (payload: DiffAnnotationPayload) => void;
}

type DiffLineType = 'file_header' | 'hunk_header' | 'addition' | 'deletion' | 'context';

function classifyDiffLine(line: string): DiffLineType {
  if (
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  ) {
    return 'file_header';
  }
  if (line.startsWith('@@')) return 'hunk_header';
  if (line.startsWith('+')) return 'addition';
  if (line.startsWith('-')) return 'deletion';
  return 'context';
}

function lineClasses(type: DiffLineType): string {
  if (type === 'file_header') return 'bg-mn-blue/5 text-mn-blue/80';
  if (type === 'hunk_header') return 'bg-mn-surface-overlay text-mn-muted';
  if (type === 'addition') return 'bg-green-500/10 text-green-400';
  if (type === 'deletion') return 'bg-red-500/10 text-red-400';
  return 'text-mn-text/85';
}

export function UnifiedDiffView({
  diff,
  filePath = null,
  emptyMessage = 'No diff available.',
  className = '',
  annotationBusy = false,
  onSendAnnotation,
}: UnifiedDiffViewProps) {
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [anchorLine, setAnchorLine] = useState<number | null>(null);
  const lines = useMemo(() => diff?.split('\n') ?? [], [diff]);
  const rows = useMemo(() => buildDiffRows(lines), [lines]);
  const selectedIndexes = useMemo(() => Array.from(selectedLines).sort((a, b) => a - b), [selectedLines]);
  const selectedDiff = selectedIndexes.map((index) => lines[index]).join('\n');
  const selectedNewLines = selectedIndexes
    .map((index) => rows[index]?.newLine)
    .filter((line): line is number => typeof line === 'number');
  const selectedOldLines = selectedIndexes
    .map((index) => rows[index]?.oldLine)
    .filter((line): line is number => typeof line === 'number');
  const numericSelection = selectedNewLines.length > 0 ? selectedNewLines : selectedOldLines;
  const startLine = numericSelection.length > 0 ? Math.min(...numericSelection) : (selectedIndexes[0] ?? 0) + 1;
  const endLine = numericSelection.length > 0 ? Math.max(...numericSelection) : (selectedIndexes[selectedIndexes.length - 1] ?? 0) + 1;
  const lineRangeLabel = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;

  if (!diff || diff.trim().length === 0) {
    return (
      <div
        className={`flex min-h-0 flex-1 items-center justify-center p-4 text-ui-label text-mn-muted ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  const toggleLine = (index: number, shiftKey: boolean) => {
    setSelectedLines((current) => {
      const next = new Set(current);
      if (shiftKey && anchorLine !== null) {
        const start = Math.min(anchorLine, index);
        const end = Math.max(anchorLine, index);
        for (let lineIndex = start; lineIndex <= end; lineIndex += 1) next.add(lineIndex);
      } else if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setAnchorLine(index);
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-mn-bg ${className}`}>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-full">
          {rows.map((row, index) => {
            const type = classifyDiffLine(row.raw);
            const prefix = type === 'context' ? ' ' : row.raw[0] ?? ' ';
            const body = type === 'context' ? row.raw : row.raw.slice(1);
            const selected = selectedLines.has(index);
            return (
              <button
                key={`${index}-${row.raw}`}
                type="button"
                onClick={(event) => toggleLine(index, event.shiftKey)}
                className={`flex w-full items-start gap-2 border-b border-mn-border/20 px-3 py-0.5 text-left font-mono text-ui-label leading-relaxed ${lineClasses(type)} ${selected ? 'ring-1 ring-inset ring-mn-orange/70 brightness-125' : 'hover:bg-white/5'}`}
              >
                <span className="w-10 shrink-0 select-none text-right text-mn-dim">{row.oldLine ?? ''}</span>
                <span className="w-10 shrink-0 select-none text-right text-mn-dim">{row.newLine ?? ''}</span>
                <span className="w-3 shrink-0 select-none text-center opacity-90">{prefix}</span>
                <span className="flex-1 whitespace-pre">{body}</span>
              </button>
            );
          })}
        </div>
      </div>
      {selectedIndexes.length > 0 && onSendAnnotation && (
        <DiffAnnotationComposer
          selectedCount={selectedIndexes.length}
          lineRangeLabel={lineRangeLabel}
          busy={annotationBusy}
          onCancel={() => {
            setSelectedLines(new Set());
            setAnchorLine(null);
          }}
          onSend={(instruction) => {
            onSendAnnotation({
              filePath,
              startLine,
              endLine,
              selectedDiff,
              instruction,
            });
            setSelectedLines(new Set());
            setAnchorLine(null);
          }}
        />
      )}
    </div>
  );
}

function buildDiffRows(lines: string[]) {
  let oldLine: number | null = null;
  let newLine: number | null = null;
  return lines.map((raw) => {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { raw, oldLine: null, newLine: null };
    }
    const type = classifyDiffLine(raw);
    if (type === 'file_header') return { raw, oldLine: null, newLine: null };
    if (type === 'addition') {
      const row = { raw, oldLine: null, newLine };
      if (newLine !== null) newLine += 1;
      return row;
    }
    if (type === 'deletion') {
      const row = { raw, oldLine, newLine: null };
      if (oldLine !== null) oldLine += 1;
      return row;
    }
    const row = { raw, oldLine, newLine };
    if (oldLine !== null) oldLine += 1;
    if (newLine !== null) newLine += 1;
    return row;
  });
}
