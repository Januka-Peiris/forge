import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Image, Link2, ListChecks, Paperclip, X, Zap } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { WorkspaceAgentContext, WorkspaceContextPreview } from '../../types';
import type { PromptTemplate } from '../../types/prompt-template';
import { getWorkspaceContextPreview, refreshWorkspaceRepoContext } from '../../lib/tauri-api/agent-context';
import { saveWorkspaceAttachment, saveWorkspacePastedImage } from '../../lib/tauri-api/workspace-file-tree';
import { formatSessionError } from '../../lib/ui-errors';
import type { AgentProviderId } from '../../lib/active-agent-providers';
import {
  AGENT_COMPOSER_DEFAULT_PX,
  AGENT_COMPOSER_HEIGHT_KEY,
  AGENT_COMPOSER_MAX_PX,
  AGENT_COMPOSER_MIN_PX,
  roughTokenEstimateFromChars,
} from './workspace-terminal-constants';
import { WorkspaceComposerSettingsPopover } from './WorkspaceComposerSettingsPopover';
import {
  CLAUDE_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  directProviderLabel,
  providerModelOptions,
  providerReasoningOptions,
} from './workspace-composer-options';

const COMPOSER_DRAFTS = new Map<string, string>();

interface ComposerAttachment {
  id: string;
  name: string;
  path: string;
  size: number;
  kind: 'image' | 'text' | 'file';
}

function compactLabel(model: string, provider?: string) {
  if (provider === 'codex') {
    return CODEX_MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model;
  }
  return CLAUDE_MODEL_OPTIONS.find((o) => o.value === model)?.label
    ?? model.replace(/^claude-/, '').replace(/-/g, ' ').replace(/\b(opus|sonnet|haiku)\b/i, (m) => m[0].toUpperCase() + m.slice(1));
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  return /\.(c|cc|cpp|cs|css|csv|go|h|hpp|html|java|js|json|jsx|kt|md|mdx|py|rb|rs|sh|sql|swift|toml|ts|tsx|txt|yaml|yml|xml)$/i
    .test(file.name);
}

function languageForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    c: 'c',
    cc: 'cpp',
    cpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    go: 'go',
    html: 'html',
    java: 'java',
    js: 'javascript',
    json: 'json',
    jsx: 'jsx',
    md: 'markdown',
    mdx: 'mdx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    sh: 'bash',
    sql: 'sql',
    swift: 'swift',
    toml: 'toml',
    ts: 'typescript',
    tsx: 'tsx',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
  };
  return map[ext] ?? '';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ComposerSettings {
  selectedModel: string;
  selectedTaskMode: string;
  selectedReasoning: string;
  promptMode: 'direct' | 'coordinator';
  coordinatorBrainProvider: string;
  coordinatorCoderProvider: string;
  coordinatorBrainProfileId: string;
  coordinatorCoderProfileId: string;
  coordinatorBrainModel: string;
  coordinatorCoderModel: string;
  coordinatorBrainReasoning: string;
  coordinatorCoderReasoning: string;
  coordinatorAutoStepOnWorkerComplete: boolean;
  coordinatorAutoStepTrigger: 'terminal_completion' | 'any_worker_status';
  coordinatorAutoStepCooldownSeconds: number;
}

interface WorkspaceComposerProps {
  workspaceId: string;
  canInterrupt: boolean;
  promptTemplateWarning: string | null;
  promptTemplates: PromptTemplate[];
  agentContext: WorkspaceAgentContext | null;
  provider: AgentProviderId;
  settings: ComposerSettings;
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  onSend: (text: string) => void;
  onTogglePlanMode: () => void;
  onInterrupt: () => void;
}

