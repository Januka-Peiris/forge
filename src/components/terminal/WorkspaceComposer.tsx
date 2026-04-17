import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, RefreshCw, Settings2, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { AgentChatSession, WorkspaceAgentContext, WorkspaceContextPreview } from '../../types';
import { getWorkspaceContextPreview, refreshWorkspaceRepoContext } from '../../lib/tauri-api/agent-context';
import { formatSessionError } from '../../lib/ui-errors';
import { modelContextLabel, roughTokenEstimateFromChars } from '../../lib/agent-workbench';
import {
  AGENT_COMPOSER_DEFAULT_PX,
  AGENT_COMPOSER_HEIGHT_KEY,
  AGENT_COMPOSER_MAX_PX,
  AGENT_COMPOSER_MIN_PX,
} from './workspace-terminal-constants';

const CLAUDE_AGENT_OPTIONS = [
  { value: 'general-purpose', label: 'general-purpose', hint: 'default' },
  { value: 'Plan', label: 'Plan', hint: 'planning' },
  { value: 'Explore', label: 'Explore', hint: 'haiku' },
  { value: 'superpowers:code-reviewer', label: 'code-reviewer', hint: 'review' },
];

const CLAUDE_THINKING_OPTIONS = [
  { value: 'Default', label: 'Default', hint: 'Claude default' },
  { value: 'Low', label: 'Low', hint: 'faster' },
  { value: 'Medium', label: 'Medium', hint: 'balanced' },
  { value: 'High', label: 'High', hint: 'deeper' },
  { value: 'Extra High', label: 'Extra High', hint: 'xhigh' },
  { value: 'Max', label: 'Max', hint: 'maximum' },
];

const CLAUDE_MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-7[1m]', label: 'Opus 4.7 · 1M context' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6 · 1M context' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

function compactLabel(model: string) {
  return CLAUDE_MODEL_OPTIONS.find((o) => o.value === model)?.label
    ?? model.replace(/^claude-/, '').replace(/-/g, ' ').replace(/\b(opus|sonnet|haiku)\b/i, (m) => m[0].toUpperCase() + m.slice(1));
}

export interface ComposerSettings {
  selectedClaudeAgent: string;
  selectedModel: string;
  selectedTaskMode: string;
  selectedReasoning: string;
  sendBehavior: 'send_now' | 'interrupt_send';
}

