import { RefreshCw, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import type { ComposerSettings } from './WorkspaceComposer';

interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface WorkspaceComposerSettingsPopoverProps {
  provider: string;
  providerLabel: string;
  settings: ComposerSettings;
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  onApplyPreset: (preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => void;
  onAddRepoContext: () => void;
  onRefreshRepoPathMap: () => void;
  contextBusy: boolean;
  contextError: string | null;
  modelOptions: Option[];
  thinkingOptions: Option[];
  claudeAgentOptions: Option[];
}

export function WorkspaceComposerSettingsPopover({
  provider,
  providerLabel,
  settings,
  onSettingsChange,
  onApplyPreset,
  onAddRepoContext,
  onRefreshRepoPathMap,
  contextBusy,
  contextError,
  modelOptions,
  thinkingOptions,
  claudeAgentOptions,
}: WorkspaceComposerSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" title="Agent settings">
          <Settings2 className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[240px] max-h-[min(480px,80vh)] overflow-y-auto">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forge-muted">{providerLabel} Agent Settings</p>
        <div className="space-y-2">
          {provider === 'claude_code' && (
            <div>
              <label className="mb-1 block text-xs text-forge-muted">Claude agent</label>
              <Select value={settings.selectedClaudeAgent} onValueChange={(v) => onSettingsChange({ selectedClaudeAgent: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {claudeAgentOptions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label} · {a.hint}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-forge-muted">Model</label>
            <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                {!modelOptions.some((m) => m.value === settings.selectedModel) && (
                  <SelectItem value={settings.selectedModel}>{settings.selectedModel}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-forge-muted">Passed to {providerLabel} as <span className="font-mono">--model</span>.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-forge-muted">Task mode</label>
            <Select
              value={settings.selectedTaskMode}
              onValueChange={(next) => {
                const patch: Partial<ComposerSettings> = { selectedTaskMode: next };
                if (provider === 'claude_code') {
                  if (next === 'Plan') patch.selectedClaudeAgent = 'Plan';
                  if (next === 'Review') patch.selectedClaudeAgent = 'superpowers:code-reviewer';
                  if (next === 'Act' && settings.selectedClaudeAgent === 'Plan') patch.selectedClaudeAgent = 'general-purpose';
                }
                onSettingsChange(patch);
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Act', 'Plan', 'Review', 'Fix'].map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-forge-muted">Shortcut: Shift+Tab toggles Plan mode.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-forge-muted">Thinking / effort</label>
            <Select value={settings.selectedReasoning} onValueChange={(v) => onSettingsChange({ selectedReasoning: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {thinkingOptions.map((l) => <SelectItem key={l.value} value={l.value}>{l.label} · {l.hint}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-forge-muted">
              Maps to {provider === 'codex' ? 'Codex model_reasoning_effort' : provider === 'kimi_code' ? 'Kimi --thinking / --no-thinking' : 'Claude --effort'}.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-forge-muted">Send behavior</label>
            <Select value={settings.sendBehavior} onValueChange={(v) => onSettingsChange({ sendBehavior: v as ComposerSettings['sendBehavior'] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send_now">Send now</SelectItem>
                <SelectItem value="interrupt_send">Interrupt + send</SelectItem>
                <SelectItem value="queue_send">Queue if running</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs leading-snug text-forge-muted">
              Stop the focused tab any time: header <span className="font-mono text-forge-text/70">⋯</span> menu → Interrupt terminal.
            </p>
          </div>
          <div className="border-t border-forge-border/60 pt-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-forge-muted">Workflow presets</p>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => onApplyPreset('plan-act', 'Create a concise implementation plan for this workspace. Do not edit files yet.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Plan → Act</button>
              <button type="button" onClick={() => onApplyPreset('plan-codex-review', 'Plan the implementation. After the plan is accepted, Forge will route implementation/review follow-up.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Plan → Codex → Review</button>
              <button type="button" onClick={() => onApplyPreset('implement-review-pr', 'Implement the requested change, then summarize changed files, tests, and PR readiness.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Implement → Review → PR</button>
            </div>
          </div>
          <div className="border-t border-forge-border/60 pt-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-forge-muted">Repo context</p>
            <p className="mb-2 text-xs leading-snug text-forge-muted">Git paths + changed-file diffs. Forge does not cap size—large repos can produce very large context.</p>
            <button type="button" disabled={contextBusy} onClick={onAddRepoContext} className="mb-1.5 w-full rounded-md border border-forge-green/30 bg-forge-green/10 px-2 py-1.5 text-xs font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50">
              {contextBusy ? 'Working…' : 'Add repo context to prompt'}
            </button>
            <button type="button" disabled={contextBusy} onClick={onRefreshRepoPathMap} className="flex w-full items-center justify-center gap-1 rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${contextBusy ? 'animate-spin' : ''}`} />
              Refresh path map
            </button>
            {contextError && <p className="mt-1 text-xs text-forge-red">{contextError}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
