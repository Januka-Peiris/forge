import { useCallback, useEffect, useState, type MouseEvent } from 'react';

const SIDEBAR_WIDTH_KEY = 'forge:sidebar-width';
const INSPECTOR_WIDTH_KEY = 'forge:inspector-width';
const INSPECTOR_COLLAPSED_KEY = 'forge:inspector-collapsed';
const LEGACY_DETAIL_PANEL_WIDTH_KEY = 'forge:detail-panel-width';
const LEGACY_DETAIL_PANEL_COLLAPSED_KEY = 'forge:detail-panel-collapsed';
const INSPECTOR_TAB_KEY = 'forge:inspector-tab';
const COLLAPSED_RAIL_WIDTH = 44;

function readClampedNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function useAppLayoutState() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readClampedNumber(SIDEBAR_WIDTH_KEY, 300, 220, 520));
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const primary = window.localStorage.getItem(INSPECTOR_WIDTH_KEY);
    const fallback = window.localStorage.getItem(LEGACY_DETAIL_PANEL_WIDTH_KEY);
    const parsed = Number(primary ?? fallback ?? NaN);
    return Number.isFinite(parsed) ? Math.min(520, Math.max(260, parsed)) : 340;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    const primary = window.localStorage.getItem(INSPECTOR_COLLAPSED_KEY);
    const fallback = window.localStorage.getItem(LEGACY_DETAIL_PANEL_COLLAPSED_KEY);
    return (primary ?? fallback) === 'true';
  });
  const [inspectorTab, setInspectorTab] = useState<'changes' | 'checks' | 'review' | 'files'>(() => {
    const saved = window.localStorage.getItem(INSPECTOR_TAB_KEY);
    if (saved === 'changes' || saved === 'checks' || saved === 'review' || saved === 'files') return saved;
    return 'changes';
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_COLLAPSED_KEY, String(inspectorCollapsed));
  }, [inspectorCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_TAB_KEY, inspectorTab);
  }, [inspectorTab]);

  const startResize = useCallback((event: MouseEvent<HTMLDivElement>, panel: 'left' | 'right') => {
    if (panel === 'left' && sidebarCollapsed) return;
    if (panel === 'right' && inspectorCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === 'left' ? sidebarWidth : inspectorWidth;
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (panel === 'left') {
        setSidebarWidth(Math.min(520, Math.max(220, startWidth + delta)));
      } else {
        setInspectorWidth(Math.min(560, Math.max(260, startWidth - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [inspectorCollapsed, inspectorWidth, sidebarCollapsed, sidebarWidth]);

  return {
    collapsedRailWidth: COLLAPSED_RAIL_WIDTH,
    inspectorCollapsed,
    inspectorTab,
    inspectorWidth,
    setInspectorCollapsed,
    setInspectorTab,
    setInspectorWidth,
    setSidebarCollapsed,
    setSidebarWidth,
    sidebarCollapsed,
    sidebarWidth,
    startResize,
  };
}
