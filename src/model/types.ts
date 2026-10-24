/** Where a placed piece lives. `stored` = in the basement, not on the map. */
export type Zone = 'floor' | 'wall' | 'outdoor' | 'stored';

/**
 * Wall segments sit on a floor cell's back edge: `nx` is the edge towards −x
 * (upper-left in the isometric view), `ny` the edge towards −y (upper-right).
 */
export type WallSide = 'nx' | 'ny';

/** Front edges face +x / +y; the door sits on one of them. */
export type FrontSide = 'px' | 'py';

export interface PlacedItem {
  id: string;
  /** Furniture family id; the stage (footprint + sprite) follows from `level`. */
  family: string;
  level: number;
  /** Top-left cell for floor/outdoor pieces, the wall cell for wall decor. */
  x: number;
  y: number;
  /** 1 = turned 90°: footprint swapped and sprite mirrored. */
  rot: 0 | 1;
  zone: Zone;
  side?: WallSide;
}

export interface DoorPos {
  x: number;
  y: number;
  side: FrontSide;
}

export interface ShopSettings {
  /** 3×3 plots of 12×12 cells, row-major: index = py * 3 + px. */
  plots: boolean[];
  door: DoorPos;
  /** Shop expansion number from the sheet (1–29); sets the furniture limit. */
  expansion: number;
  /** Basement expansion number (0 = no basement). */
  basement: number;
  merchantLevel: number;
  /** Depth in cells of the outdoor strip in front of the shop. */
  outdoorDepth: number;
  floor: string | null;
  wall: string | null;
}

export interface Layout {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  shop: ShopSettings;
  items: PlacedItem[];
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  itemIds?: string[];
}