export function WorkspaceComposer({
  workspaceId,
  canInterrupt,
  promptTemplateWarning,
  promptTemplates,
  agentContext,
  provider,
  settings,
  onSettingsChange,
  onSend,
  onTogglePlanMode,
  onInterrupt,
}: WorkspaceComposerProps) {
  const draftKey = workspaceId;
  const [promptInput, setPromptInput] = useState(() => COMPOSER_DRAFTS.get(draftKey) ?? '');
  const [composerHeight, setComposerHeight] = useState<number>(() => {
    const raw = window.localStorage.getItem(AGENT_COMPOSER_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.min(AGENT_COMPOSER_MAX_PX, Math.max(AGENT_COMPOSER_MIN_PX, parsed)) : AGENT_COMPOSER_DEFAULT_PX;
  });
  const [contextPreview, setContextPreview] = useState<WorkspaceContextPreview | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeDraftKeyRef = useRef(draftKey);

  const updatePromptInput = (next: string | ((current: string) => string)) => {
    setPromptInput((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      COMPOSER_DRAFTS.set(activeDraftKeyRef.current, value);
      return value;
    });
  };

  useEffect(() => {
    if (activeDraftKeyRef.current === draftKey) return;
    COMPOSER_DRAFTS.set(activeDraftKeyRef.current, promptInput);
    activeDraftKeyRef.current = draftKey;
    setPromptInput(COMPOSER_DRAFTS.get(draftKey) ?? '');
  }, [draftKey, promptInput]);

  useEffect(() => {
    window.localStorage.setItem(AGENT_COMPOSER_HEIGHT_KEY, String(composerHeight));
  }, [composerHeight]);

  useEffect(() => {
    const onFocusComposer = () => textareaRef.current?.focus();
    window.addEventListener('mn:focus-composer', onFocusComposer);
    return () => window.removeEventListener('mn:focus-composer', onFocusComposer);
  }, []);

  useEffect(() => {
    const handleTogglePlanMode = () => onTogglePlanMode();
    window.addEventListener('mn:toggle-plan-mode', handleTogglePlanMode);
    return () => window.removeEventListener('mn:toggle-plan-mode', handleTogglePlanMode);
  }, [onTogglePlanMode]);

  const promptMeter = useMemo(() => {
    if (!promptInput.trim()) return null;
    return { sessionEstTokens: roughTokenEstimateFromChars(promptInput.length) };
  }, [promptInput]);

  const templateOptions = useMemo(() =>
    promptTemplates.map((template) => ({
      id: `template-${template.id}`,
      title: template.title,
      source: template.source,
      body: template.body,
    })),
  [promptTemplates]);

  const slashQuery = promptInput.trimStart().startsWith('/')
    ? promptInput.trimStart().slice(1).toLowerCase()
    : null;
  const slashMatches = slashQuery === null
    ? []
    : templateOptions
      .filter((option) => option.title.toLowerCase().includes(slashQuery))
      .slice(0, 7);

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
      updatePromptInput((current) => {
        if (current.includes('Mnemonic repo context:')) return current;
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
    updatePromptInput((current) => {
      if (current.includes('Mnemonic linked repository context:')) return current;
      const suffix = current.trim().length > 0 ? `\n\n${current.trim()}` : '';
      return `${agentContext.promptPreamble}${suffix}`;
    });
  };

  const handleSend = () => {
    if (!promptInput.trim()) return;
    const text = promptInput.trim();
    updatePromptInput('');
    setAttachments([]);
    onSend(text);
  };

  const applyTemplateOption = (option: (typeof templateOptions)[number]) => {
    updatePromptInput(option.body);
  };

  const appendTextToPrompt = (text: string) => {
    updatePromptInput((current) => {
      const prefix = current.trim().length > 0 ? `${current.trimEnd()}\n\n` : '';
      return `${prefix}${text}`;
    });
  };

  const saveImageFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    const path = await saveWorkspacePastedImage(workspaceId, file.name || 'pasted-image.png', bytes);
    appendTextToPrompt(`![pasted image](${path})`);
    setAttachments((current) => [
      ...current,
      {
        id: `${path}-${Date.now()}`,
        name: file.name || 'pasted-image.png',
        path,
        size: file.size,
        kind: 'image',
      },
    ]);
  };

  const handleImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return false;
    try {
      await Promise.all(imageFiles.map(saveImageFile));
    } catch (err) {
      setContextError(formatSessionError(err));
    }
    return true;
  };

  const saveAttachmentFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    const path = await saveWorkspaceAttachment(workspaceId, file.name || 'attachment', bytes);
    const kind: ComposerAttachment['kind'] = file.type.startsWith('image/')
      ? 'image'
      : isTextLikeFile(file)
        ? 'text'
        : 'file';
    setAttachments((current) => [
      ...current,
      {
        id: `${path}-${Date.now()}`,
        name: file.name || 'attachment',
        path,
        size: file.size,
        kind,
      },
    ]);

    if (kind === 'image') {
      appendTextToPrompt(`![${file.name || 'attached image'}](${path})`);
      return;
    }

    if (kind === 'text') {
      const text = await file.text();
      const truncated = text.length > 120_000
        ? `${text.slice(0, 120_000)}\n\n… truncated at 120k chars …`
        : text;
      const language = languageForFilename(file.name);
      appendTextToPrompt(`[attached: ${file.name}] (${path})\n\`\`\`${language}\n${truncated}\n\`\`\``);
      return;
    }

    appendTextToPrompt(`[attached: ${file.name || 'attachment'}] (${path})`);
  };

  const handleAttachmentFiles = async (files: File[]) => {
    if (files.length === 0) return false;
    try {
      for (const file of files) {
        await saveAttachmentFile(file);
      }
    } catch (err) {
      setContextError(formatSessionError(err));
    }
    return true;
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.some((file) => file.type.startsWith('image/'))) {
      event.preventDefault();
      void handleImageFiles(files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      event.preventDefault();
      setDragActive(false);
      void handleAttachmentFiles(files);
    }
  };

  const providerLabel = directProviderLabel(provider);
  const modelOptions = providerModelOptions(provider);
  const thinkingOptions = providerReasoningOptions(provider);

  return (
    <div className="shrink-0 border-t border-mn-border bg-mn-surface" style={{ height: `${composerHeight}px` }}>
      <div
        role="separator"
        aria-label="Resize message panel"
        onMouseDown={startComposerResize}
        className="h-1 cursor-row-resize bg-transparent hover:bg-mn-border/70 active:bg-mn-cyan/60"
      />
      <div className="flex h-[calc(100%-4px)] min-h-0 flex-col gap-2 overflow-hidden p-2">
        <div className="shrink-0 flex items-center gap-2 overflow-x-auto">

          <div className="flex shrink-0 items-center gap-1.5 rounded border border-mn-border bg-mn-bg px-2 py-1 text-xs text-mn-muted">
              {(provider === 'claude_code' || provider === 'codex') && (
                <>
                  <button
                    onClick={onTogglePlanMode}
                    title="Toggle Plan mode (Shift+Tab)"
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${settings.selectedTaskMode === 'Plan' ? 'bg-mn-blue/15 text-mn-blue font-semibold' : 'text-mn-muted/50 hover:text-mn-muted'}`}
                  >
                    <ListChecks className="h-3 w-3" />
                    <span>Plan</span>
                  </button>
                  <div className="h-3.5 w-px bg-mn-border/50" />
                </>
              )}
              <Select value={settings.selectedModel} onValueChange={(v) => onSettingsChange({ selectedModel: v })}>
                <SelectTrigger compact title={`${providerLabel} model`} className="text-mn-cyan font-semibold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>{compactLabel(model.value, provider)}</SelectItem>
                  ))}
                  {!modelOptions.some((m) => m.value === settings.selectedModel) && (
                    <SelectItem value={settings.selectedModel}>{compactLabel(settings.selectedModel, provider)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <div className="h-3.5 w-px bg-mn-border/50" />
              <div className="flex items-center gap-0.5">
                {thinkingOptions.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => onSettingsChange({ selectedReasoning: level.value })}
                    title={level.hint ?? level.label}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      settings.selectedReasoning === level.value
                        ? 'bg-mn-violet/20 text-mn-violet font-semibold'
                        : 'text-mn-muted/50 hover:text-mn-muted hover:bg-white/5'
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
              {promptMeter && (
                <>
                  <span>·</span>
                  <span className="text-mn-dim">{promptMeter.sessionEstTokens.toLocaleString()} tok</span>
                </>
              )}
              {contextPreview && (
                <>
                  <span>·</span>
                  <span className={contextPreview.status === 'fresh' ? 'text-mn-cyan' : 'text-mn-yellow'}>
                    repo {contextPreview.status}
                  </span>
                </>
              )}
            </div>

          <WorkspaceComposerSettingsPopover
            provider={provider}
            providerLabel={providerLabel}
            settings={settings}
            onSettingsChange={onSettingsChange}
            onAddRepoContext={() => void addRepoContextToPrompt()}
            onRefreshRepoPathMap={() => void refreshRepoPathMap()}
            contextBusy={contextBusy}
            contextError={contextError}
            modelOptions={modelOptions}
            thinkingOptions={thinkingOptions}
          />

          {!!agentContext?.linkedWorktrees.length && (
            <button onClick={injectLinkedContext} className="max-w-[220px] truncate rounded-md border border-mn-blue/25 bg-mn-blue/10 px-2 py-1 text-xs font-semibold text-mn-blue hover:bg-mn-blue/15" title={agentContext.linkedWorktrees.map((item) => item.path).join('\n')}>
              <Link2 className="inline h-3 w-3" /> Insert linked context ({agentContext.linkedWorktrees.length})
            </button>
          )}
          {contextPreview && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex shrink-0 items-center gap-1 rounded border border-mn-border/50 bg-mn-bg px-2 py-1 text-xs text-mn-muted hover:bg-white/5">
                  <span className={contextPreview.status === 'fresh' ? 'text-mn-cyan' : 'text-mn-yellow'}>@</span>
                  {contextPreview.items.filter((i) => i.included).length} files · {contextPreview.status}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-w-sm">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold uppercase tracking-widest text-mn-text">Repo context</span>
                  <span className={`rounded-full border px-1.5 py-0.5 ${contextPreview.status === 'fresh' ? 'border-mn-cyan/25 bg-mn-cyan/10 text-mn-cyan' : 'border-mn-yellow/25 bg-mn-yellow/10 text-mn-yellow'}`}>
                    {contextPreview.status}
                  </span>
                  <span className="text-mn-muted">{contextPreview.defaultBranch}@{contextPreview.commitHash.slice(0, 8)}</span>
                  <span className="text-mn-muted">
                    {contextPreview.maxChars === 0
                      ? <>{contextPreview.approxChars.toLocaleString()} chars · ~{roughTokenEstimateFromChars(contextPreview.approxChars).toLocaleString()} tok</>
                      : <>{contextPreview.approxChars.toLocaleString()} / {contextPreview.maxChars.toLocaleString()} chars</>
                    }
                  </span>
                  {contextPreview.trimmed && <span className="text-mn-yellow">trimmed</span>}
                </div>
                {contextPreview.warning && <div className="mb-1.5 text-xs text-mn-yellow">{contextPreview.warning}</div>}
                <div className="flex flex-wrap gap-1">
                  {contextPreview.items.slice(0, 18).map((item, index) => (
                    <span
                      key={`${item.kind}-${item.path ?? item.label}-${index}`}
                      title={`${item.path ?? item.label} · ${item.chars.toLocaleString()} chars${item.trimmed ? ' · trimmed' : ''}`}
                      className={`max-w-[220px] truncate rounded border px-1.5 py-0.5 text-xs ${item.included ? 'border-mn-blue/20 bg-mn-blue/10 text-mn-blue' : 'border-mn-border bg-white/5 text-mn-muted line-through'}`}
                    >
                      {item.label}{item.trimmed ? ' …' : ''}
                    </span>
                  ))}
                  {contextPreview.items.length > 18 && (
                    <span className="rounded border border-mn-border bg-white/5 px-1.5 py-0.5 text-xs">+{contextPreview.items.length - 18} more</span>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {promptTemplateWarning && (
            <span className="text-xs text-mn-yellow">{promptTemplateWarning}</span>
          )}
          {templateOptions.length > 0 && (
            <span className="text-xs text-mn-muted">Type <span className="font-mono text-mn-text/80">/</span> for prompt templates</span>
          )}
        </div>

        {slashMatches.length > 0 && (
          <div className="shrink-0 rounded-lg border border-mn-border bg-mn-card/95 p-1 shadow-xl">
            <div className="mb-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-mn-muted">
              Prompt templates
            </div>
            <div className="grid gap-1">
              {slashMatches.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyTemplateOption(option)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-mn-text">{option.title}</span>
                    <span className="block truncate text-[10px] text-mn-muted">{option.source}</span>
                  </span>
                  <span className="shrink-0 rounded border border-mn-border/70 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-mn-muted">
                    /{option.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-2">
          <div className="relative flex min-h-0 w-0 flex-1">
            {dragActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-chat border-2 border-dashed border-mn-cyan/60 bg-mn-cyan/10 text-sm font-semibold text-mn-cyan shadow-inner">
                <Paperclip className="mr-2 h-4 w-4" /> Drop files here
              </div>
            )}
            <textarea
              ref={textareaRef}
              data-mn-composer="true"
              value={promptInput}
              onChange={(e) => updatePromptInput(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragEnter={(event) => {
                if (Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) {
                  setDragActive(true);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragActive(false);
                }
              }}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')) e.preventDefault();
              }}
              rows={5}
              placeholder="Send instruction to agent (Enter to send, Shift+Enter for newline)…"
              className="h-full min-h-0 w-full resize-none overflow-y-auto rounded-chat border border-mn-border bg-mn-bg px-3 py-2 text-sm leading-relaxed text-mn-text placeholder:text-mn-muted focus:border-mn-cyan/40 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.currentTarget.blur(); return; }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onTogglePlanMode(); return; }
                if (e.key !== 'Enter' || e.shiftKey) return;
                if ('isComposing' in e.nativeEvent && e.nativeEvent.isComposing) return;
                e.preventDefault();
                handleSend();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {canInterrupt && (
              <button
                type="button"
                onClick={onInterrupt}
                className="rounded-btn border border-mn-yellow/30 bg-mn-yellow/10 px-3 py-2 text-xs font-semibold text-mn-yellow hover:bg-mn-yellow/20"
                title="Interrupt the running agent turn"
              >
                Interrupt
              </button>
            )}
            <button
              disabled={!promptInput.trim()}
              onClick={handleSend}
              className="rounded-btn border border-mn-cyan/30 bg-mn-cyan/5 px-3 py-2 text-sm font-semibold text-mn-cyan/80 hover:bg-mn-cyan/10 disabled:opacity-50"
              title="Send now (same as Enter)"
            >
              <Zap className="inline h-3.5 w-3.5" /> Send
            </button>
          </div>
        </div>
        {attachments.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {attachments.map((attachment) => {
              const Icon = attachment.kind === 'image' ? Image : attachment.kind === 'text' ? FileText : Paperclip;
              return (
                <span
                  key={attachment.id}
                  className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-mn-border bg-mn-bg px-2 py-1 text-[11px] text-mn-muted"
                  title={attachment.path}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                  <span className="shrink-0 text-mn-dim">{formatBytes(attachment.size)}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    className="rounded-full p-0.5 hover:bg-white/10 hover:text-mn-text"
                    title="Remove chip (does not delete saved file or prompt text)"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
