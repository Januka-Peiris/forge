import { Bot, FolderGit2, GitBranch, Sparkles, Zap, BookTemplate } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRepositoryWorkspaceOptions } from '../../lib/tauri-api/workspaces';
import { listWorkspaceTemplates, createWorkspaceTemplate } from '../../lib/tauri-api/workspace-templates';
import { formatWorkspaceCreationError } from '../../lib/ui-errors';
import { defaultBranchForWorkspaceLabel, suggestForgeWorkspaceLabel } from '../../lib/workspace-name-generator';
import type { AgentType, CreateWorkspaceInput, DiscoveredRepository, RepositoryWorkspaceOptions } from '../../types';
import type { WorkspaceTemplate } from '../../types/workspace-template';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../ui/dialog';

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[520px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>New Branch Workspace</DialogTitle>
          <DialogDescription>Create a branch workspace in a repository and start a coding session</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 max-h-[65vh] overflow-y-auto">
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
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={shuffleWorkspaceLabel}
                  title="Pick another random name"
                >
                  <Sparkles className="h-3 w-3" />
                  Shuffle
                </Button>
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. quiet-maple (editable)"
              />
              <p className="mt-1 text-[10px] text-forge-muted">Random two-word default (shuffle anytime). Checkouts live under <span className="font-mono text-forge-text/80">{'forge/<workspace-id>'}</span> inside the repo you pick so everything stays with that main checkout.</p>
            </div>

            {!initialRepositoryId && (
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
                  <div className="flex items-center gap-1.5"><FolderGit2 className="w-3 h-3" />Repository</div>
                </label>
                <Select value={repositoryId} onValueChange={setRepositoryId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.length === 0 && (
                      <SelectItem value="" disabled>No discovered repos — scan in Settings first</SelectItem>
                    )}
                    {repositories.map((repository) => (
                      <SelectItem key={repository.id} value={repository.id}>
                        {repository.name} · {repository.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
                <div className="flex items-center gap-1.5"><GitBranch className="w-3 h-3" />Start From Branch / Worktree</div>
              </label>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={sourceMode === 'new_branch' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSourceMode('new_branch');
                    setBranchName(defaultBranchForWorkspaceLabel(nameRef.current));
                  }}
                >
                  Create New Branch
                </Button>
                <Button
                  type="button"
                  variant={sourceMode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceMode('existing')}
                >
                  Use Existing
                </Button>
              </div>
              {sourceMode === 'new_branch' ? (
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feat/my-change"
                />
              ) : (
                <Select value={source} onValueChange={setSource} disabled={!options || loadingOptions}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch or worktree" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.repository.worktrees.map((worktree) => (
                      <SelectItem key={worktree.id} value={`worktree:${worktree.id}`}>
                        existing worktree · {worktree.branch ?? 'detached'} · {worktree.path}
                      </SelectItem>
                    ))}
                    {options?.branches.map((branch) => (
                      <SelectItem key={branch} value={`branch:${branch}`}>
                        branch · {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">Base Branch (for new branch workspace)</label>
              <Input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">
              <div className="flex items-center gap-1.5"><Bot className="w-3 h-3" />Agent</div>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Claude Code', 'Codex'] as const).map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={agent === a ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAgent(a)}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-forge-muted uppercase tracking-wider mb-1.5">Task Prompt</label>
            <Textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              rows={4}
              placeholder="Describe what should be implemented in this branch workspace."
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
                <Checkbox
                  id={id}
                  checked={val}
                  onCheckedChange={(checked) => set(!!checked)}
                />
                <span className="text-[12px] text-forge-text/80 group-hover:text-forge-text transition-colors">{label}</span>
              </label>
            ))}
          </div>

          {/* Save as template */}
          <div className="pt-1">
            {!showSaveTemplate ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowSaveTemplate(true)}
                className="text-forge-muted hover:text-forge-orange"
              >
                <BookTemplate className="w-3 h-3" />
                Save as template
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
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
                >
                  {savingTemplate ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowSaveTemplate(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <div className="flex-1">
            {error ? (
              <p className="text-[12px] text-forge-red">{error}</p>
            ) : (
              <span className="text-[12px] text-forge-muted">{loadingOptions ? 'Loading repo options…' : ''}</span>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !repositoryId}
          >
            <Zap className="w-3.5 h-3.5" />
            {submitting ? 'Creating…' : 'Create Branch Workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
