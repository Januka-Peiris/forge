import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import type { WorkspaceFileTreeNode } from '../../types/workspace-file-tree';
import {
  createWorkspaceDirectory,
  deleteWorkspacePath,
  listWorkspaceFileTree,
  renameWorkspacePath,
  writeWorkspaceFile,
} from '../../lib/tauri-api/workspace-file-tree';

interface WorkspaceFilesPanelProps {
  workspaceId: string;
  selectedFilePath?: string | null;
  onFileSelect?: (path: string) => void;
  showHeader?: boolean;
  className?: string;
}

type ContextTargetKind = 'root' | 'dir' | 'file';

interface ContextMenuState {
  x: number;
  y: number;
  kind: ContextTargetKind;
  path: string | null;
  parentPath: string | null;
}

export function WorkspaceFilesPanel({
  workspaceId,
  selectedFilePath,
  onFileSelect,
  showHeader = true,
  className,
}: WorkspaceFilesPanelProps) {
  const [rootNodes, setRootNodes] = useState<WorkspaceFileTreeNode[]>([]);
  const [childrenByDir, setChildrenByDir] = useState<Record<string, WorkspaceFileTreeNode[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [internalSelectedFilePath, setInternalSelectedFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const isLoadingRoot = useMemo(() => loadingDirs.has(''), [loadingDirs]);

  const loadDirectory = useCallback(async (path?: string) => {
    const key = path ?? '';
    setLoadingDirs((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setError(null);
    try {
      const nodes = await listWorkspaceFileTree(workspaceId, { path, depth: 1 });
      if (!path) {
        setRootNodes(nodes);
      } else {
        setChildrenByDir((current) => ({ ...current, [path]: nodes }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!path) setRootNodes([]);
    } finally {
      setLoadingDirs((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, [workspaceId]);

  useEffect(() => {
    setRootNodes([]);
    setChildrenByDir({});
    setExpandedDirs(new Set());
    setInternalSelectedFilePath(null);
    setError(null);
    void loadDirectory();
  }, [workspaceId, loadDirectory]);

  const effectiveSelectedFilePath = selectedFilePath ?? internalSelectedFilePath;

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [contextMenu]);

  const createFileInDirectory = useCallback(async (dirPath?: string) => {
    const base = dirPath ?? '';
    const entered = window.prompt(
      base
        ? `Create new file in "${base}" (relative path or filename):`
        : 'Create new file at repository root (relative path or filename):',
      '',
    );
    if (!entered) return;
    const trimmed = entered.trim().replace(/^\/+/, '');
    if (!trimmed) return;

    const targetPath = base ? `${base}/${trimmed}` : trimmed;
    try {
      await writeWorkspaceFile(workspaceId, targetPath, '');
      setError(null);
      setExpandedDirs((current) => {
        if (!base) return current;
        const next = new Set(current);
        next.add(base);
        return next;
      });
      await Promise.all([
        loadDirectory(),
        base ? loadDirectory(base) : Promise.resolve(),
      ]);
      setInternalSelectedFilePath(targetPath);
      onFileSelect?.(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadDirectory, onFileSelect, workspaceId]);

  const createFolderInDirectory = useCallback(async (dirPath?: string) => {
    const base = dirPath ?? '';
    const entered = window.prompt(
      base
        ? `Create new folder in "${base}" (relative path or folder name):`
        : 'Create new folder at repository root (relative path or folder name):',
      '',
    );
    if (!entered) return;
    const trimmed = entered.trim().replace(/^\/+/, '');
    if (!trimmed) return;
    const targetPath = base ? `${base}/${trimmed}` : trimmed;
    try {
      await createWorkspaceDirectory(workspaceId, targetPath);
      setError(null);
      await Promise.all([loadDirectory(), base ? loadDirectory(base) : Promise.resolve()]);
      setExpandedDirs((current) => {
        const next = new Set(current);
        if (base) next.add(base);
        next.add(targetPath);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadDirectory, workspaceId]);

  const renamePath = useCallback(async (path: string) => {
    const entered = window.prompt('Rename path (new relative path):', path);
    if (!entered) return;
    const target = entered.trim().replace(/^\/+/, '');
    if (!target || target === path) return;
    try {
      await renameWorkspacePath(workspaceId, path, target);
      setError(null);
      await loadDirectory();
      if (effectiveSelectedFilePath === path) {
        setInternalSelectedFilePath(target);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [effectiveSelectedFilePath, loadDirectory, workspaceId]);

  const removePath = useCallback(async (path: string) => {
    const confirmed = window.confirm(`Delete "${path}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteWorkspacePath(workspaceId, path);
      setError(null);
      await loadDirectory();
      if (effectiveSelectedFilePath === path) {
        setInternalSelectedFilePath(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [effectiveSelectedFilePath, loadDirectory, workspaceId]);

  const copyPath = useCallback(async (path: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(path);
      } else {
        window.prompt('Copy path:', path);
      }
      setError(null);
    } catch {
      window.prompt('Copy path:', path);
    }
  }, []);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

    if (!childrenByDir[path]) {
      void loadDirectory(path);
    }
  }, [childrenByDir, loadDirectory]);

  const renderNodes = (nodes: WorkspaceFileTreeNode[], depth: number) => (
    <>
      {nodes.map((node) => {
        const isDir = node.kind === 'dir';
        const expanded = expandedDirs.has(node.path);
        const childNodes = childrenByDir[node.path] ?? node.children ?? [];
        const loading = loadingDirs.has(node.path);
        const selected = effectiveSelectedFilePath === node.path;

        return (
          <div key={node.path}>
            <button
              type="button"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const segments = node.path.split('/');
                segments.pop();
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  kind: isDir ? 'dir' : 'file',
                  path: node.path,
                  parentPath: isDir ? node.path : segments.join('/'),
                });
              }}
              onClick={() => {
                if (isDir) {
                  toggleDir(node.path);
                } else {
                  setInternalSelectedFilePath(node.path);
                  onFileSelect?.(node.path);
                }
              }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${selected ? 'bg-forge-green/15 text-forge-green' : 'text-forge-text hover:bg-forge-surface-overlay'}`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              title={node.path}
            >
              {isDir ? (
                node.hasChildren ? (
                  expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-forge-muted" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-forge-muted" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}

              {isDir
                ? (expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-forge-blue" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-forge-blue" />)
                : <FileText className="h-3.5 w-3.5 shrink-0 text-forge-muted" />}

              <span className="truncate">{node.name}</span>
            </button>

            {isDir && expanded && (
              <div>
                {loading && (
                  <p className="px-2 py-1 text-[11px] text-forge-muted" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    Loading…
                  </p>
                )}
                {!loading && childNodes.length > 0 && renderNodes(childNodes, depth + 1)}
                {!loading && childNodes.length === 0 && node.hasChildren && (
                  <p className="px-2 py-1 text-[11px] text-forge-muted" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    No visible files.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70 ${className ?? ''}`}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          kind: 'root',
          path: null,
          parentPath: null,
        });
      }}
    >
      {showHeader && (
        <div className="shrink-0 border-b border-forge-border px-3 py-2">
          <p className="text-ui-caption font-bold uppercase tracking-wider text-forge-muted">Files</p>
          <p className="mt-0.5 text-[10px] text-forge-muted/80">Right-click a folder to create a file</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error && (
          <p className="rounded border border-forge-red/30 bg-forge-red/10 px-2 py-1.5 text-xs text-forge-red">
            {error}
          </p>
        )}
        {!error && isLoadingRoot && <p className="px-2 py-1 text-xs text-forge-muted">Loading files…</p>}
        {!error && !isLoadingRoot && rootNodes.length === 0 && (
          <p className="px-2 py-1 text-xs text-forge-muted">No visible files.</p>
        )}
        {!error && rootNodes.length > 0 && renderNodes(rootNodes, 0)}
      </div>
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[220px] rounded-panel border border-forge-border bg-forge-surface p-1 shadow-forge-panel"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <ContextAction onClick={() => {
            setContextMenu(null);
            void createFileInDirectory(contextMenu.parentPath ?? undefined);
          }}
          >
            New file…
          </ContextAction>
          <ContextAction onClick={() => {
            setContextMenu(null);
            void createFolderInDirectory(contextMenu.parentPath ?? undefined);
          }}
          >
            New folder…
          </ContextAction>
          {contextMenu.path && (
            <>
              <ContextAction onClick={() => {
                setContextMenu(null);
                void copyPath(contextMenu.path as string);
              }}
              >
                Copy relative path
              </ContextAction>
              <ContextAction onClick={() => {
                setContextMenu(null);
                void renamePath(contextMenu.path as string);
              }}
              >
                Rename…
              </ContextAction>
              <ContextAction
                destructive
                onClick={() => {
                  setContextMenu(null);
                  void removePath(contextMenu.path as string);
                }}
              >
                Delete…
              </ContextAction>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ContextAction({
  children,
  onClick,
  destructive = false,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center rounded-btn px-2.5 py-1.5 text-left text-xs ${
        destructive
          ? 'text-forge-red hover:bg-forge-red/15'
          : 'text-forge-text hover:bg-forge-surface-overlay'
      }`}
    >
      {children}
    </button>
  );
}
