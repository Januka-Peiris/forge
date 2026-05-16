import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TileContent, TileId, TileLayoutState, TileLeaf, TileNode, TileSplit } from '../../types/tile-layout';

const STORAGE_PREFIX = 'forge:tile-layout:';
const MIN_TILE_PERCENT = 15;

function newTileId(): TileId {
  return `tile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultLeaf(content: TileContent = { kind: 'empty' }): TileLeaf {
  return {
    type: 'leaf',
    id: newTileId(),
    content,
  };
}

function defaultState(content?: TileContent): TileLayoutState {
  const leaf = defaultLeaf(content);
  return {
    root: leaf,
    focusedTileId: leaf.id,
  };
}

function mapNode(node: TileNode, mapper: (node: TileNode) => TileNode): TileNode {
  const mapped = mapper(node);
  if (mapped.type === 'leaf') return mapped;
  return {
    ...mapped,
    children: mapped.children.map((child) => mapNode(child, mapper)),
  };
}

function normalizeSplit(split: TileSplit): TileNode {
  const children = split.children.map((child) => (
    child.type === 'split' ? normalizeSplit(child) : child
  ));
  if (children.length === 0) return defaultLeaf();
  if (children.length === 1) return children[0];
  return {
    ...split,
    children,
    sizes: normalizeSizes(split.sizes, children.length),
  };
}

function removeLeaf(node: TileNode, tileId: TileId): TileNode | null {
  if (node.type === 'leaf') return node.id === tileId ? null : node;
  const children = node.children
    .map((child) => removeLeaf(child, tileId))
    .filter((child): child is TileNode => Boolean(child));
  if (children.length === 0) return null;
  return normalizeSplit({ ...node, children });
}

function findFirstLeaf(node: TileNode): TileLeaf | null {
  if (node.type === 'leaf') return node;
  for (const child of node.children) {
    const leaf = findFirstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function findLeaf(node: TileNode, tileId: TileId | null): TileLeaf | null {
  if (!tileId) return null;
  if (node.type === 'leaf') return node.id === tileId ? node : null;
  for (const child of node.children) {
    const leaf = findLeaf(child, tileId);
    if (leaf) return leaf;
  }
  return null;
}

function collectTerminalSessionIds(node: TileNode, ids = new Set<string>()): Set<string> {
  if (node.type === 'leaf') {
    if (node.content.kind === 'terminal') ids.add(node.content.sessionId);
    return ids;
  }
  node.children.forEach((child) => collectTerminalSessionIds(child, ids));
  return ids;
}

function normalizeSizes(sizes: number[], count: number): number[] {
  if (count <= 0) return [];
  const fallback = 100 / count;
  const next = Array.from({ length: count }, (_, index) => sizes[index] ?? fallback);
  const total = next.reduce((sum, size) => sum + size, 0) || 100;
  return next.map((size) => (size / total) * 100);
}

function resizeSizes(sizes: number[], handleIndex: number, deltaPercent: number): number[] {
  const next = [...sizes];
  const left = next[handleIndex] ?? 50;
  const right = next[handleIndex + 1] ?? 50;
  const pairTotal = left + right;
  const nextLeft = Math.min(pairTotal - MIN_TILE_PERCENT, Math.max(MIN_TILE_PERCENT, left + deltaPercent));
  next[handleIndex] = nextLeft;
  next[handleIndex + 1] = pairTotal - nextLeft;
  return normalizeSizes(next, next.length);
}

function safeParseState(raw: string | null): TileLayoutState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TileLayoutState;
    if (!parsed?.root?.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useTileLayoutState(workspaceId: string | null, initialContent?: TileContent) {
  const storageKey = useMemo(() => workspaceId ? `${STORAGE_PREFIX}${workspaceId}` : null, [workspaceId]);
  const [state, setState] = useState<TileLayoutState>(() => defaultState(initialContent));

  useEffect(() => {
    const restored = storageKey ? safeParseState(window.localStorage.getItem(storageKey)) : null;
    setState(restored ?? defaultState(initialContent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  const focusTile = useCallback((tileId: TileId) => {
    setState((current) => ({ ...current, focusedTileId: tileId }));
  }, []);

  const setTileContent = useCallback((tileId: TileId, content: TileContent) => {
    setState((current) => ({
      root: mapNode(current.root, (node) => (
        node.type === 'leaf' && node.id === tileId ? { ...node, content } : node
      )),
      focusedTileId: tileId,
    }));
  }, []);

  const splitTile = useCallback((tileId: TileId, direction: 'horizontal' | 'vertical', content: TileContent = { kind: 'empty' }) => {
    const newLeaf = defaultLeaf(content);
    setState((current) => ({
      root: mapNode(current.root, (node) => {
        if (node.type !== 'leaf' || node.id !== tileId) return node;
        return {
          type: 'split',
          id: newTileId(),
          direction,
          children: [node, newLeaf],
          sizes: [50, 50],
        };
      }),
      focusedTileId: newLeaf.id,
    }));
  }, []);

  const closeTile = useCallback((tileId: TileId) => {
    setState((current) => {
      const nextRoot = removeLeaf(current.root, tileId) ?? defaultLeaf();
      const nextFocused = findLeaf(nextRoot, current.focusedTileId)?.id ?? findFirstLeaf(nextRoot)?.id ?? null;
      return { root: nextRoot, focusedTileId: nextFocused };
    });
  }, []);

  const resizeSplit = useCallback((splitId: TileId, handleIndex: number, deltaPercent: number) => {
    setState((current) => ({
      ...current,
      root: mapNode(current.root, (node) => {
        if (node.type !== 'split' || node.id !== splitId) return node;
        return {
          ...node,
          sizes: resizeSizes(normalizeSizes(node.sizes, node.children.length), handleIndex, deltaPercent),
        };
      }),
    }));
  }, []);

  const resetLayout = useCallback((content?: TileContent) => {
    setState(defaultState(content));
  }, []);

  const visibleTerminalSessionIds = useMemo(() => collectTerminalSessionIds(state.root), [state.root]);
  const focusedLeaf = useMemo(() => findLeaf(state.root, state.focusedTileId), [state.focusedTileId, state.root]);

  return {
    root: state.root,
    focusedTileId: state.focusedTileId,
    focusedLeaf,
    visibleTerminalSessionIds,
    focusTile,
    setTileContent,
    splitTile,
    closeTile,
    resizeSplit,
    resetLayout,
  };
}
