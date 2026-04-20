import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const SHORTCUTS = [
  ['Cmd/Ctrl K', 'Open command palette'],
  ['Cmd/Ctrl 1–9', 'Select visible workspace'],
  ['/', 'Focus workspace composer'],
  ['[ / ]', 'Previous / next workspace'],
  ['Cmd/Ctrl Shift D', 'Toggle detail panel'],
  ['Cmd/Ctrl Shift R', 'Open Review Cockpit'],
  ['Enter', 'Send composer prompt'],
  ['Shift Enter', 'New line in composer'],
  ['Esc', 'Blur composer or close this help'],
] as const;

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-forge-border bg-forge-surface p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-forge-green" />
            <h2 className="text-sm font-bold text-forge-text">Keyboard shortcuts</h2>
          </div>
          <button type="button" className="text-xs text-forge-muted hover:text-forge-text" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-1.5 text-xs">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-3 rounded border border-forge-border/50 bg-black/15 px-2 py-1.5">
              <span className="font-mono text-[11px] text-forge-text">{keys}</span>
              <span className="text-forge-muted">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
