import { Bot, FolderGit2, GitBranch, Sparkles, X, Zap, BookTemplate } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRepositoryWorkspaceOptions } from '../../lib/tauri-api/workspaces';
import { listWorkspaceTemplates, createWorkspaceTemplate } from '../../lib/tauri-api/workspace-templates';
import { formatWorkspaceCreationError } from '../../lib/ui-errors';
import { defaultBranchForWorkspaceLabel, suggestForgeWorkspaceLabel } from '../../lib/workspace-name-generator';
import type { AgentType, CreateWorkspaceInput, DiscoveredRepository, RepositoryWorkspaceOptions } from '../../types';
import type { WorkspaceTemplate } from '../../types/workspace-template';

interface NewWorkspaceModalProps {
  onClose: () => void;
  onCreate: (input: CreateWorkspaceInput) => Promise<void>;
  repositories: DiscoveredRepository[];
  initialRepositoryId?: string;
}

export function NewWorkspaceModal({ onClose, onCreate, repositories, initialRepositoryId }: NewWorkspaceModalProps) {
  const firstRepo = repositories[0];
  const [name, setName] = useState(() => suggestForgeWorkspaceLabel());
  const nameRef = useRef(name);
  nameRef.current = name;
  const [repositoryId, setRepositoryId] = useState(initialRepositoryId ?? firstRepo?.id ?? '');
  const [repo, setRepo] = useState(firstRepo?.name ?? '');
  const [options, setOptions] = useState<RepositoryWorkspaceOptions | null>(null);
  const [source, setSource] = useState('');
  const [sourceMode, setSourceMode] = useState<'new_branch' | 'existing'>('new_branch');
  const [branchName, setBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState(firstRepo?.currentBranch ?? 'main');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [agent, setAgent] = useState<AgentType>('Claude Code');
  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createPR, setCreatePR] = useState(true);
  const [openCursor, setOpenCursor] = useState(false);
  const [runTests, setRunTests] = useState(true);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (!initialRepositoryId) return;
    setRepositoryId(initialRepositoryId);
  }, [initialRepositoryId]);

  useEffect(() => {
    listWorkspaceTemplates()
      .then(setTemplates)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!repositoryId) {
      setOptions(null);
      return;
    }

    setLoadingOptions(true);
    setError(null);
    getRepositoryWorkspaceOptions(repositoryId)
      .then((next) => {
        setOptions(next);
        setRepo(next.repository.name);
        const defaultSource = next.repository.worktrees[0]
          ? `worktree:${next.repository.worktrees[0].id}`
          : `branch:${next.branches[0] ?? next.repository.currentBranch ?? 'main'}`;
        setSource(defaultSource);
        setBaseBranch(next.repository.currentBranch ?? next.branches[0] ?? 'main');
        setBranchName(defaultBranchForWorkspaceLabel(nameRef.current));
      })
      .catch((err) => setError(formatWorkspaceCreationError(err)))
      .finally(() => setLoadingOptions(false));
  }, [repositoryId]);

  const shuffleWorkspaceLabel = () => {
    const next = suggestForgeWorkspaceLabel();
    setName(next);
    if (sourceMode === 'new_branch') {
      setBranchName(defaultBranchForWorkspaceLabel(next));
    }
  };

  const selectedSource = useMemo(() => {
    if (sourceMode === 'new_branch') {
      return { selectedWorktreeId: undefined, selectedBranch: undefined, branch: branchName.trim() || undefined };
    }
    if (source.startsWith('worktree:')) {
      return { selectedWorktreeId: source.replace('worktree:', ''), selectedBranch: undefined, branch: undefined };
    }
    if (source.startsWith('branch:')) {
      return { selectedWorktreeId: undefined, selectedBranch: source.replace('branch:', ''), branch: undefined };
    }
    return { selectedWorktreeId: undefined, selectedBranch: undefined, branch: undefined };
  }, [branchName, source, sourceMode]);

  const handleSubmit = async () => {
    if (sourceMode === 'new_branch' && !branchName.trim()) {
      setError('Branch name is required for a new branch workspace.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim() || suggestForgeWorkspaceLabel(),
        repo,
        baseBranch,
        agent,
        taskPrompt,
        openInCursor: openCursor,
        runTests,
        createPr: createPR,
        repositoryId: repositoryId || undefined,
        ...selectedSource,
      });
    } catch (err) {
      setError(formatWorkspaceCreationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[520px] bg-forge-surface border border-forge-border-light rounded-2xl shadow-forge-modal animate-fade-in">
        <div className="px-6 py-5 border-b border-forge-border flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-forge-text">New Branch Workspace</h2>
            <p className="text-[12px] text-forge-muted mt-0.5">Create a branch workspace in a repository and start a coding session</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8 text-forge-muted hover:text-forge-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {templates.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-2">Quick Start Templates</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setTaskPrompt(tmpl.taskPrompt);
                      setAgent(tmpl.agent as AgentType);
                    }}
                    className="shrink-0 flex flex-col gap-1 px-3 py-2 rounded-lg border border-forge-border bg-forge-card hover:border-forge-orange/40 hover:bg-forge-orange/5 text-left min-w-[120px] max-w-[160px] transition-colors"
                  >
                    <span className="text-[11px] font-semibold text-forge-text truncate">{tmpl.name}</span>
                    <span className="text-[10px] text-forge-muted px-1.5 py-0.5 rounded bg-forge-orange/10 text-forge-orange self-start">{tmpl.agent}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider">Branch Workspace Label</label>
                <button
                  type="button"
                  onClick={shuffleWorkspaceLabel}
                  className="inline-flex items-center gap-1 rounded-md border border-forge-border bg-white/5 px-2 py-1 text-[10px] font-semibold text-forge-muted hover:bg-white/10 hover:text-forge-text"
                  title="Pick another random name"
                >
                  <Sparkles className="h-3 w-3" />
                  Shuffle
                </button>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. quiet-maple (editable)"
                className="w-full px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50 transition-colors"
              />
              <p className="mt-1 text-[10px] text-forge-muted">Random two-word default (shuffle anytime). Checkouts live under <span className="font-mono text-forge-text/80">{'forge/<workspace-id>'}</span> inside the repo you pick so everything stays with that main checkout.</p>
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
                <div className="flex items-center gap-1.5"><FolderGit2 className="w-3 h-3" />Repository</div>
              </label>
              <select
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text focus:outline-none focus:border-forge-blue/50 cursor-pointer transition-colors"
              >
                {repositories.length === 0 && <option value="">No discovered repos — scan in Settings first</option>}
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>{repository.name} · {repository.path}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
                <div className="flex items-center gap-1.5"><GitBranch className="w-3 h-3" />Start From Branch / Worktree</div>
              </label>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('new_branch');
                    setBranchName(defaultBranchForWorkspaceLabel(nameRef.current));
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${sourceMode === 'new_branch' ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-orange' : 'border-forge-border bg-forge-card text-forge-text/80'}`}
                >
                  Create New Branch
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('existing')}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${sourceMode === 'existing' ? 'border-forge-orange/40 bg-forge-orange/10 text-forge-orange' : 'border-forge-border bg-forge-card text-forge-text/80'}`}
                >
                  Use Existing
                </button>
              </div>
              {sourceMode === 'new_branch' ? (
                <input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feat/my-change"
                  className="w-full px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text focus:outline-none focus:border-forge-blue/50 transition-colors"
                />
              ) : (
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={!options || loadingOptions}
                className="w-full appearance-none px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text focus:outline-none focus:border-forge-blue/50 cursor-pointer transition-colors disabled:opacity-60"
              >
                {options?.repository.worktrees.map((worktree) => (
                  <option key={worktree.id} value={`worktree:${worktree.id}`}>existing worktree · {worktree.branch ?? 'detached'} · {worktree.path}</option>
                ))}
                {options?.branches.map((branch) => (
                  <option key={branch} value={`branch:${branch}`}>branch · {branch}</option>
                ))}
              </select>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">Base Branch (for new branch workspace)</label>
              <input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text focus:outline-none focus:border-forge-blue/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
              <div className="flex items-center gap-1.5"><Bot className="w-3 h-3" />Agent</div>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Claude Code', 'Codex'].map((a) => (
                <button
                  key={a}
                  onClick={() => setAgent(a as AgentType)}
                  className={`px-3 py-2.5 rounded-lg border text-[12px] font-semibold transition-all ${
                    agent === a ? 'border-forge-orange/50 bg-forge-orange/10 text-forge-orange' : 'border-forge-border bg-forge-card text-forge-muted hover:border-forge-border-light hover:text-forge-text'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">Task Prompt</label>
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              rows={4}
              placeholder="Describe what should be implemented in this branch workspace."
              className="w-full px-3 py-2.5 bg-forge-card border border-forge-border rounded-lg text-[13px] text-forge-text placeholder:text-forge-muted/80 focus:outline-none focus:border-forge-blue/50 resize-none transition-colors leading-relaxed"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <p className="text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1">Options</p>
            {[
              { id: 'pr', label: 'Create pull request on completion', val: createPR, set: setCreatePR },
              { id: 'cursor', label: 'Open in Cursor after setup', val: openCursor, set: setOpenCursor },
              { id: 'tests', label: 'Run tests automatically', val: runTests, set: setRunTests },
            ].map(({ id, label, val, set }) => (
              <label key={id} className="flex items-center gap-3 cursor-pointer group">
                <div onClick={() => set(!val)} className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${val ? 'bg-forge-orange border-forge-orange' : 'border-forge-border group-hover:border-forge-border-light'}`}>
                  {val && <span className="text-white text-[9px] font-bold">✓</span>}
                </div>
                <span className="text-[12px] text-forge-text/80 group-hover:text-forge-text transition-colors">{label}</span>
              </label>
            ))}
          </div>

          {/* Save as template */}
          <div className="pt-1">
            {!showSaveTemplate ? (
              <button
                type="button"
                onClick={() => setShowSaveTemplate(true)}
                className="text-[11px] text-forge-muted hover:text-forge-orange transition-colors flex items-center gap-1"
              >
                <BookTemplate className="w-3 h-3" />
                Save as template
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 px-2 py-1.5 bg-forge-card border border-forge-border rounded-lg text-[12px] text-forge-text focus:outline-none focus:border-forge-orange/40"
                />
                <button
                  type="button"
                  disabled={savingTemplate || !saveTemplateName.trim()}
                  onClick={async () => {
                    if (!saveTemplateName.trim()) return;
                    setSavingTemplate(true);
                    try {
                      const tmpl = await createWorkspaceTemplate(saveTemplateName.trim(), '', taskPrompt, agent);
                      setTemplates((prev) => [tmpl, ...prev]);
                      setSaveTemplateName('');
                      setShowSaveTemplate(false);
                    } catch { /* non-fatal */ } finally {
                      setSavingTemplate(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-forge-orange hover:bg-orange-500 disabled:opacity-60 text-[11px] font-semibold text-white transition-colors"
                >
                  {savingTemplate ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveTemplate(false)}
                  className="text-[11px] text-forge-muted hover:text-forge-text"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-forge-border flex items-center justify-between gap-3">
          {error ? <p className="text-[12px] text-forge-red">{error}</p> : <span className="text-[12px] text-forge-muted">{loadingOptions ? 'Loading repo options…' : ''}</span>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-forge-muted hover:text-forge-text hover:bg-white/5 transition-colors border border-forge-border">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !repositoryId}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-forge-orange hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors shadow-lg shadow-orange-900/25"
            >
              <Zap className="w-3.5 h-3.5" />
              {submitting ? 'Creating…' : 'Create Branch Workspace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
