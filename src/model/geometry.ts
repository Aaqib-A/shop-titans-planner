// Shop floor geometry: plots → floor cells, back walls, front edges, the
// outdoor strip, footprints and placement checks. Pure and unit-tested.
import { type Family, getFamily, stageFor } from '../data/catalog';
import type { FurnitureType } from '../data/schema';
import type { DoorPos, FrontSide, PlacedItem, Rect, ShopSettings, WallSide } from './types';

export const PLOT = 12;
export const PLOTS = 3;
export const GRID = PLOT * PLOTS;
export const MAX_OUTDOOR = 8;
/** Cells per side of the working area (shop + outdoor strip). */
export const EXTENT = GRID + MAX_OUTDOOR;

export type Layer = 'floor' | 'rug' | 'wall' | 'outdoor';

export function layerOf(type: FurnitureType): Layer {
  switch (type) {
    case 'floordeco':
      return 'rug';
    case 'walldeco':
      return 'wall';
    case 'outdoordeco':
      return 'outdoor';
    default:
      return 'floor';
  }
}

export interface WallSeg {
  x: number;
  y: number;
  side: WallSide;
}

export interface ShopGeometry {
  floor: Uint8Array;
  outdoor: Uint8Array;
  walls: WallSeg[];
  wallKeys: Set<string>;
  fronts: DoorPos[];
  door: DoorPos;
  doorValid: boolean;
  plotsConnected: boolean;
  floorCount: number;
  /** Cell bounds of floor + outdoor, for fitting the view. */
  bounds: Rect;
}

export const cellIndex = (x: number, y: number) => y * EXTENT + x;
export const inExtent = (x: number, y: number) => x >= 0 && y >= 0 && x < EXTENT && y < EXTENT;
export const wallKey = (x: number, y: number, side: WallSide) => `${x},${y},${side}`;
export const doorKey = (d: DoorPos) => `${d.x},${d.y},${d.side}`;

