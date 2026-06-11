import { useCallback, useEffect, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { getRepositorySetting, setRepositorySetting } from '../../lib/tauri-api/repository-settings';

interface RepoSettingsModalProps {
  repositoryId: string;
  repositoryName: string;
  onClose: () => void;
}

export function RepoSettingsModal({ repositoryId, repositoryName, onClose }: RepoSettingsModalProps) {
  const [setupScript, setSetupScript] = useState('');
  const [initFiles, setInitFiles] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRepositorySetting(repositoryId, 'setup_script'),
      getRepositorySetting(repositoryId, 'workspace_init_files'),
    ]).then(([script, files]) => {
      if (cancelled) return;
      setSetupScript(script ?? '');
      setInitFiles(files ?? '');
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [repositoryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = useCallback(async (key: string, value: string) => {
    try {
      await setRepositorySetting(repositoryId, key, value);
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 1500);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : String(err));
    }
  }, [repositoryId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-mn-border bg-mn-surface shadow-mn-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mn-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-mn-muted" />
            <h2 className="text-sm font-bold text-mn-text">{repositoryName}</h2>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {!loaded ? (
            <p className="text-xs text-mn-muted">Loading settings...</p>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-mn-muted uppercase tracking-wide mb-1">
                  Setup script
                </label>
                <p className="text-[10px] text-mn-dim mb-1.5">
                  Runs automatically when creating a new workspace for this repo.
                </p>
                <textarea
                  className="w-full rounded border border-mn-border bg-mn-bg/60 px-2 py-1.5 text-xs font-mono text-mn-text placeholder:text-mn-dim resize-y min-h-[56px]"
                  placeholder="npm install && npm run build"
                  rows={2}
                  value={setupScript}
                  onChange={(e) => setSetupScript(e.target.value)}
                  onBlur={() => void handleSave('setup_script', setupScript)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-mn-muted uppercase tracking-wide mb-1">
                  Files to copy from main
                </label>
                <p className="text-[10px] text-mn-dim mb-1.5">
                  One path per line. Copied from the repo root into each new worktree.
                </p>
                <textarea
                  className="w-full rounded border border-mn-border bg-mn-bg/60 px-2 py-1.5 text-xs font-mono text-mn-text placeholder:text-mn-dim resize-y min-h-[56px]"
                  placeholder={".env.local\nconfig/local.json"}
                  rows={3}
                  value={initFiles}
                  onChange={(e) => setInitFiles(e.target.value)}
                  onBlur={() => void handleSave('workspace_init_files', initFiles)}
                />
              </div>
              {saveMessage && (
                <p className="text-[10px] text-mn-cyan">{saveMessage}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
