import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { deleteAgentMemory, listAgentMemories, setAgentMemory } from '../../lib/tauri-api/agent-memory';
import type { AgentMemory } from '../../types/agent-memory';

type MemoryFilter = 'all' | 'manual' | 'auto' | 'candidate';

function scopeLabel(memory: AgentMemory): string {
  return memory.workspaceId ? `workspace · ${memory.workspaceId}` : 'global';
}

function kindForMemory(memory: AgentMemory): MemoryFilter {
  if (memory.status === 'candidate') return 'candidate';
  if (memory.origin === 'manual') return 'manual';
  return 'auto';
}

function toneForMemory(memory: AgentMemory): string {
  if (memory.status === 'candidate') return 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow';
  if (memory.origin === 'manual') return 'border-forge-green/20 bg-forge-green/10 text-forge-green';
  return 'border-forge-blue/20 bg-forge-blue/10 text-forge-blue';
}

function titleForFilter(filter: MemoryFilter): string {
  if (filter === 'manual') return 'Manual memories';
  if (filter === 'auto') return 'Auto memories';
  if (filter === 'candidate') return 'Candidate memories';
  return 'All memories';
}

export function MemoryView() {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<MemoryFilter>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMemories(await listAgentMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    if (!editKey.trim() || !editValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const entry = await setAgentMemory({
        workspaceId: null,
        scope: 'global',
        key: editKey.trim(),
        value: editValue.trim(),
        origin: 'manual',
        status: 'active',
        confidence: 1,
        sourceLabel: 'Manual entry',
        sourceDetail: 'Created from the Memory view.',
      });
      setMemories((prev) => {
        const idx = prev.findIndex((m) => m.key === entry.key && m.workspaceId == null);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [entry, ...prev];
      });
      setEditKey('');
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateMemory = async (memory: AgentMemory, overrides: Partial<AgentMemory>) => {
    const entry = await setAgentMemory({
      workspaceId: overrides.workspaceId ?? memory.workspaceId,
      scope: overrides.scope ?? memory.scope,
      key: overrides.key ?? memory.key,
      value: overrides.value ?? memory.value,
      origin: overrides.origin ?? memory.origin,
      status: overrides.status ?? memory.status,
      confidence: overrides.confidence ?? memory.confidence,
      sourceTaskRunId: overrides.sourceTaskRunId ?? memory.sourceTaskRunId ?? null,
      sourceLabel: overrides.sourceLabel ?? memory.sourceLabel ?? null,
      sourceDetail: overrides.sourceDetail ?? memory.sourceDetail ?? null,
      lastUsedAt: overrides.lastUsedAt ?? memory.lastUsedAt ?? null,
    });
    setMemories((prev) => {
      const next = prev.filter((item) => !(item.key === entry.key && item.workspaceId === entry.workspaceId));
      return [entry, ...next];
    });
  };

  const promoteCandidate = async (memory: AgentMemory) => {
    try {
      await updateMemory(memory, {
        origin: 'manual',
        status: 'active',
        confidence: 1,
        sourceLabel: memory.sourceLabel ?? 'Promoted candidate',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const dismissCandidate = async (memory: AgentMemory) => {
    try {
      await updateMemory(memory, {
        status: 'dismissed',
      });
      setMemories((prev) => prev.filter((item) => item.id !== memory.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (memory: AgentMemory) => {
    try {
      await deleteAgentMemory(memory.key, memory.workspaceId);
      setMemories((prev) => prev.filter((item) => !(item.key === memory.key && item.workspaceId === memory.workspaceId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const visibleMemories = useMemo(
    () => memories.filter((memory) => filter === 'all' || kindForMemory(memory) === filter),
    [filter, memories],
  );
  const candidateCount = memories.filter((memory) => memory.status === 'candidate').length;
  const manualCount = memories.filter((memory) => kindForMemory(memory) === 'manual').length;
  const autoCount = memories.filter((memory) => kindForMemory(memory) === 'auto').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-forge-border px-6 pb-4 pt-6">
        <h1 className="text-ui-title font-bold tracking-tight text-forge-text">Agent Memory</h1>
        <p className="mt-1.5 text-ui-label text-forge-muted">
          Persistent project context with clear provenance, scope, and candidate promotion flow.
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-forge-border bg-forge-card p-4 lg:col-span-2">
            <h2 className="mb-3 text-ui-body font-bold text-forge-text">Add Global Memory</h2>
            <div className="mb-2 flex gap-2">
              <Input
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                placeholder="Key (e.g. release-rules)"
                className="flex-1 font-mono"
              />
            </div>
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Value (e.g. Ship only after smoke checks and PR comments are clear.)"
              rows={3}
              className="mb-2"
            />
            {error && <p className="mb-2 text-ui-label text-forge-red">{error}</p>}
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || !editKey.trim() || !editValue.trim()}
              onClick={() => void handleSave()}
              className="border border-forge-blue/20 text-forge-blue hover:bg-forge-blue/15"
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </Button>
          </div>

          <div className="rounded-xl border border-forge-border bg-forge-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Candidate queue</p>
            <p className="mt-2 text-3xl font-semibold text-forge-text">{candidateCount}</p>
            <p className="mt-1 text-xs text-forge-muted">Need promote or dismiss review.</p>
          </div>

          <div className="rounded-xl border border-forge-border bg-forge-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-forge-muted">Active memory split</p>
            <p className="mt-2 text-sm text-forge-text">{manualCount} manual · {autoCount} auto</p>
            <p className="mt-1 text-xs text-forge-muted">Global and workspace-scoped memories stay explicit.</p>
          </div>
        </div>

        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-ui-body font-bold text-forge-text">{titleForFilter(filter)}</h2>
              <p className="mt-0.5 text-xs text-forge-muted">
                Candidate memories are auto-captured from workspace goals, durable config rules, and repeated run patterns.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['all', 'candidate', 'manual', 'auto'] as MemoryFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    filter === option ? 'border-forge-blue/30 bg-forge-blue/10 text-forge-blue' : 'border-forge-border text-forge-muted'
                  }`}
                  onClick={() => setFilter(option)}
                >
                  {option}
                </button>
              ))}
              <Badge variant="info">{visibleMemories.length} visible</Badge>
            </div>
          </div>

          {loading ? (
            <p className="text-ui-label text-forge-muted">Loading…</p>
          ) : visibleMemories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <p className="text-ui-body text-forge-muted">No memories in this view yet</p>
              <p className="mt-1 text-ui-label text-forge-muted">Candidate memories will appear as Forge learns durable workspace context.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleMemories.map((memory) => {
                const memoryKind = kindForMemory(memory);
                return (
                  <div key={`${memory.workspaceId}-${memory.key}`} className="rounded-lg border border-forge-border/80 bg-forge-surface/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-ui-label font-mono font-bold text-forge-text">{memory.key}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-ui-caption ${toneForMemory(memory)}`}>
                            {memoryKind}
                          </span>
                          <span className="rounded border border-forge-border px-1.5 py-0.5 text-ui-caption text-forge-muted">
                            {scopeLabel(memory)}
                          </span>
                          <span className="rounded border border-forge-border px-1.5 py-0.5 text-ui-caption text-forge-muted">
                            confidence {Math.round((memory.confidence ?? 0) * 100)}%
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-ui-label leading-relaxed text-forge-muted">{memory.value}</p>
                        {(memory.sourceLabel || memory.sourceDetail || memory.sourceTaskRunId) && (
                          <div className="mt-2 space-y-0.5 text-[11px] text-forge-muted">
                            {memory.sourceLabel && <p><span className="text-forge-text/80">Why:</span> {memory.sourceLabel}</p>}
                            {memory.sourceDetail && <p><span className="text-forge-text/80">Source:</span> {memory.sourceDetail}</p>}
                            {memory.sourceTaskRunId && <p><span className="text-forge-text/80">Task run:</span> {memory.sourceTaskRunId}</p>}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void handleDelete(memory)}
                        className="shrink-0 text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                      >
                        ✕
                      </Button>
                    </div>

                    {memory.status === 'candidate' ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Button variant="secondary" size="xs" onClick={() => void promoteCandidate(memory)}>
                          Promote
                        </Button>
                        <Button variant="secondary" size="xs" onClick={() => void dismissCandidate(memory)}>
                          Dismiss
                        </Button>
                      </div>
                    ) : memory.origin === 'auto' ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Button variant="secondary" size="xs" onClick={() => void promoteCandidate(memory)}>
                          Promote to manual
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
