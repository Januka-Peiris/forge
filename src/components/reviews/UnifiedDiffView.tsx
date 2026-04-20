interface UnifiedDiffViewProps {
  diff: string | null | undefined;
  emptyMessage?: string;
  className?: string;
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
  if (type === 'file_header') return 'bg-forge-blue/5 text-forge-blue/80';
  if (type === 'hunk_header') return 'bg-forge-surface-overlay text-forge-muted';
  if (type === 'addition') return 'bg-forge-green/10 text-forge-green';
  if (type === 'deletion') return 'bg-forge-red/10 text-forge-red';
  return 'text-forge-text/85';
}

export function UnifiedDiffView({
  diff,
  emptyMessage = 'No diff available.',
  className = '',
}: UnifiedDiffViewProps) {
  if (!diff || diff.trim().length === 0) {
    return (
      <div
        className={`flex min-h-0 flex-1 items-center justify-center p-4 text-ui-label text-forge-muted ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className={`min-h-0 flex-1 overflow-auto bg-forge-bg ${className}`}>
      <div className="min-w-full">
        {lines.map((line, index) => {
          const type = classifyDiffLine(line);
          const prefix = type === 'context' ? ' ' : line[0] ?? ' ';
          const body = type === 'context' ? line : line.slice(1);
          return (
            <div
              key={`${index}-${line}`}
              className={`flex items-start gap-2 border-b border-forge-border/20 px-3 py-0.5 font-mono text-ui-label leading-relaxed ${lineClasses(type)}`}
            >
              <span className="w-3 shrink-0 select-none text-center opacity-90">{prefix}</span>
              <span className="flex-1 whitespace-pre">{body}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
