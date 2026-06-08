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
  onAddRepoContext: () => void;
  onRefreshRepoPathMap: () => void;
  contextBusy: boolean;
  contextError: string | null;
  modelOptions: Option[];
  thinkingOptions: Option[];
}

export function WorkspaceComposerSettingsPopover({
  provider,
  providerLabel,
  settings,
  onSettingsChange,
  onAddRepoContext,
  onRefreshRepoPathMap,
  contextBusy,
  contextError,
  modelOptions,
  thinkingOptions,
}: WorkspaceComposerSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" title="Agent settings">
          <Settings2 className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[240px] max-h-[min(480px,80vh)] overflow-y-auto">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mn-muted">{providerLabel} Agent Settings</p>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs text-mn-muted">Model</label>
            <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                {!modelOptions.some((m) => m.value === settings.selectedModel) && (
                  <SelectItem value={settings.selectedModel}>{settings.selectedModel}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-mn-muted">Passed to {providerLabel} as <span className="font-mono">--model</span>.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-mn-muted">Task mode</label>
            <Select
              value={settings.selectedTaskMode}
              onValueChange={(next) => {
                onSettingsChange({ selectedTaskMode: next });
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Act', 'Plan', 'Review', 'Fix'].map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-mn-muted">Shortcut: Shift+Tab toggles Plan mode.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-mn-muted">Thinking / effort</label>
            <Select value={settings.selectedReasoning} onValueChange={(v) => onSettingsChange({ selectedReasoning: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {thinkingOptions.map((l) => <SelectItem key={l.value} value={l.value}>{l.label} · {l.hint}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-mn-muted">
              Maps to {provider === 'codex' ? 'Codex model_reasoning_effort' : 'Claude --effort'}.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-mn-muted">Send behavior</label>
            <Select value={settings.sendBehavior} onValueChange={(v) => onSettingsChange({ sendBehavior: v as ComposerSettings['sendBehavior'] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send_now">Send now</SelectItem>
                <SelectItem value="interrupt_send">Interrupt + send</SelectItem>
                <SelectItem value="queue_send">Queue if running</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs leading-snug text-mn-muted">
              Stop the focused tab any time: header <span className="font-mono text-mn-text/70">⋯</span> menu → Interrupt terminal.
            </p>
          </div>
          <div className="border-t border-mn-border/60 pt-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-mn-muted">Repo context</p>
            <p className="mb-2 text-xs leading-snug text-mn-muted">Git paths + changed-file diffs. Mnemonic does not cap size—large repos can produce very large context.</p>
            <button type="button" disabled={contextBusy} onClick={onAddRepoContext} className="mb-1.5 w-full rounded-md border border-mn-cyan/30 bg-mn-cyan/10 px-2 py-1.5 text-xs font-semibold text-mn-cyan hover:bg-mn-cyan/15 disabled:opacity-50">
              {contextBusy ? 'Working…' : 'Add repo context to prompt'}
            </button>
            <button type="button" disabled={contextBusy} onClick={onRefreshRepoPathMap} className="flex w-full items-center justify-center gap-1 rounded-md border border-mn-border bg-white/5 px-2 py-1.5 text-xs font-semibold text-mn-muted hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${contextBusy ? 'animate-spin' : ''}`} />
              Refresh path map
            </button>
            {contextError && <p className="mt-1 text-xs text-mn-red">{contextError}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
