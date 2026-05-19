import { useEffect, useState } from 'react';
import { FolderOpen, GitBranch } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

import { Button } from '../ui/button';

import { addRepository } from '../../lib/tauri-api/repositories';
import { resolveGitRepositoryPath } from '../../lib/tauri-api/settings';

import type { AppSettings, DiscoveredRepository } from '../../types';

interface RepositoriesCardProps {
  settings: AppSettings | null;
  onSettingsChange: (settings: AppSettings) => void;
  onRemoveRepository: (repositoryId: string) => void;
}

export function RepositoriesCard({ settings, onSettingsChange, onRemoveRepository }: RepositoriesCardProps) {
  const [repositories, setRepositories] = useState<DiscoveredRepository[]>(settings?.discoveredRepositories ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ repoId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setRepositories(settings?.discoveredRepositories ?? []);
  }, [settings]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const isTauriShell = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const handleAddRepository = async () => {
    setMessage(null);
    if (!isTauriShell()) {
      setMessage('Folder picker is only available in the Mnemonic desktop app.');
      return;
    }
    setBusy(true);
    try {
      const picked = await open({ directory: true, multiple: false, title: 'Choose a Git repository' });
      if (picked === null) return;
      const toplevel = await resolveGitRepositoryPath(picked);
      const repos = await addRepository(toplevel);
      setRepositories(repos);
      onSettingsChange({ repoRoots: repos.map((r) => r.path), discoveredRepositories: repos, hasCompletedEnvCheck: settings?.hasCompletedEnvCheck ?? false });
      setMessage(`Added — ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} in Mnemonic.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-mn-border bg-mn-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-bold text-mn-text">Repositories</h2>
            <p className="text-[11px] text-mn-muted mt-0.5">Right-click a repo to remove it.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleAddRepository()}
            disabled={busy}
            className="text-mn-blue hover:bg-mn-blue/15 border border-mn-blue/30"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Add repository…
          </Button>
        </div>

        {message && <p className="mb-3 text-[12px] text-mn-muted">{message}</p>}

        {repositories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-mn-border p-6 text-center">
            <p className="text-[13px] text-mn-muted">No repositories added yet</p>
            <p className="text-[12px] text-mn-muted mt-1">Click "Add repository…" and choose a Git repo folder.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ repoId: repo.id, x: e.clientX, y: e.clientY });
                }}
                className="rounded-lg border border-mn-border/80 bg-mn-surface/60 p-3 cursor-default select-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-3.5 h-3.5 text-mn-orange shrink-0" />
                      <h3 className="text-[13px] font-semibold text-mn-text truncate">{repo.name}</h3>
                      {repo.isDirty && <span className="text-[10px] text-mn-yellow">dirty</span>}
                    </div>
                    <p className="text-[11px] font-mono text-mn-muted mt-0.5 truncate">{repo.path}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-mn-text font-mono">{repo.currentBranch ?? 'detached'}</p>
                    <p className="text-[10px] text-mn-muted font-mono">{repo.head ?? 'no HEAD'}</p>
                  </div>
                </div>
                {repo.worktrees.length > 0 && (
                  <div className="mt-2 border-t border-mn-border/40 pt-2 space-y-0.5">
                    {repo.worktrees.map((worktree) => (
                      <div key={worktree.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${worktree.isDirty ? 'bg-mn-yellow' : 'bg-mn-cyan'}`} />
                        <span className="font-mono text-mn-text">{worktree.branch ?? 'detached'}</span>
                        <span className="text-mn-muted font-mono truncate">{worktree.path}</span>
                        <span className="ml-auto text-mn-muted font-mono shrink-0">{worktree.head?.slice(0, 7) ?? ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-mn-border bg-mn-surface shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onRemoveRepository(contextMenu.repoId);
              setContextMenu(null);
            }}
            className="w-full justify-start text-mn-red hover:bg-mn-red/10"
          >
            Remove from Mnemonic
          </Button>
        </div>
      )}
    </>
  );
}
