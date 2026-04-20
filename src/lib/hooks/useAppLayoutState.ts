import { useCallback, useEffect, useState, type MouseEvent } from 'react';

const SIDEBAR_WIDTH_KEY = 'forge:sidebar-width';
const DETAIL_PANEL_WIDTH_KEY = 'forge:detail-panel-width';
const DETAIL_PANEL_COLLAPSED_KEY = 'forge:detail-panel-collapsed';
const COLLAPSED_RAIL_WIDTH = 44;

function readClampedNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function useAppLayoutState() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readClampedNumber(SIDEBAR_WIDTH_KEY, 300, 220, 520));
  const [detailPanelWidth, setDetailPanelWidth] = useState<number>(() => readClampedNumber(DETAIL_PANEL_WIDTH_KEY, 280, 240, 520));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState<boolean>(() =>
    window.localStorage.getItem(DETAIL_PANEL_COLLAPSED_KEY) === 'true',
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(detailPanelWidth));
  }, [detailPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem(DETAIL_PANEL_COLLAPSED_KEY, String(detailPanelCollapsed));
  }, [detailPanelCollapsed]);

  const startResize = useCallback((event: MouseEvent<HTMLDivElement>, panel: 'left' | 'right') => {
    if (panel === 'left' && sidebarCollapsed) return;
    if (panel === 'right' && detailPanelCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === 'left' ? sidebarWidth : detailPanelWidth;
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (panel === 'left') {
        setSidebarWidth(Math.min(520, Math.max(220, startWidth + delta)));
      } else {
        setDetailPanelWidth(Math.min(520, Math.max(240, startWidth - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [detailPanelCollapsed, detailPanelWidth, sidebarCollapsed, sidebarWidth]);

  return {
    collapsedRailWidth: COLLAPSED_RAIL_WIDTH,
    detailPanelCollapsed,
    detailPanelWidth,
    setDetailPanelCollapsed,
    setDetailPanelWidth,
    setSidebarCollapsed,
    setSidebarWidth,
    sidebarCollapsed,
    sidebarWidth,
    startResize,
  };
}
