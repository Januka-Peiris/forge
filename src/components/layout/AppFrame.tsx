import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

interface AppFrameProps {
  children: ReactNode;
  detailPanel: ReactNode;
  detailPanelCollapsed: boolean;
  detailPanelWidth: number;
  isReviewView: boolean;
  onExpandDetailPanel: () => void;
  onExpandSidebar: () => void;
  onResetDetailWidth: () => void;
  onResizeDetail: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResizeSidebar: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResetSidebarWidth: () => void;
  sidebar: ReactNode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedRailWidth: number;
}

export function AppFrame({
  children,
  detailPanel,
  detailPanelCollapsed,
  detailPanelWidth,
  isReviewView,
  onExpandDetailPanel,
  onExpandSidebar,
  onResetDetailWidth,
  onResizeDetail,
  onResizeSidebar,
  onResetSidebarWidth,
  sidebar,
  sidebarCollapsed,
  sidebarWidth,
  collapsedRailWidth,
}: AppFrameProps) {
  const showDetailPanel = !isReviewView;
  return (
    <div className="flex flex-1 min-h-0">
      {!isReviewView && (
        sidebarCollapsed ? (
          <div
            className="shrink-0 h-full flex flex-col items-center justify-start bg-forge-surface"
            style={{ width: `${collapsedRailWidth}px` }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onExpandSidebar}
              title="Expand sidebar"
              className="mt-2.5 shadow-md ring-1 ring-black/20"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          </div>
        ) : (
          <>
            <div className="shrink-0 h-full" style={{ width: `${sidebarWidth}px` }}>
              {sidebar}
            </div>
            <div
              role="separator"
              aria-label="Resize sidebar"
              onMouseDown={onResizeSidebar}
              onDoubleClick={onResetSidebarWidth}
              className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
              title="Double-click to reset width"
            />
          </>
        )
      )}

      <div className="flex flex-1 min-w-0 min-h-0">
        <div className="relative flex flex-col flex-1 min-w-0 min-h-0 bg-forge-bg">
          <div className="relative flex flex-1 flex-col min-h-0">
            {children}
          </div>
        </div>

        {showDetailPanel && (
          <>
            {!detailPanelCollapsed ? (
              <>
                <div
                  role="separator"
                  aria-label="Resize detail panel"
                  onMouseDown={onResizeDetail}
                  onDoubleClick={onResetDetailWidth}
                  className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
                  title="Double-click to reset width"
                />
                <div
                  className="relative z-[2] shrink-0 h-full shadow-forge-panel"
                  style={{ width: `${detailPanelWidth}px` }}
                >
                  {detailPanel}
                </div>
              </>
            ) : (
              <div
                className="shrink-0 h-full flex items-start justify-center bg-forge-surface"
                style={{ width: `${collapsedRailWidth}px` }}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  onClick={onExpandDetailPanel}
                  title="Expand detail panel"
                  className="mt-2.5"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
