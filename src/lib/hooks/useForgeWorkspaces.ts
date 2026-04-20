import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  attachWorkspaceLinkedWorktree,
  createChildWorkspace,
  createWorkspace,
  deleteWorkspace,
  detachWorkspaceLinkedWorktree,
  listWorkspaceLinkedWorktrees,
  openInCursor,
  openWorktreeInCursor,
} from '../tauri-api/workspaces';
import { createWorkspacePr } from '../tauri-api/pr-draft';
import { listActivity } from '../tauri-api/activity';
import { formatCursorOpenError } from '../ui-errors';
import { forgeLog, forgeWarn } from '../forge-log';
import { perfMark, perfMeasure } from '../perf';
import { sanitizeWorkspaceForDisplay, sanitizeWorkspacesForDisplay } from '../workspace-display';
import type { ActivityItem, CreateWorkspaceInput, Workspace } from '../../types';

const SELECTED_WORKSPACE_KEY = 'forge:selected-workspace-id';
const ARCHIVED_WORKSPACES_KEY = 'forge:archived-workspace-ids';

function readArchivedWorkspaceIds(): string[] {
  const raw = window.localStorage.getItem(ARCHIVED_WORKSPACES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface UseForgeWorkspacesInput {
  onActivityItems: (items: ActivityItem[]) => void;
  onError: (message: string | null) => void;
  onViewWorkspaces: () => void;
}

export function useForgeWorkspaces({ onActivityItems, onError, onViewWorkspaces }: UseForgeWorkspacesInput) {
  const [selectedId, setSelectedId] = useState<string | null>(() => window.localStorage.getItem(SELECTED_WORKSPACE_KEY));
  const [archivedWorkspaceIds, setArchivedWorkspaceIds] = useState<string[]>(readArchivedWorkspaceIds);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [displayedWorkspaces, setDisplayedWorkspaces] = useState<Workspace[]>([]);
  const [linkedWorktreesByWorkspaceId, setLinkedWorktreesByWorkspaceId] = useState<Record<string, { worktreeId: string; repoId: string; repoName: string; path: string; branch?: string; head?: string }[]>>({});
  const workspaceSwitchMarkRef = useRef<string | null>(null);

  const selected = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedId) ?? null,
    [selectedId, workspaces],
  );

  const replaceWorkspaces = useCallback((nextWorkspaces: Workspace[]) => {
    const sanitized = sanitizeWorkspacesForDisplay(nextWorkspaces);
    setWorkspaces(sanitized);
    setSelectedId((current) => {
      const persisted = window.localStorage.getItem(SELECTED_WORKSPACE_KEY);
      const preferred = current ?? persisted;
      if (preferred && sanitized.some((workspace) => workspace.id === preferred)) return preferred;
      return sanitized[0]?.id ?? null;
    });
    return sanitized;
  }, []);

  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(SELECTED_WORKSPACE_KEY, selectedId);
    } else {
      window.localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    }
  }, [selectedId]);

  useEffect(() => {
    window.localStorage.setItem(ARCHIVED_WORKSPACES_KEY, JSON.stringify(archivedWorkspaceIds));
  }, [archivedWorkspaceIds]);

  useEffect(() => {
    if (!selectedId) return;
    if (workspaceSwitchMarkRef.current) {
      perfMeasure('workspace:switch', workspaceSwitchMarkRef.current);
    }
    const mark = `forge:workspace-switch:${selectedId}:${Date.now()}`;
    workspaceSwitchMarkRef.current = mark;
    perfMark(mark);
  }, [selectedId]);

  const openWorkspaceInCursor = useCallback(async (workspaceId?: string) => {
    const targetId = workspaceId ?? selectedId;
    if (!targetId) return;
    try {
      await openInCursor(targetId);
    } catch (err) {
      window.alert(formatCursorOpenError(err));
    }
  }, [selectedId]);

  const createWorkspaceFromInput = useCallback(async (input: CreateWorkspaceInput, parentWorkspaceId: string | null) => {
    const workspace = parentWorkspaceId
      ? await createChildWorkspace({
          parentWorkspaceId,
          name: input.name,
          branch: input.branch,
          agent: input.agent,
          taskPrompt: input.taskPrompt,
          openInCursor: input.openInCursor,
          runTests: input.runTests,
          createPr: input.createPr,
        })
      : await createWorkspace(input);
    const displayWorkspace = sanitizeWorkspaceForDisplay(workspace);
    setWorkspaces((current) => [displayWorkspace, ...current]);
    setSelectedId(displayWorkspace.id);
    onViewWorkspaces();
    listActivity().then(onActivityItems).catch(() => undefined);
    if (input.openInCursor) await openWorkspaceInCursor(workspace.id);
    return displayWorkspace;
  }, [onActivityItems, onViewWorkspaces, openWorkspaceInCursor]);

  const archiveWorkspace = useCallback((workspaceId = selectedId) => {
    if (!workspaceId) return;
    setArchivedWorkspaceIds((current) => (
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    ));
  }, [selectedId]);

  const deleteWorkspaceRecord = useCallback(async (workspaceId: string) => {
    const candidate = workspaces.find((workspace) => workspace.id === workspaceId);
    const label = candidate?.name ?? workspaceId;
    if (!window.confirm([
      `Forget workspace "${label}" from Forge?`,
      '',
      'This removes only the Forge workspace record from the app.',
      'It will not delete the branch, Git worktree, checkout folder, or files on disk.',
      'Prefer Archive if you may want to reopen it from Forge later.',
    ].join('\n'))) return;
    forgeLog('deleteWorkspace', 'user confirmed; invoking delete_workspace', { workspaceId, label });
    onError(null);
    try {
      await deleteWorkspace(workspaceId);
      forgeLog('deleteWorkspace', 'invoke returned ok', { workspaceId });
      setWorkspaces((current) => {
        const next = current.filter((workspace) => workspace.id !== workspaceId);
        setSelectedId((previous) => previous === workspaceId ? next[0]?.id ?? null : previous);
        return next;
      });
      setArchivedWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      setLinkedWorktreesByWorkspaceId((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });
      onActivityItems(await listActivity());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      forgeWarn('deleteWorkspace', 'invoke failed', { workspaceId, err, message });
      onError(message);
      window.alert(`Failed to delete workspace: ${message}`);
    }
  }, [onActivityItems, onError, workspaces]);

  const loadLinkedWorktrees = useCallback(async (workspaceId: string) => {
    const linked = await listWorkspaceLinkedWorktrees(workspaceId);
    setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [workspaceId]: linked }));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadLinkedWorktrees(selectedId);
  }, [loadLinkedWorktrees, selectedId]);

  const attachLinkedWorktree = useCallback(async (worktreeId: string) => {
    if (!selectedId) return;
    try {
      const linked = await attachWorkspaceLinkedWorktree(selectedId, worktreeId);
      setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [selectedId]: linked }));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [onError, selectedId]);

  const detachLinkedWorktree = useCallback(async (worktreeId: string) => {
    if (!selectedId) return;
    try {
      const linked = await detachWorkspaceLinkedWorktree(selectedId, worktreeId);
      setLinkedWorktreesByWorkspaceId((current) => ({ ...current, [selectedId]: linked }));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [onError, selectedId]);

  const openLinkedWorktree = useCallback((path: string) => {
    void openWorktreeInCursor(path).catch((err) => window.alert(formatCursorOpenError(err)));
  }, []);

  const markPrCreated = useCallback(async (workspaceId: string) => {
    const result = await createWorkspacePr(workspaceId);
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === workspaceId ? { ...workspace, prStatus: 'Open', prNumber: result.prNumber } : workspace
    )));
    return result;
  }, []);

  return {
    archivedWorkspaceIds,
    archiveWorkspace,
    attachLinkedWorktree,
    createWorkspaceFromInput,
    deleteWorkspaceRecord,
    detachLinkedWorktree,
    displayedWorkspaces,
    linkedWorktreesByWorkspaceId,
    markPrCreated,
    openLinkedWorktree,
    openWorkspaceInCursor,
    replaceWorkspaces,
    selected,
    selectedId,
    setDisplayedWorkspaces,
    setSelectedId,
    workspaces,
  };
}
