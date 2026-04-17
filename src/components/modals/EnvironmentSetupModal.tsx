import { Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../ui/dialog';
import type { EnvironmentCheckItem } from '../../types';

interface EnvironmentSetupModalProps {
  items: EnvironmentCheckItem[];
  busy: boolean;
  onContinue: () => void;
  onRerun: () => void;
}

export function EnvironmentSetupModal({ items, busy, onContinue, onRerun }: EnvironmentSetupModalProps) {
  const copyCommand = async (command: string) => {
    await navigator.clipboard?.writeText(command);
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Environment Setup</DialogTitle>
          <DialogDescription>Forge checked your local tools. Missing tools will not block app usage.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          {items.map((item) => (
            <div key={item.binary} className="rounded-xl border border-forge-border bg-forge-bg/80 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={item.status === 'ok' ? 'text-forge-green' : item.status === 'missing' ? 'text-forge-red' : 'text-forge-yellow'}>
                    {item.status === 'ok' ? '✓' : item.status === 'missing' ? '✗' : '?'}
                  </span>
                  <span className="text-[13px] font-semibold text-forge-text">{item.name}</span>
                  {item.optional && <Badge variant="muted">optional</Badge>}
                </div>
                <span className="text-[10px] uppercase tracking-widest text-forge-muted">{item.status}</span>
              </div>
              {item.status !== 'ok' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-forge-border bg-black/20 px-2 py-1.5">
                  <span className="text-[11px] text-forge-muted">Run:</span>
                  <code className="flex-1 truncate text-[11px] text-forge-text">{item.fix}</code>
                  <Button type="button" variant="secondary" size="xs" onClick={() => void copyCommand(item.fix)}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
              )}
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onContinue}>Continue anyway</Button>
          <Button type="button" variant="default" disabled={busy} onClick={onRerun}>
            {busy ? 'Checking…' : 'Re-run checks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
