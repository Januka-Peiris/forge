import { AlertTriangle } from 'lucide-react';
import { approveWorkspaceTerminalCommand } from '../../lib/tauri-api/terminal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';

export interface PendingCommand {
  sessionId: string;
  workspaceId: string;
  command: string;
}

interface CommandApprovalModalProps {
  pending: PendingCommand | null;
  onDismiss: () => void;
}

export function CommandApprovalModal({ pending, onDismiss }: CommandApprovalModalProps) {
  const handle = (approved: boolean) => {
    if (!pending) return;
    void approveWorkspaceTerminalCommand(pending.sessionId, approved).catch(() => undefined);
    onDismiss();
  };

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-forge-yellow">
            <AlertTriangle className="h-4 w-4" />
            Dangerous command detected
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <p className="mb-3 text-[12px] text-forge-muted">
            This command matches a dangerous pattern. Allow it to run?
          </p>
          <pre className="overflow-x-auto rounded-md border border-forge-border bg-black/40 px-3 py-2 font-mono text-[12px] text-forge-text">
            {pending?.command}
          </pre>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => handle(false)}>
            Deny (Ctrl-C)
          </Button>
          <Button variant="default" size="sm" onClick={() => handle(true)}>
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
