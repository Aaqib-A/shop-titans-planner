// Customer reachability: customers walk in through the door and need a clear
// path to every display and to the counter. This approximates the game's rule:
// a piece counts as reachable when any cell next to its footprint is.
import type { FurnitureType } from '../data/schema';
import { type Resolved, type ShopGeometry, EXTENT, cellIndex, isFloorCell } from './geometry';

/** Customers must reach these, or the shop doesn't work. */
export const ACCESS_REQUIRED: FurnitureType[] = ['counter', 'rack'];

export interface Reachability {
  reachable: Uint8Array;
  doorBlocked: boolean;
  /** Required pieces customers can't reach. */
  unreachable: string[];
  /** Decor customers would admire but can't reach. */
  unreachableDecor: string[];
}

export function walkableMap(g: ShopGeometry, items: Resolved[]): Uint8Array {
  const walk = new Uint8Array(g.floor);
  for (const r of items) {
    if (r.item.zone === 'stored' || r.layer !== 'floor') continue;
    for (let y = r.rect.y0; y < r.rect.y1; y++)
      for (let x = r.rect.x0; x < r.rect.x1; x++) if (isFloorCell(g, x, y)) walk[cellIndex(x, y)] = 0;
  }
  return walk;
}

export function computeReachability(g: ShopGeometry, items: Resolved[]): Reachability {
  const walk = walkableMap(g, items);
  const reachable = new Uint8Array(EXTENT * EXTENT);
  const start = cellIndex(g.door.x, g.door.y);
  const doorBlocked = !walk[start];
  if (!doorBlocked) {
    const queue = [start];
    reachable[start] = 1;
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % EXTENT;
      const y = (i - x) / EXTENT;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= EXTENT || ny >= EXTENT) continue;
        const n = cellIndex(nx, ny);
        if (walk[n] && !reachable[n]) {
          reachable[n] = 1;
          queue.push(n);
        }
      }
    }
  }

  const touchesReachable = (r: Resolved) => {
    const { x0, y0, x1, y1 } = r.rect;
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < EXTENT && y < EXTENT && reachable[cellIndex(x, y)] === 1;
    for (let x = x0; x < x1; x++) if (ok(x, y0 - 1) || ok(x, y1)) return true;
    for (let y = y0; y < y1; y++) if (ok(x0 - 1, y) || ok(x1, y)) return true;
    return false;
  };

  const unreachable: string[] = [];
  const unreachableDecor: string[] = [];
  for (const r of items) {
    if (r.item.zone === 'stored' || r.layer !== 'floor') continue;
    if (ACCESS_REQUIRED.includes(r.family.type)) {
      if (!touchesReachable(r)) unreachable.push(r.item.id);
    } else if (r.family.type === 'indoordeco' && r.stage.maxVisitors > 0 && !touchesReachable(r)) {
      unreachableDecor.push(r.item.id);
    }
  }
  return { reachable, doorBlocked, unreachable, unreachableDecor };
}
