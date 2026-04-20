import { AlertTriangle, ShieldCheck, AlertCircle, Info, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { approveWorkspaceTerminalCommand } from '../../lib/tauri-api/terminal';
import { checkShellCommandSafety } from '../../lib/tauri-api/command-safety';
import type { CommandSafetyResult } from '../../types/command-safety';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

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
  const [analysis, setAnalysis] = useState<CommandSafetyResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (pending?.command) {
      checkShellCommandSafety(pending.command)
        .then(setAnalysis);
    } else {
      setAnalysis(null);
    }
  }, [pending?.command]);

  const handle = (approved: boolean) => {
    if (!pending) return;
    void approveWorkspaceTerminalCommand(pending.sessionId, approved).catch(() => undefined);
    onDismiss();
  };

  const safetyColor = analysis?.safetyLevel === 'risky' ? 'text-forge-orange' : 
                     analysis?.safetyLevel === 'blocked' ? 'text-forge-red' : 
                     'text-forge-blue';

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="max-w-md border-forge-orange/30">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${safetyColor}`}>
            {analysis?.safetyLevel === 'risky' || analysis?.safetyLevel === 'blocked' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Command Guardrail
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-forge-border bg-black/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-forge-muted">Intended Command</span>
              {analysis && (
                <Badge variant={analysis.safetyLevel === 'risky' ? 'warning' : 'info'}>
                  {analysis.category}
                </Badge>
              )}
            </div>
            <pre className="overflow-x-auto font-mono text-[12px] text-forge-text break-all whitespace-pre-wrap">
              {pending?.command}
            </pre>
          </div>

          {analysis && (
            <div className={`rounded-lg border p-3 ${
              analysis.safetyLevel === 'risky' ? 'border-forge-orange/20 bg-forge-orange/5' : 'border-forge-blue/20 bg-forge-blue/5'
            }`}>
              <div className="flex items-start gap-2">
                <Info className={`h-4 w-4 mt-0.5 shrink-0 ${safetyColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-forge-text leading-tight mb-1">Analysis</p>
                  <p className="text-[12px] text-forge-muted leading-relaxed">
                    {analysis.explanation}
                  </p>
                </div>
              </div>

              {analysis.risks.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <button 
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter text-forge-muted hover:text-forge-text"
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                    Detected Risks ({analysis.risks.length})
                  </button>
                  {showDetails && (
                    <ul className="space-y-1 pl-4">
                      {analysis.risks.map((risk, i) => (
                        <li key={i} className="text-[11px] text-forge-orange flex items-start gap-1.5">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => handle(false)} className="text-forge-muted">
            Deny (Ctrl-C)
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => handle(true)}
            className={analysis?.safetyLevel === 'risky' ? 'bg-forge-orange hover:bg-forge-orange/90 text-white' : 'bg-forge-green hover:bg-forge-green/90 text-white'}
          >
            Authorize Execution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
