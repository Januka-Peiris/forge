import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import type { DiscoveredRepository } from '../../types/repository';
import type {
  RelevantRepositoriesSuggestionResult,
  RepositoryRelationship,
  RepositoryRelationshipKind,
  RepositoryRelationshipsResult,
} from '../../types/repository-relationship';
import { REPOSITORY_RELATIONSHIP_KINDS } from '../../types/repository-relationship';
import {
  createAppRepositoryRelationship,
  deleteAppRepositoryRelationship,
  listRepositoryRelationships,
  suggestRelevantRepositoriesForTask,
} from '../../lib/tauri-api/repository-relationships';

const KIND_LABELS: Record<RepositoryRelationshipKind, string> = {
  frontend_backend: 'Frontend ↔ backend',
  sdk_api: 'SDK ↔ API',
  shared_schema: 'Shared schema',
  deployment_dependency: 'Deployment dependency',
  event_flow: 'Event flow',
  depends_on: 'Depends on',
  related: 'Related',
};

export function RepositoryRelationshipsCard({
  repositories,
}: {
  repositories: DiscoveredRepository[];
}) {
  const [result, setResult] = useState<RepositoryRelationshipsResult>({ relationships: [], warnings: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fromRepoId, setFromRepoId] = useState('');
  const [toRepoId, setToRepoId] = useState('');
  const [kind, setKind] = useState<RepositoryRelationshipKind>('related');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [scopeSourceRepoId, setScopeSourceRepoId] = useState('');
  const [scopeTask, setScopeTask] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeResult, setScopeResult] = useState<RelevantRepositoriesSuggestionResult | null>(null);

  const repositoryOptions = useMemo(
    () => repositories.map((repo) => ({ value: repo.id, label: repo.name, path: repo.path })),
    [repositories],
  );

  useEffect(() => {
    if (!fromRepoId && repositoryOptions[0]) setFromRepoId(repositoryOptions[0].value);
    if (!toRepoId && repositoryOptions[1]) setToRepoId(repositoryOptions[1].value);
    if (!scopeSourceRepoId && repositoryOptions[0]) setScopeSourceRepoId(repositoryOptions[0].value);
  }, [fromRepoId, repositoryOptions, scopeSourceRepoId, toRepoId]);

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setResult(await listRepositoryRelationships());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const canCreate = repositoryOptions.length >= 2 && fromRepoId && toRepoId && fromRepoId !== toRepoId && kind;

  const handleCreate = async () => {
    if (!canCreate) {
      setMessage('Choose two different repositories before adding a relationship.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const next = await createAppRepositoryRelationship({
        fromRepoId,
        toRepoId,
        kind,
        label,
        notes,
      });
      setResult(next);
      setLabel('');
      setNotes('');
      setMessage('Repository relationship saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (relationship: RepositoryRelationship) => {
    if (!relationship.appRelationshipId) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await deleteAppRepositoryRelationship(relationship.appRelationshipId);
      setResult(next);
      setMessage(
        relationship.sources.includes('config')
          ? 'Removed app-managed relationship. The config-managed relationship remains read-only.'
          : 'Repository relationship removed.',
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestScope = async () => {
    if (!scopeSourceRepoId) {
      setMessage('Choose a source repository before previewing task scope.');
      return;
    }
    setScopeLoading(true);
    setMessage(null);
    try {
      setScopeResult(await suggestRelevantRepositoriesForTask({
        sourceRepoId: scopeSourceRepoId,
        taskPrompt: scopeTask,
      }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScopeLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-mn-border bg-mn-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-mn-text">Repository Relationships</h2>
          <p className="text-[11px] text-mn-muted mt-0.5">
            Model lightweight repo federation links without merging repo intelligence contexts.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {repositoryOptions.length < 2 ? (
        <p className="rounded border border-mn-border/70 bg-mn-bg/50 p-3 text-[12px] text-mn-muted">
          Add at least two repositories before creating relationships.
        </p>
      ) : (
        <div className="rounded border border-mn-border/70 bg-mn-bg/40 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Source repository</label>
              <Select value={fromRepoId} onValueChange={setFromRepoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {repositoryOptions.map((repo) => (
                    <SelectItem key={repo.value} value={repo.value}>{repo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Target repository</label>
              <Select value={toRepoId} onValueChange={setToRepoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {repositoryOptions.map((repo) => (
                    <SelectItem key={repo.value} value={repo.value}>{repo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Relationship kind</label>
              <Select value={kind} onValueChange={(value) => setKind(value as RepositoryRelationshipKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPOSITORY_RELATIONSHIP_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>{KIND_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Label</label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Frontend calls backend API" />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold text-mn-text">Notes</label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Consumes REST routes, shared auth assumptions, schemas, deployment ordering…"
              className="min-h-[72px] text-xs"
            />
          </div>
          <Button type="button" size="sm" className="mt-3" onClick={() => void handleCreate()} disabled={saving || !canCreate}>
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Add relationship'}
          </Button>
        </div>
      )}

      {message && <p className="mt-3 text-[12px] text-mn-muted">{message}</p>}

      {repositoryOptions.length > 0 && (
        <div className="mt-4 rounded border border-mn-border/70 bg-mn-bg/40 p-3">
          <div className="mb-3">
            <p className="text-[12px] font-semibold text-mn-text">Task scope preview</p>
            <p className="mt-0.5 text-[11px] text-mn-muted">
              Uses explicit relationships and transparent keywords only; it does not infer or save relationships with AI.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Task starts in</label>
              <Select value={scopeSourceRepoId} onValueChange={setScopeSourceRepoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {repositoryOptions.map((repo) => (
                    <SelectItem key={repo.value} value={repo.value}>{repo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-mn-text">Task prompt</label>
              <Input
                value={scopeTask}
                onChange={(event) => setScopeTask(event.target.value)}
                placeholder="e.g. Update login API and frontend auth form"
              />
            </div>
            <Button type="button" size="sm" onClick={() => void handleSuggestScope()} disabled={scopeLoading}>
              {scopeLoading ? 'Scoping…' : 'Preview scope'}
            </Button>
          </div>

          {scopeResult && (
            <div className="mt-3 space-y-2">
              {scopeResult.suggestions.length === 0 ? (
                <p className="text-[12px] text-mn-muted">No repositories suggested yet.</p>
              ) : (
                scopeResult.suggestions.map((suggestion) => (
                  <div key={suggestion.repoId} className="rounded border border-mn-border/60 bg-mn-card/50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-semibold text-mn-text">{suggestion.repoName}</p>
                      <Badge variant={suggestion.selectedByDefault ? 'success' : 'muted'}>
                        {suggestion.selectedByDefault ? 'selected' : 'optional'}
                      </Badge>
                      <Badge variant="info">{Math.round(suggestion.score)}%</Badge>
                      {suggestion.relationshipKinds.map((relationshipKind) => (
                        <Badge key={relationshipKind} variant="violet">{kindLabel(relationshipKind)}</Badge>
                      ))}
                      {suggestion.sources.map((source) => (
                        <Badge key={source} variant={source === 'config' ? 'violet' : 'orange'}>{source}</Badge>
                      ))}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-mn-muted">
                      {suggestion.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="mt-4 rounded border border-mn-yellow/25 bg-mn-yellow/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mn-yellow">Relationship warnings</p>
          <ul className="mt-2 space-y-1 text-[11px] text-mn-muted">
            {result.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {result.relationships.length === 0 ? (
          <p className="rounded border border-mn-border/70 bg-mn-bg/40 p-3 text-[12px] text-mn-muted">
            No repository relationships yet. Add one here or define `repositoryRelationships` in `.forge/config.json`.
          </p>
        ) : (
          result.relationships.map((relationship) => (
            <div key={relationship.id} className="rounded border border-mn-border/70 bg-mn-bg/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-mn-text">
                      {relationship.fromRepoName} → {relationship.toRepoName}
                    </p>
                    <Badge variant="info">{kindLabel(relationship.kind)}</Badge>
                    {relationship.sources.map((source) => (
                      <Badge key={source} variant={source === 'config' ? 'violet' : 'orange'}>{source}</Badge>
                    ))}
                    {relationship.readOnly && <Badge variant="muted">read-only</Badge>}
                  </div>
                  {relationship.label && (
                    <p className="mt-1 text-[12px] text-mn-text/80">{relationship.label}</p>
                  )}
                  {relationship.notes && (
                    <p className="mt-1 text-[11px] leading-relaxed text-mn-muted">{relationship.notes}</p>
                  )}
                  {relationship.configPaths.length > 0 && (
                    <p className="mt-1 truncate font-mono text-[10px] text-mn-muted/70">
                      {relationship.configPaths.join(', ')}
                    </p>
                  )}
                </div>
                {relationship.appRelationshipId ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title="Remove app-managed relationship"
                    disabled={saving}
                    onClick={() => void handleDelete(relationship)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function kindLabel(kind: string) {
  return KIND_LABELS[kind as RepositoryRelationshipKind] ?? kind;
}