export function plotsConnected(plots: boolean[]): boolean {
  const on = plots.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (on.length === 0) return false;
  const seen = new Set([on[0]]);
  const queue = [on[0]];
  while (queue.length) {
    const i = queue.pop()!;
    const px = i % PLOTS;
    const py = Math.floor(i / PLOTS);
    const next = [
      px > 0 ? i - 1 : -1,
      px < PLOTS - 1 ? i + 1 : -1,
      py > 0 ? i - PLOTS : -1,
      py < PLOTS - 1 ? i + PLOTS : -1,
    ];
    for (const n of next) {
      if (n >= 0 && plots[n] && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === on.length;
}

export function buildGeometry(shop: ShopSettings): ShopGeometry {
  const floor = new Uint8Array(EXTENT * EXTENT);
  const outdoor = new Uint8Array(EXTENT * EXTENT);
  let floorCount = 0;
  for (let p = 0; p < PLOTS * PLOTS; p++) {
    if (!shop.plots[p]) continue;
    const ox = (p % PLOTS) * PLOT;
    const oy = Math.floor(p / PLOTS) * PLOT;
    for (let y = oy; y < oy + PLOT; y++)
      for (let x = ox; x < ox + PLOT; x++) {
        floor[cellIndex(x, y)] = 1;
        floorCount++;
      }
  }
  const isFloor = (x: number, y: number) => inExtent(x, y) && floor[cellIndex(x, y)] === 1;

  const walls: WallSeg[] = [];
  const fronts: DoorPos[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      if (!isFloor(x, y)) continue;
      if (!isFloor(x - 1, y)) walls.push({ x, y, side: 'nx' });
      if (!isFloor(x, y - 1)) walls.push({ x, y, side: 'ny' });
      if (!isFloor(x + 1, y)) fronts.push({ x, y, side: 'px' });
      if (!isFloor(x, y + 1)) fronts.push({ x, y, side: 'py' });
    }

  // Outdoor: non-floor cells in front (+x/+y) of the shop within `depth` cells.
  const depth = Math.max(0, Math.min(MAX_OUTDOOR, Math.round(shop.outdoorDepth)));
  let bx0 = EXTENT;
  let by0 = EXTENT;
  let bx1 = 0;
  let by1 = 0;
  for (let y = 0; y < EXTENT; y++)
    for (let x = 0; x < EXTENT; x++) {
      if (isFloor(x, y)) {
        bx0 = Math.min(bx0, x);
        by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x + 1);
        by1 = Math.max(by1, y + 1);
        continue;
      }
      if (depth === 0) continue;
      let near = false;
      for (let dy = 0; dy <= depth && !near; dy++)
        for (let dx = 0; dx <= depth && !near; dx++) if ((dx || dy) && isFloor(x - dx, y - dy)) near = true;
      if (near) {
        outdoor[cellIndex(x, y)] = 1;
        bx1 = Math.max(bx1, x + 1);
        by1 = Math.max(by1, y + 1);
      }
    }

  const frontKeys = new Set(fronts.map(doorKey));
  const doorValid = frontKeys.has(doorKey(shop.door));
  return {
    floor,
    outdoor,
    walls,
    wallKeys: new Set(walls.map((w) => wallKey(w.x, w.y, w.side))),
    fronts,
    door: doorValid ? shop.door : defaultDoor(fronts),
    doorValid,
    plotsConnected: plotsConnected(shop.plots),
    floorCount,
    bounds: floorCount ? { x0: bx0, y0: by0, x1: bx1, y1: by1 } : { x0: 0, y0: 0, x1: PLOT, y1: PLOT },
  };
}

/** Middle of the longest straight run of front edges, preferring +y. */
export function defaultDoor(fronts: DoorPos[]): DoorPos {
  if (!fronts.length) return { x: 0, y: 0, side: 'py' };
  let best: DoorPos[] = [];
  for (const side of ['py', 'px'] as FrontSide[]) {
    const edges = fronts.filter((f) => f.side === side);
    const lines = new Map<number, DoorPos[]>();
    for (const e of edges) {
      const k = side === 'py' ? e.y : e.x;
      lines.set(k, [...(lines.get(k) ?? []), e]);
    }
    for (const line of lines.values()) {
      line.sort((a, b) => (side === 'py' ? a.x - b.x : a.y - b.y));
      let run: DoorPos[] = [];
      for (const e of line) {
        const prev = run[run.length - 1];
        const contiguous = prev && (side === 'py' ? e.x === prev.x + 1 : e.y === prev.y + 1);
        run = contiguous ? [...run, e] : [e];
        if (run.length > best.length) best = run;
      }
    }
  }
  return best[Math.floor((best.length - 1) / 2)];
}

/** Cells in front of the door: the floor cell and the outside cell. */
export function doorCells(door: DoorPos): { inside: [number, number]; outside: [number, number] } {
  return {
    inside: [door.x, door.y],
    outside: door.side === 'px' ? [door.x + 1, door.y] : [door.x, door.y + 1],
  };
}

export function isFloorCell(g: ShopGeometry, x: number, y: number): boolean {
  return inExtent(x, y) && g.floor[cellIndex(x, y)] === 1;
}

export function isOutdoorCell(g: ShopGeometry, x: number, y: number): boolean {
  return inExtent(x, y) && g.outdoor[cellIndex(x, y)] === 1;
}

export interface Resolved {
  item: PlacedItem;
  family: Family;
  stage: ReturnType<typeof stageFor>;
  layer: Layer;
  rect: Rect;
}

export function footprintSize(stage: { w: number; l: number }, rot: 0 | 1): { w: number; l: number } {
  return rot ? { w: stage.l, l: stage.w } : { w: stage.w, l: stage.l };
}

export function resolveItem(item: PlacedItem): Resolved | null {
  const family = getFamily(item.family);
  if (!family) return null;
  const stage = stageFor(family, item.level);
  const { w, l } = footprintSize(stage, item.rot);
  const layer = layerOf(family.type);
  const rect = layer === 'wall' ? { x0: item.x, y0: item.y, x1: item.x + 1, y1: item.y + 1 } : { x0: item.x, y0: item.y, x1: item.x + w, y1: item.y + l };
  return { item, family, stage, layer, rect };
}

export const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export const rectContains = (r: Rect, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** Why a resolved item can't sit where it is, or null if it fits its zone. */
export function zoneProblem(g: ShopGeometry, r: Resolved): string | null {
  if (r.item.zone === 'stored') return null;
  if (r.layer === 'wall') {
    if (!r.item.side || !g.wallKeys.has(wallKey(r.item.x, r.item.y, r.item.side))) return 'not on a wall';
    return null;
  }
  const want = r.layer === 'outdoor' ? isOutdoorCell : isFloorCell;
  for (let y = r.rect.y0; y < r.rect.y1; y++)
    for (let x = r.rect.x0; x < r.rect.x1; x++)
      if (!want(g, x, y)) return r.layer === 'outdoor' ? 'outside the outdoor area' : 'outside the shop floor';
  return null;
}

/** Same-layer pieces collide; rugs sit under furniture, so floor and rug layers don't. */
export function collides(a: Resolved, b: Resolved): boolean {
  if (a.item.id === b.item.id || a.layer !== b.layer) return false;
  if (a.item.zone === 'stored' || b.item.zone === 'stored') return false;
  if (a.layer === 'wall') return a.item.x === b.item.x && a.item.y === b.item.y && a.item.side === b.item.side;
  return rectsOverlap(a.rect, b.rect);
}

export function checkPlacement(g: ShopGeometry, placed: Resolved[], candidate: Resolved): { ok: boolean; reason?: string } {
  const zone = zoneProblem(g, candidate);
  if (zone) return { ok: false, reason: zone };
  const hit = placed.find((p) => collides(p, candidate));
  if (hit) return { ok: false, reason: `overlaps ${hit.family.name}` };
  return { ok: true };
}
