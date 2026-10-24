// Shared renderer contract and helpers for the isometric and top-down views.
import type { FurnitureDef, FurnitureType } from '../data/schema';
import type { Analysis } from '../model/analyze';
import type { Resolved, ShopGeometry, WallSeg } from '../model/geometry';
import type { DoorPos, Layout, PlacedItem, Rect } from '../model/types';

export interface Ghost {
  item: PlacedItem;
  valid: boolean;
}

export interface SceneInput {
  layout: Layout;
  analysis: Analysis;
  selected: string | null;
  ghost: Ghost | null;
  /** Item being dragged; drawn as the ghost instead of in place. */
  dragging: string | null;
  pickingDoor: boolean;
  hoverDoor: DoorPos | null;
  showGrid: boolean;
  showPath: boolean;
  /** Pixels per world unit, so lines stay crisp at any zoom. */
  zoom: number;
}

/** What was drawn where, in world coordinates, for click-testing. */
export interface DrawEntry {
  id: string;
  kind: 'object' | 'walldeco' | 'rug';
  x: number;
  y: number;
  w: number;
  h: number;
  file: string | null;
  mirror: boolean;
}

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Renderer {
  project(gx: number, gy: number): [number, number];
  unproject(wx: number, wy: number): [number, number];
  worldBounds(g: ShopGeometry): WorldRect;
  /** World rect around an item, for centring the camera on it. */
  itemBounds(r: Resolved): WorldRect;
  draw(ctx: CanvasRenderingContext2D, scene: SceneInput): DrawEntry[];
  pickWall(scene: SceneInput, wx: number, wy: number): WallSeg | null;
  pickFront(scene: SceneInput, wx: number, wy: number): DoorPos | null;
  pickItem(scene: SceneInput, entries: DrawEntry[], wx: number, wy: number): string | null;
}

export const TYPE_COLORS: Record<FurnitureType, string> = {
  counter: '#e8b54d',
  rack: '#5aa9e6',
  chest: '#c08552',
  bin: '#8bc34a',
  indoordeco: '#c792ea',
  floordeco: '#4fc3b0',
  walldeco: '#f78c6c',
  outdoordeco: '#66bb6a',
  pethouse: '#ff8fab',
};

export const PALETTE = {
  floor: '#8b6b4c',
  floorAlt: '#83644626',
  outdoor: '#4f6f3c',
  outdoorEdge: '#3f5a30',
  wall: '#cdbb98',
  wallTop: '#6e5a3e',
  grid: 'rgba(0,0,0,0.16)',
  plotLine: 'rgba(255,240,200,0.35)',
  reach: 'rgba(110,190,255,0.24)',
  ok: 'rgba(90,220,120,0.45)',
  bad: 'rgba(240,80,80,0.5)',
  selected: '#ffd54a',
  door: '#ffd54a',
  warn: '#ff5a5a',
};

/**
 * The sprites show a piece's long side running along the grid's y axis, so
 * they're mirrored when the long side runs along x (and when square pieces
 * are turned).
 */
export function isMirrored(stage: Pick<FurnitureDef, 'w' | 'l'>, rot: 0 | 1): boolean {
  if (stage.w === stage.l) return rot === 1;
  const w = rot ? stage.l : stage.w;
  const l = rot ? stage.w : stage.l;
  return w > l;
}

/** B is drawn after A when it is in front of A on either grid axis. */
const inFront = (b: Rect, a: Rect) => (b.x0 >= a.x1 && b.y1 > a.y0) || (b.y0 >= a.y1 && b.x1 > a.x0);

/** Painter's order for non-overlapping footprints (topological sort). */
export function depthSort<T extends { rect: Rect }>(nodes: T[]): T[] {
  const n = nodes.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j && inFront(nodes[j].rect, nodes[i].rect)) {
        after[i].push(j);
        indegree[j]++;
      }
  const key = (i: number) => nodes[i].rect.x0 + nodes[i].rect.y0;
  const ready = indegree.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
  const out: T[] = [];
  const done = new Uint8Array(n);
  while (out.length < n) {
    if (!ready.length) {
      // A cycle (only possible with overlapping pieces): fall back to depth key.
      const rest = nodes.map((_, i) => i).filter((i) => !done[i]).sort((a, b) => key(a) - key(b));
      ready.push(rest[0]);
      indegree[rest[0]] = 0;
    }
    ready.sort((a, b) => key(b) - key(a));
    const i = ready.pop()!;
    if (done[i]) continue;
    done[i] = 1;
    out.push(nodes[i]);
    for (const j of after[i]) if (--indegree[j] === 0 && !done[j]) ready.push(j);
  }
  return out;
}

export function itemFlags(scene: SceneInput, id: string) {
  const { analysis } = scene;
  return {
    selected: scene.selected === id,
    invalid: analysis.invalid.has(id),
    unreachable: analysis.reach.unreachable.includes(id),
  };
}

export function hitEntry(entries: DrawEntry[], wx: number, wy: number, alpha: (file: string, u: number, v: number) => number, kinds: DrawEntry['kind'][]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!kinds.includes(e.kind)) continue;
    if (wx < e.x || wy < e.y || wx > e.x + e.w || wy > e.y + e.h) continue;
    let u = (wx - e.x) / e.w;
    const v = (wy - e.y) / e.h;
    if (e.mirror) u = 1 - u;
    if (!e.file || alpha(e.file, u, v) > 40) return e.id;
  }
  return null;
}
