import { useState } from 'react';
import { CheckSquare, Square, FileText, Plus } from 'lucide-react';

interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

const initialItems: CheckItem[] = [
  { id: '1', text: 'Verify collapse animation timing is consistent across breakpoints', done: true },
  { id: '2', text: 'Add resolved count badge to thread header', done: true },
  { id: '3', text: 'Check that reply input clears after submit', done: false },
  { id: '4', text: 'Confirm snapshot tests updated after changes', done: false },
  { id: '5', text: 'Test with long thread (20+ comments) for virtualization', done: false },
];

const summaryBullets = [
  'Using useReview hook for all thread state — no props drilling',
  'Resolved count badge hides when resolvedCount === 0',
  'Collapse state is local — not persisted across sessions yet',
  'Reply mutation uses optimistic update pattern',
];

export function NotesTab() {
  const [items, setItems] = useState<CheckItem[]>(initialItems);
  const [noteText, setNoteText] = useState('');

  const toggle = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="bg-forge-card border border-forge-border rounded-xl p-4 shadow-forge-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-forge-green" />
            <h3 className="text-ui-label font-semibold text-forge-text">Checklist</h3>
          </div>
          <span className="text-ui-caption text-forge-muted font-medium">
            {doneCount}/{items.length} done
          </span>
        </div>

        <div className="w-full bg-forge-surface-overlay rounded-full h-0.5 mb-3 overflow-hidden">
          <div
            className="h-0.5 rounded-full bg-forge-green transition-all duration-500 shadow-emerald-glow"
            style={{ width: `${(doneCount / items.length) * 100}%` }}
          />
        </div>

        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className="w-full flex items-start gap-2.5 py-1.5 rounded-md hover:bg-forge-surface-overlay transition-colors px-1 text-left group"
            >
              {item.done ? (
                <CheckSquare className="w-3.5 h-3.5 text-forge-green shrink-0 mt-0.5" />
              ) : (
                <Square className="w-3.5 h-3.5 text-forge-muted shrink-0 mt-0.5 group-hover:text-forge-text/80 transition-colors" />
              )}
              <span className={`text-ui-label leading-snug ${item.done ? 'line-through text-forge-muted' : 'text-forge-text/88'}`}>
                {item.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-forge-card border border-forge-border rounded-xl p-4 shadow-forge-card">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-forge-blue" />
          <h3 className="text-ui-label font-semibold text-forge-text">Session Summary</h3>
        </div>
        <ul className="space-y-1.5">
          {summaryBullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-ui-label text-forge-text/70 leading-snug">
              <span className="text-forge-blue mt-1 shrink-0">·</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-forge-card border border-forge-border rounded-xl p-4 shadow-forge-card">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-forge-muted" />
          <h3 className="text-ui-label font-semibold text-forge-text">Quick Note</h3>
        </div>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note for this session..."
          rows={3}
          className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-ui-label text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-green/40 resize-none transition-colors"
        />
      </div>
    </div>
  );
}
