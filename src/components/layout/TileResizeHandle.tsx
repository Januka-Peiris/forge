import type { MouseEvent } from 'react';

interface TileResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
}

export function TileResizeHandle({ direction, onResizeStart }: TileResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onMouseDown={onResizeStart}
      className={
        direction === 'horizontal'
          ? 'w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-mn-border/70 active:bg-mn-cyan/60'
          : 'h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-mn-border/70 active:bg-mn-cyan/60'
      }
      title="Drag to resize split"
    />
  );
}
