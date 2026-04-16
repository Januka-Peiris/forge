import { AlertTriangle, X } from 'lucide-react';
import { approveWorkspaceTerminalCommand } from '../../lib/tauri-api/terminal';

export interface PendingCommand {
  sessionId: string;
  workspaceId: string;
  command: string;
}

interface CommandApprovalModalProps {
  pending: PendingCommand;
  onDismiss: () => void;
}

export function CommandApprovalModal({ pending, onDismiss }: CommandApprovalModalProps) {
  const handle = (approved: boolean) => {
    void approveWorkspaceTerminalCommand(pending.sessionId, approved).catch(() => undefined);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-forge-border bg-forge-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-forge-border px-4 py-3">
          <div className="flex items-center gap-2 text-forge-yellow">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[13px] font-semibold">Dangerous command detected</span>
          </div>
          <button onClick={onDismiss} className="rounded p-1 text-forge-muted hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="mb-3 text-[12px] text-forge-muted">
            This command matches a dangerous pattern. Allow it to run?
          </p>
          <pre className="overflow-x-auto rounded-md border border-forge-border bg-black/40 px-3 py-2 font-mono text-[12px] text-forge-text">
            {pending.command}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-forge-border px-4 py-3">
          <button
            onClick={() => handle(false)}
            className="rounded-md border border-forge-border bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-forge-text hover:bg-white/10"
          >
            Deny (Ctrl-C)
          </button>
          <button
            onClick={() => handle(true)}
            className="rounded-md border border-forge-red/40 bg-forge-red/15 px-3 py-1.5 text-[12px] font-semibold text-forge-red hover:bg-forge-red/25"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
