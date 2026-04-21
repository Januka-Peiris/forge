import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import type { WorkspaceFileTreeNode } from '../../types/workspace-file-tree';
import { listWorkspaceFileTree } from '../../lib/tauri-api/workspace-file-tree';

interface WorkspaceFilesPanelProps {
  workspaceId: string;
  selectedFilePath?: string | null;
  onFileSelect?: (path: string) => void;
  showHeader?: boolean;
  className?: string;
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
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-forge-border bg-forge-card/70 ${className ?? ''}`}>
      {showHeader && (
        <div className="shrink-0 border-b border-forge-border px-3 py-2">
          <p className="text-ui-caption font-bold uppercase tracking-wider text-forge-muted">Files</p>
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
    </div>
  );
}
