import { useState } from 'react';
import { Send, X } from 'lucide-react';

interface DiffAnnotationComposerProps {
  selectedCount: number;
  lineRangeLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onSend: (instruction: string) => void;
}

export function DiffAnnotationComposer({
  selectedCount,
  lineRangeLabel,
  busy = false,
  onCancel,
  onSend,
}: DiffAnnotationComposerProps) {
  const [instruction, setInstruction] = useState('');
  return (
    <div className="border-t border-mn-border bg-mn-surface/95 p-2 shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-mn-muted">
          Annotate {selectedCount} line{selectedCount === 1 ? '' : 's'} · {lineRangeLabel}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-mn-muted hover:bg-white/10 hover:text-mn-text"
          title="Cancel annotation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          rows={2}
          placeholder="Tell the agent what to do with these lines…"
          className="min-h-[54px] flex-1 resize-none rounded border border-mn-border bg-mn-bg px-2 py-1.5 text-xs text-mn-text placeholder:text-mn-muted focus:border-mn-cyan/40 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !instruction.trim()}
          onClick={() => {
            onSend(instruction.trim());
            setInstruction('');
          }}
          className="self-stretch rounded border border-mn-cyan/30 bg-mn-cyan/10 px-3 text-xs font-semibold text-mn-cyan hover:bg-mn-cyan/20 disabled:opacity-50"
        >
          <Send className="mr-1 inline h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </div>
  );
}
