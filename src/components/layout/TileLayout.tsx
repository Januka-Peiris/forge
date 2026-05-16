import { Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { TileLeaf, TileNode, TileSplit } from '../../types/tile-layout';
import { TileResizeHandle } from './TileResizeHandle';

interface TileLayoutProps {
  root: TileNode;
  focusedTileId: string | null;
  onFocusTile: (tileId: string) => void;
  onResizeSplit: (splitId: string, handleIndex: number, deltaPercent: number) => void;
  renderLeaf: (leaf: TileLeaf, focused: boolean) => ReactNode;
}

export function TileLayout({
  root,
  focusedTileId,
  onFocusTile,
  onResizeSplit,
  renderLeaf,
}: TileLayoutProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <TileNodeView
        node={root}
        focusedTileId={focusedTileId}
        onFocusTile={onFocusTile}
        onResizeSplit={onResizeSplit}
        renderLeaf={renderLeaf}
      />
    </div>
  );
}

type TileNodeViewProps = Omit<TileLayoutProps, 'root'> & { node: TileNode };

function TileNodeView({
  node,
  focusedTileId,
  onFocusTile,
  onResizeSplit,
  renderLeaf,
}: TileNodeViewProps) {
  if (node.type === 'leaf') {
    const focused = focusedTileId === node.id;
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1"
        onMouseDown={() => onFocusTile(node.id)}
      >
        {renderLeaf(node, focused)}
      </div>
    );
  }

  return (
    <TileSplitView
      split={node}
      focusedTileId={focusedTileId}
      onFocusTile={onFocusTile}
      onResizeSplit={onResizeSplit}
      renderLeaf={renderLeaf}
    />
  );
}

function TileSplitView({
  split,
  focusedTileId,
  onFocusTile,
  onResizeSplit,
  renderLeaf,
}: Omit<TileLayoutProps, 'root'> & { split: TileSplit }) {
  const horizontal = split.direction === 'horizontal';

  const startResize = (handleIndex: number, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    let last = horizontal ? event.clientX : event.clientY;
    const parent = event.currentTarget.parentElement;
    const total = horizontal ? parent?.clientWidth ?? 0 : parent?.clientHeight ?? 0;
    if (total <= 0) return;

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const current = horizontal ? moveEvent.clientX : moveEvent.clientY;
      onResizeSplit(split.id, handleIndex, ((current - last) / total) * 100);
      last = current;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 ${horizontal ? 'flex-row' : 'flex-col'}`}>
      {split.children.map((child, index) => (
        <Fragment key={child.id}>
          <div
            className="flex min-h-0 min-w-0"
            style={{ flexBasis: `${split.sizes[index] ?? 100 / split.children.length}%`, flexGrow: 0, flexShrink: 0 }}
          >
            <TileNodeView
              node={child}
              focusedTileId={focusedTileId}
              onFocusTile={onFocusTile}
              onResizeSplit={onResizeSplit}
              renderLeaf={renderLeaf}
            />
          </div>
          {index < split.children.length - 1 && (
            <TileResizeHandle
              direction={split.direction}
              onResizeStart={(event) => startResize(index, event)}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
