export type TileId = string;

export type TileContent =
  | { kind: 'terminal'; sessionId: string }
  | { kind: 'diff'; filePath: string }
  | { kind: 'files' }
  | { kind: 'empty' };

export interface TileLeaf {
  type: 'leaf';
  id: TileId;
  content: TileContent;
}

export interface TileSplit {
  type: 'split';
  id: TileId;
  direction: 'horizontal' | 'vertical';
  children: TileNode[];
  sizes: number[];
}

export type TileNode = TileLeaf | TileSplit;

export interface TileLayoutState {
  root: TileNode;
  focusedTileId: TileId | null;
}
