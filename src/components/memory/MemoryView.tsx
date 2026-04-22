import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { listAgentMemories, setAgentMemory, deleteAgentMemory } from '../../lib/tauri-api/agent-memory';
import type { AgentMemory } from '../../types/agent-memory';

export function MemoryView() {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'auto'>('all');

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
    try {
      const entry = await setAgentMemory({
        workspaceId: null,
        scope: 'global',
        key: editKey.trim(),
        value: editValue.trim(),
        origin: 'manual',
        confidence: 1,
      });
      setMemories((prev) => {
        const idx = prev.findIndex((m) => m.key === entry.key && m.workspaceId == null);
        if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
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

  const promoteAutoMemory = async (memory: AgentMemory) => {
    try {
      const entry = await setAgentMemory({
        workspaceId: memory.workspaceId,
        scope: memory.scope,
        key: memory.key,
        value: memory.value,
        origin: 'manual',
        confidence: 1,
        sourceTaskRunId: memory.sourceTaskRunId ?? null,
      });
      setMemories((prev) => prev.map((item) => (item.id === memory.id ? entry : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const filtered = memories.filter((memory) => originFilter === 'all' || memory.origin === originFilter);

  const handleDelete = async (key: string, workspaceId: string | null) => {
    try {
      await deleteAgentMemory(key, workspaceId);
      setMemories((prev) => prev.filter((m) => !(m.key === key && m.workspaceId === workspaceId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-forge-border shrink-0">
        <h1 className="text-ui-title font-bold text-forge-text tracking-tight">Agent Memory</h1>
        <p className="text-ui-label text-forge-muted mt-1.5">Persistent knowledge shared across workspaces and agent sessions</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <h2 className="text-ui-body font-bold text-forge-text mb-3">Add Global Memory</h2>
          <div className="flex gap-2 mb-2">
            <Input
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="Key (e.g. auth-pattern)"
              className="flex-1 font-mono"
            />
          </div>
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Value (e.g. JWT tokens stored in env.AUTH_SECRET)"
            rows={3}
            className="mb-2"
          />
          {error && <p className="text-ui-label text-forge-red mb-2">{error}</p>}
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || !editKey.trim() || !editValue.trim()}
            onClick={() => void handleSave()}
            className="text-forge-blue hover:bg-forge-blue/15 border border-forge-blue/20"
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </Button>
        </div>

        <div className="rounded-xl border border-forge-border bg-forge-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-ui-body font-bold text-forge-text">Stored Memories</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[11px] ${originFilter === 'all' ? 'border-forge-blue/30 text-forge-blue bg-forge-blue/10' : 'border-forge-border text-forge-muted'}`}
                onClick={() => setOriginFilter('all')}
              >
                all
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[11px] ${originFilter === 'manual' ? 'border-forge-blue/30 text-forge-blue bg-forge-blue/10' : 'border-forge-border text-forge-muted'}`}
                onClick={() => setOriginFilter('manual')}
              >
                manual
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[11px] ${originFilter === 'auto' ? 'border-forge-blue/30 text-forge-blue bg-forge-blue/10' : 'border-forge-border text-forge-muted'}`}
                onClick={() => setOriginFilter('auto')}
              >
                auto
              </button>
              <Badge variant="info">{filtered.length} entries</Badge>
            </div>
          </div>
          {loading ? (
            <p className="text-ui-label text-forge-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <p className="text-ui-body text-forge-muted">No memories stored yet</p>
              <p className="text-ui-label text-forge-muted mt-1">Add entries above to share knowledge across workspaces.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => (
                <div key={`${m.workspaceId}-${m.key}`} className="rounded-lg border border-forge-border/80 bg-forge-surface/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-ui-label font-mono font-bold text-forge-text">{m.key}</span>
                        <span className={`text-ui-caption px-1.5 py-0.5 rounded border ${m.origin === 'auto' ? 'border-forge-yellow/20 bg-forge-yellow/10 text-forge-yellow' : 'border-forge-green/20 bg-forge-green/10 text-forge-green'}`}>
                          {m.origin}
                        </span>
                        <span className="text-ui-caption px-1.5 py-0.5 rounded border border-forge-border text-forge-muted">
                          confidence {Math.round((m.confidence ?? 0) * 100)}%
                        </span>
                        {m.workspaceId && (
                          <span className="text-ui-caption px-1.5 py-0.5 rounded bg-forge-blue/15 text-forge-blue border border-forge-blue/20">{m.workspaceId}</span>
                        )}
                      </div>
                      <p className="text-ui-label text-forge-muted leading-relaxed whitespace-pre-wrap">{m.value}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void handleDelete(m.key, m.workspaceId)}
                      className="shrink-0 text-forge-muted hover:bg-forge-red/15 hover:text-forge-red"
                    >
                      ✕
                    </Button>
                  </div>
                  {m.origin === 'auto' && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => void promoteAutoMemory(m)}>
                        Promote
                      </Button>
                      <Button variant="secondary" size="xs" onClick={() => void handleDelete(m.key, m.workspaceId)}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
