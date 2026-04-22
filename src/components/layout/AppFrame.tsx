import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

interface AppFrameProps {
  children: ReactNode;
  inspector: ReactNode;
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  isReviewView: boolean;
  showInspector?: boolean;
  onCollapseInspector?: () => void;
  onExpandInspector: () => void;
  onExpandSidebar: () => void;
  onResetInspectorWidth: () => void;
  onResizeInspector: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResizeSidebar: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResetSidebarWidth: () => void;
  sidebar: ReactNode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  collapsedRailWidth: number;
}

export function AppFrame({
  children,
  inspector,
  inspectorCollapsed,
  inspectorWidth,
  isReviewView,
  showInspector = !isReviewView,
  onCollapseInspector,
  onExpandInspector,
  onExpandSidebar,
  onResetInspectorWidth,
  onResizeInspector,
  onResizeSidebar,
  onResetSidebarWidth,
  sidebar,
  sidebarCollapsed,
  sidebarWidth,
  collapsedRailWidth,
}: AppFrameProps) {
  const showDetailPanel = showInspector && !isReviewView;
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
            {!inspectorCollapsed ? (
              <>
                <div
                  role="separator"
                  aria-label="Resize inspector"
                  onMouseDown={onResizeInspector}
                  onDoubleClick={onResetInspectorWidth}
                  className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-forge-border/70 active:bg-forge-green/60"
                  title="Double-click to reset width"
                />
                <div
                  className="relative z-[2] shrink-0 h-full shadow-forge-panel"
                  style={{ width: `${inspectorWidth}px` }}
                >
                  {onCollapseInspector && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      onClick={onCollapseInspector}
                      title="Collapse inspector"
                      className="absolute -left-3 top-2 z-10 h-6 w-6 border-forge-green/40 bg-forge-card/95 text-forge-green shadow-md"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {inspector}
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
                  onClick={onExpandInspector}
                  title="Open inspector"
                  className="mt-2.5 h-8 w-8 border-forge-green/40 bg-forge-card/95 text-forge-green shadow-md hover:bg-forge-green/10"
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