interface WorkspaceComposerProps {
  workspaceId: string;
  focusedChatSession: AgentChatSession | null;
  busy: boolean;
  promptTemplateWarning: string | null;
  agentContext: WorkspaceAgentContext | null;
  settings: ComposerSettings;
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  onSend: (text: string) => void;
  onTogglePlanMode: () => void;
  onApplyWorkflowPreset: (preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => void;
}

export function WorkspaceComposer({
  workspaceId,
  focusedChatSession,
  busy,
  promptTemplateWarning,
  agentContext,
  settings,
  onSettingsChange,
  onSend,
  onTogglePlanMode,
  onApplyWorkflowPreset,
}: WorkspaceComposerProps) {
  const [promptInput, setPromptInput] = useState('');
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const raw = window.localStorage.getItem(AGENT_COMPOSER_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, parsed)) : AGENT_COMPOSER_DEFAULT_PX;
  });
  const [contextPreview, setContextPreview] = useState<WorkspaceContextPreview | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(AGENT_COMPOSER_HEIGHT_KEY, String(composerHeight));
  }, [composerHeight]);

  const promptMeter = useMemo(() => {
    if (!promptInput.trim()) return null;
    return { sessionEstTokens: roughTokenEstimateFromChars(promptInput.length) };
  }, [promptInput]);

  const startComposerResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const onMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      setComposerHeight(Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, startHeight + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const addRepoContextToPrompt = async () => {
    setContextBusy(true);
    setContextError(null);
    try {
      const preview = await getWorkspaceContextPreview(workspaceId);
      setContextPreview(preview);
      if (!preview.promptContext.trim()) return;
      setPromptInput((current) => {
        if (current.includes('Forge repo context:')) return current;
        const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
        return `${preview.promptContext}${suffix}`;
      });
    } catch (err) {
      setContextError(formatSessionError(err));
    } finally {
      setContextBusy(false);
    }
  };

  const refreshRepoPathMap = async () => {
    setContextBusy(true);
    setContextError(null);
    try {
      const preview = await refreshWorkspaceRepoContext(workspaceId);
      setContextPreview(preview);
    } catch (err) {
      setContextError(formatSessionError(err));
    } finally {
      setContextBusy(false);
    }
  };

  const injectLinkedContext = () => {
    if (!agentContext?.promptPreamble.trim()) return;
    setPromptInput((current) => {
      if (current.includes('Forge linked repository context:')) return current;
      const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
      return `${agentContext.promptPreamble}${suffix}`;
    });
  };

  const handleSend = () => {
    if (!promptInput.trim() || busy) return;
    const text = promptInput.trim();
    setPromptInput('');
    onSend(text);
  };

  const applyPreset = (preset: 'plan-act' | 'plan-codex-review' | 'implement-review-pr', defaultPrompt: string) => {
    setPromptInput((current) => current || defaultPrompt);
    onApplyWorkflowPreset(preset, defaultPrompt);
  };

  return (
    <div className="shrink-0 border-t border-forge-border bg-forge-surface" style={{ height: `${composerHeight}px` }}>
      <div
        role="separator"
        aria-label="Resize message panel"
        onMouseDown={startComposerResize}
        className="h-1 cursor-row-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-orange/60"
      />
      <div className="flex h-[calc(100%-4px)] min-h-0 flex-col gap-2 overflow-hidden p-2">
        <div className="shrink-0 flex items-center gap-2 overflow-x-auto">
          {focusedChatSession && (
            <div className="flex shrink-0 items-center gap-1 rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-muted">
              <span className="font-semibold text-forge-text">{settings.selectedClaudeAgent}</span>
              <span>·</span>
              <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
                <SelectTrigger compact title="Claude model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODEL_OPTIONS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>{compactLabel(model.value)}</SelectItem>
                  ))}
                  {!CLAUDE_MODEL_OPTIONS.some((m) => m.value === settings.selectedModel) && (
                    <SelectItem value={settings.selectedModel}>{compactLabel(settings.selectedModel)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <span>·</span>
              <Select
                value={settings.selectedReasoning}
                onValueChange={(v) => onSettingsChange({ selectedReasoning: v })}
              >
                <SelectTrigger
                  compact
                  title="Claude thinking / effort"
                  className={settings.selectedReasoning === 'Default' ? 'text-forge-muted' : settings.selectedReasoning === 'Max' || settings.selectedReasoning === 'Extra High' ? 'bg-forge-violet/15 text-forge-violet' : 'bg-forge-blue/10 text-forge-blue'}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUDE_THINKING_OPTIONS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>Thinking: {level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>·</span>
              <span className="text-forge-muted">{modelContextLabel(settings.selectedModel)}</span>
              {promptMeter && (
                <>
                  <span>·</span>
                  <span className="text-forge-dim">{promptMeter.sessionEstTokens.toLocaleString()} tok</span>
                </>
              )}
              {contextPreview && (
                <>
                  <span>·</span>
                  <span className={contextPreview.status === 'fresh' ? 'text-forge-green' : 'text-forge-yellow'}>
                    repo {contextPreview.status}
                  </span>
                </>
              )}
            </div>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon-sm" title="Agent settings">
                <Settings2 className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="min-w-[240px]">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forge-muted">Agent Settings</p>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-forge-muted">Claude agent</label>
                  <Select value={settings.selectedClaudeAgent} onValueChange={(v) => onSettingsChange({ selectedClaudeAgent: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLAUDE_AGENT_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label} · {a.hint}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-forge-muted">Model</label>
                  <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLAUDE_MODEL_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      {!CLAUDE_MODEL_OPTIONS.some((m) => m.value === settings.selectedModel) && (
                        <SelectItem value={settings.selectedModel}>{compactLabel(settings.selectedModel)}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-forge-muted">Passed to Claude as <span className="font-mono">--model</span>.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-forge-muted">Task mode</label>
                  <Select
                    value={settings.selectedTaskMode}
                    onValueChange={(next) => {
                      const patch: Partial<ComposerSettings> = { selectedTaskMode: next };
                      if (next === 'Plan') patch.selectedClaudeAgent = 'Plan';
                      if (next === 'Review') patch.selectedClaudeAgent = 'superpowers:code-reviewer';
                      if (next === 'Act' && settings.selectedClaudeAgent === 'Plan') patch.selectedClaudeAgent = 'general-purpose';
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
                      {CLAUDE_THINKING_OPTIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label} · {l.hint}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-forge-muted">Maps to Claude <span className="font-mono">--effort</span>: low, medium, high, xhigh, max.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-forge-muted">Send behavior</label>
                  <Select value={settings.sendBehavior} onValueChange={(v) => onSettingsChange({ sendBehavior: v as ComposerSettings['sendBehavior'] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send_now">Send now</SelectItem>
                      <SelectItem value="interrupt_send">Interrupt + send</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs leading-snug text-forge-muted">
                    Stop the focused tab any time: header <span className="font-mono text-forge-text/70">⋯</span> menu → Interrupt terminal.
                  </p>
                </div>
                <div className="border-t border-forge-border/60 pt-2">
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-forge-muted">Workflow presets</p>
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => applyPreset('plan-act', 'Create a concise implementation plan for this workspace. Do not edit files yet.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Plan → Act</button>
                    <button type="button" onClick={() => applyPreset('plan-codex-review', 'Plan the implementation. After the plan is accepted, Forge will route implementation/review follow-up.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Plan → Codex → Review</button>
                    <button type="button" onClick={() => applyPreset('implement-review-pr', 'Implement the requested change, then summarize changed files, tests, and PR readiness.')} className="rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-left text-xs font-semibold text-forge-text hover:bg-white/10">Implement → Review → PR</button>
                  </div>
                </div>
                <div className="border-t border-forge-border/60 pt-2">
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-forge-muted">Repo context</p>
                  <p className="mb-2 text-xs leading-snug text-forge-muted">Git paths + changed-file diffs. Forge does not cap size—large repos can produce very large context.</p>
                  <button type="button" disabled={contextBusy} onClick={() => void addRepoContextToPrompt()} className="mb-1.5 w-full rounded-md border border-forge-green/30 bg-forge-green/10 px-2 py-1.5 text-xs font-semibold text-forge-green hover:bg-forge-green/15 disabled:opacity-50">
                    {contextBusy ? 'Working…' : 'Add repo context to prompt'}
                  </button>
                  <button type="button" disabled={contextBusy} onClick={() => void refreshRepoPathMap()} className="flex w-full items-center justify-center gap-1 rounded-md border border-forge-border bg-white/5 px-2 py-1.5 text-xs font-semibold text-forge-muted hover:bg-white/10 disabled:opacity-50">
                    <RefreshCw className={`h-3 w-3 ${contextBusy ? 'animate-spin' : ''}`} />
                    Refresh path map
                  </button>
                  {contextError && <p className="mt-1 text-xs text-forge-red">{contextError}</p>}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {!!agentContext?.linkedWorktrees.length && (
            <button onClick={injectLinkedContext} className="max-w-[220px] truncate rounded-md border border-forge-blue/25 bg-forge-blue/10 px-2 py-1 text-xs font-semibold text-forge-blue hover:bg-forge-blue/15" title={agentContext.linkedWorktrees.map((item) => item.path).join('\n')}>
              <Link2 className="inline h-3 w-3" /> Insert linked context ({agentContext.linkedWorktrees.length})
            </button>
          )}
          {promptTemplateWarning && (
            <span className="text-xs text-forge-yellow">{promptTemplateWarning}</span>
          )}
        </div>

        {contextPreview && (
          <div className="shrink-0 rounded-lg border border-forge-border bg-forge-bg/80 p-2 text-xs text-forge-muted">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-bold uppercase tracking-widest text-forge-text">Repo context preview</span>
              <span className={`rounded-full border px-1.5 py-0.5 ${contextPreview.status === 'fresh' ? 'border-forge-green/25 bg-forge-green/10 text-forge-green' : 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow'}`}>
                {contextPreview.status}
              </span>
              <span>{contextPreview.defaultBranch}@{contextPreview.commitHash.slice(0, 8)}</span>
              <span>
                {contextPreview.maxChars === 0 ? (
                  <>{contextPreview.approxChars.toLocaleString()} chars <span className="text-forge-muted">(~{roughTokenEstimateFromChars(contextPreview.approxChars).toLocaleString()} tok est.)</span> <span className="text-forge-muted">· no Forge cap</span></>
                ) : (
                  <>{contextPreview.approxChars.toLocaleString()} / {contextPreview.maxChars.toLocaleString()} chars</>
                )}
              </span>
              {contextPreview.trimmed && <span className="text-forge-yellow">trimmed</span>}
            </div>
            {contextPreview.warning && <div className="mb-1 text-forge-yellow">{contextPreview.warning}</div>}
            <div className="flex flex-wrap gap-1">
              {contextPreview.items.slice(0, 18).map((item, index) => (
                <span
                  key={`${item.kind}-${item.path ?? item.label}-${index}`}
                  title={`${item.path ?? item.label} · ${item.chars.toLocaleString()} chars${item.trimmed ? ' · trimmed' : ''}`}
                  className={`max-w-[220px] truncate rounded border px-1.5 py-0.5 ${item.included ? 'border-forge-blue/20 bg-forge-blue/10 text-forge-blue' : 'border-forge-border bg-white/5 text-forge-muted line-through'}`}
                >
                  {item.label}{item.trimmed ? ' …' : ''}
                </span>
              ))}
              {contextPreview.items.length > 18 && (
                <span className="rounded border border-forge-border bg-white/5 px-1.5 py-0.5">+{contextPreview.items.length - 18} more</span>
              )}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-2">
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            rows={5}
            placeholder={
              settings.sendBehavior === 'interrupt_send'
                ? 'Send instruction to agent (Enter interrupts agent if needed then sends, Shift+Enter for newline)…'
                : 'Send instruction to agent (Enter to send, Shift+Enter for newline)…'
            }
            className="h-full min-h-0 w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm leading-relaxed text-forge-text placeholder:text-forge-muted focus:border-forge-orange/40 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onTogglePlanMode(); return; }
              if (e.key !== 'Enter' || e.shiftKey) return;
              if ('isComposing' in e.nativeEvent && e.nativeEvent.isComposing) return;
              e.preventDefault();
              handleSend();
            }}
          />
          <div className="flex flex-col gap-1.5">
            <button
              disabled={busy || !promptInput.trim()}
              onClick={handleSend}
              className="rounded-lg border border-forge-orange/30 bg-forge-orange/10 px-3 py-2 text-sm font-semibold text-forge-orange hover:bg-forge-orange/20 disabled:opacity-50"
              title={settings.sendBehavior === 'interrupt_send' ? 'Interrupt then send (same as Enter)' : 'Send now (same as Enter)'}
            >
              <Zap className="inline h-3.5 w-3.5" /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
