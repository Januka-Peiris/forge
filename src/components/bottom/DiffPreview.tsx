import { useState } from 'react';
import { FileCode, Plus, Minus } from 'lucide-react';
import type { DiffFile } from '../../types';

interface DiffPreviewProps {
  files: DiffFile[];
}

function DiffLine({ line }: { line: DiffFile['lines'][number] }) {
  if (line.type === 'header') {
    return (
      <div className="flex gap-3 px-4 py-1 bg-forge-blue/5 border-y border-forge-blue/10">
        <span className="text-[10px] font-mono text-forge-blue/70 select-none">{line.content}</span>
      </div>
    );
  }

  const bg =
    line.type === 'addition'
      ? 'bg-forge-green/5 hover:bg-forge-green/10'
      : line.type === 'deletion'
      ? 'bg-forge-red/5 hover:bg-forge-red/10'
      : 'hover:bg-white/2';

  const prefix =
    line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';

  const textColor =
    line.type === 'addition'
      ? 'text-forge-green/90'
      : line.type === 'deletion'
      ? 'text-forge-red/90'
      : 'text-forge-text/70';

  const lineNumColor =
    line.type === 'addition'
      ? 'text-forge-green/40'
      : line.type === 'deletion'
      ? 'text-forge-red/40'
      : 'text-forge-muted/80';

  return (
    <div className={`flex gap-3 px-4 py-0.5 transition-colors ${bg}`}>
      <span className={`text-[10px] font-mono select-none w-6 shrink-0 text-right ${lineNumColor}`}>
        {line.lineNumber ?? ''}
      </span>
      <span className={`text-[11px] font-mono select-none w-3 shrink-0 ${textColor}`}>{prefix}</span>
      <span className={`text-[11px] font-mono flex-1 whitespace-pre ${textColor}`}>{line.content}</span>
    </div>
  );
}

export function DiffPreview({ files }: DiffPreviewProps) {
  const [activeFile, setActiveFile] = useState(0);
  const current = files[activeFile];

  return (
    <div className="flex flex-col h-full bg-[#0a0d12]">
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-forge-border shrink-0 bg-forge-surface/50">
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setActiveFile(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-t-md border border-b-0 transition-colors ${
              i === activeFile
                ? 'bg-[#0a0d12] border-forge-border text-forge-text'
                : 'border-transparent text-forge-muted hover:text-forge-text hover:bg-white/3'
            }`}
          >
            <FileCode className="w-3 h-3" />
            {f.name}
            <span className="flex items-center gap-0.5 ml-1">
              <Plus className="w-2.5 h-2.5 text-forge-green" />
              <span className="text-forge-green text-[10px]">{f.additions}</span>
              <Minus className="w-2.5 h-2.5 text-forge-red" />
              <span className="text-forge-red text-[10px]">{f.deletions}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="px-4 py-1.5 border-b border-forge-border bg-forge-bg/30 flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-forge-muted font-mono">{current.path}</span>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono">
          <span className="text-forge-green">+{current.additions}</span>
          <span className="text-forge-red">-{current.deletions}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {current.lines.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </div>
    </div>
  );
}
