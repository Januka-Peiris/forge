import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { AgentDecisionPrompt } from '../../types';
import { answerWorkspaceTerminalDecision } from '../../lib/tauri-api/terminal';

interface AgentDecisionCardProps {
  decision: AgentDecisionPrompt;
  /** Optimistic dismiss; the backend's resolved event is the authoritative clear. */
  onAnswered: () => void;
  onError: (err: unknown) => void;
}

/**
 * Inline chat card for a decision dialog the agent TUI is waiting on (plan
 * approval, permission prompt, AskUserQuestion). Picking an option presses
 * its number key in the terminal, so the user never has to leave the chat.
 */
export function AgentDecisionCard({ decision, onAnswered, onError }: AgentDecisionCardProps) {
  const [busy, setBusy] = useState(false);

  const answer = (key: string, label: string) => {
    if (busy) return;
    setBusy(true);
    answerWorkspaceTerminalDecision(decision.sessionId, key, label)
      .then(onAnswered)
      .catch((err) => {
        setBusy(false);
        onError(err);
      });
  };

  return (
    <div className="mx-2 mb-1 rounded-lg border border-mn-cyan/40 bg-mn-cyan/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-mn-cyan" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mn-cyan">
            Claude is waiting for a decision
          </p>
          <p className="mt-1 text-[13px] leading-snug text-mn-text">{decision.question}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {decision.options.map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={busy}
                onClick={() => answer(option.key, option.label)}
                className="rounded-md border border-mn-border bg-black/20 px-2.5 py-1 text-left text-[12px] text-mn-text transition-colors hover:border-mn-cyan/60 hover:bg-mn-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="mr-1.5 font-mono text-[11px] text-mn-muted">{option.key}.</span>
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-mn-muted">
            You can also answer directly in the terminal.
          </p>
        </div>
      </div>
    </div>
  );
}
