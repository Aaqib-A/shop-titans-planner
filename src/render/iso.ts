// Isometric view: 64×32 tiles, back walls along −x/−y, sprites standing on
// their footprints in painter's order.
import { getCosmetic, spriteFor, spriteOverrides } from '../data/catalog';
import type { FurnitureDef } from '../data/schema';
import { type Resolved, type WallSeg, EXTENT, cellIndex, doorCells, resolveItem } from '../model/geometry';
import type { DoorPos, Rect } from '../model/types';
import { alphaAt, getImage, getPatternSource } from './spriteCache';
import {
  type DrawEntry,
  type Renderer,
  type SceneInput,
  PALETTE,
  depthSort,
  hitEntry,
  isMirrored,
  itemFlags,
} from './scene';

const HW = 32;
const HH = 16;
export const WALL_H = 136;
/** Cells covered by one repeat of a floor texture. */
const FLOOR_TILE_CELLS = 2;
const WALL_TILE_CELLS = 3;

const project = (gx: number, gy: number): [number, number] => [(gx - gy) * HW, (gx + gy) * HH];
const unproject = (wx: number, wy: number): [number, number] => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];

function diamond(ctx: CanvasRenderingContext2D, r: Rect) {
  const [ax, ay] = project(r.x0, r.y0);
  const [bx, by] = project(r.x1, r.y0);
  const [cx, cy] = project(r.x1, r.y1);
  const [dx, dy] = project(r.x0, r.y1);
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
}

function cellsPath(ctx: CanvasRenderingContext2D, mask: Uint8Array) {
  ctx.beginPath();
  for (let y = 0; y < EXTENT; y++)
    for (let x = 0; x < EXTENT; x++) if (mask[cellIndex(x, y)]) diamond(ctx, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
}

function wallQuad(seg: WallSeg): [number, number][] {
  const [x0, y0] = project(seg.x, seg.y);
  const [x1, y1] = seg.side === 'ny' ? project(seg.x + 1, seg.y) : project(seg.x, seg.y + 1);
  return [
    [x0, y0],
    [x1, y1],
    [x1, y1 - WALL_H],
    [x0, y0 - WALL_H],
  ];
}

/** Where a sprite goes for a footprint: centred, standing on the front corner. */
export function spriteBox(def: FurnitureDef, rect: Rect, rug: boolean) {
  const sprite = spriteFor(def);
  if (!sprite) return null;
  const ov = (def.sprite && spriteOverrides[def.sprite]) || {};
  const w = rect.x1 - rect.x0;
  const l = rect.y1 - rect.y0;
  const dw = (w + l) * HW;
  const dh = (w + l) * HH;
  const [cx, cy] = project((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
  let sw = dw * 0.98 * (ov.scale ?? 1);
  let sh = (sw * sprite.h) / sprite.w;
  if (rug) {
    if (sh > dh * 1.25) {
      sh = dh * 1.25;
      sw = (sh * sprite.w) / sprite.h;
    }
    return { file: sprite.file, x: cx - sw / 2 + (ov.dx ?? 0), y: cy - sh / 2 + (ov.dy ?? 0), w: sw, h: sh };
  }
  const bottom = cy + dh / 2 - dh * 0.08;
  return { file: sprite.file, x: cx - sw / 2 + (ov.dx ?? 0), y: bottom - sh + (ov.dy ?? 0), w: sw, h: sh };
}

function wallDecorBox(def: FurnitureDef, seg: WallSeg) {
  const sprite = spriteFor(def);
  if (!sprite) return null;
  const ov = (def.sprite && spriteOverrides[def.sprite]) || {};
  const [q0, q1] = wallQuad(seg);
  const mx = (q0[0] + q1[0]) / 2;
  const my = (q0[1] + q1[1]) / 2 - WALL_H * 0.5;
  const box = 76 * (ov.scale ?? 1);
  const s = Math.min(box / sprite.w, box / sprite.h);
  const w = sprite.w * s;
  const h = sprite.h * s;
  return { file: sprite.file, x: mx - w / 2 + (ov.dx ?? 0), y: my - h / 2 + (ov.dy ?? 0), w, h };
}

function drawImage(ctx: CanvasRenderingContext2D, file: string, x: number, y: number, w: number, h: number, mirror: boolean) {
  const img = getImage(file);
  if (!img) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.6);
    return;
  }
  if (mirror) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(img, x, y, w, h);
}

function floorPattern(ctx: CanvasRenderingContext2D, scene: SceneInput): CanvasPattern | string {
  const cos = getCosmetic('floor', scene.layout.shop.floor);
  const src = cos && getPatternSource('floor', cos.file);
  if (!src) return PALETTE.floor;
  const pattern = ctx.createPattern(src, 'repeat');
  if (!pattern) return PALETTE.floor;
  const k = FLOOR_TILE_CELLS;
  pattern.setTransform(new DOMMatrix([(HW * k) / src.width, (HH * k) / src.width, (-HW * k) / src.height, (HH * k) / src.height, 0, 0]));
  return pattern;
}

function wallFill(ctx: CanvasRenderingContext2D, scene: SceneInput, seg: WallSeg): CanvasPattern | string {
  const cos = getCosmetic('wall', scene.layout.shop.wall);
  const src = cos && getPatternSource('wall', cos.file);
  if (!src) return PALETTE.wall;
  const pattern = ctx.createPattern(src, 'repeat');
  if (!pattern) return PALETTE.wall;
  const k = WALL_TILE_CELLS;
  const sx = seg.side === 'ny' ? HW : -HW;
  const [ox, oy] = seg.side === 'ny' ? project(0, seg.y) : project(seg.x, 0);
  pattern.setTransform(new DOMMatrix([(sx * k) / src.width, (HH * k) / src.width, 0, WALL_H / src.height, ox, oy - WALL_H]));
  return pattern;
}

function drawWall(ctx: CanvasRenderingContext2D, scene: SceneInput, seg: WallSeg) {
  const q = wallQuad(seg);
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  for (const p of q.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fillStyle = wallFill(ctx, scene, seg);
  ctx.fill();
  if (seg.side === 'nx') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fill();
  }
  // Skirting and top trim.
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.wallTop;
  ctx.beginPath();
  ctx.moveTo(q[3][0], q[3][1]);
  ctx.lineTo(q[2][0], q[2][1]);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  ctx.lineTo(q[1][0], q[1][1]);
  ctx.stroke();
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  const r = 9 / Math.max(zoom, 0.5);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.warn;
  ctx.fill();
  ctx.lineWidth = r * 0.25;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${r * 1.4}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + r * 0.05);
}

type Node =
  | { kind: 'wall'; rect: Rect; seg: WallSeg; decor: Resolved[] }
  | { kind: 'object'; rect: Rect; r: Resolved };

export const isoRenderer: Renderer = {
  project,
  unproject,

  worldBounds(g) {
    const b = g.bounds;
    const xs = [project(b.x0, b.y1)[0], project(b.x1, b.y0)[0]];
    const top = project(b.x0, b.y0)[1] - WALL_H - 40;
    const bottom = project(b.x1, b.y1)[1] + 40;
    return { x: xs[0] - 40, y: top, w: xs[1] - xs[0] + 80, h: bottom - top };
  },

  itemBounds(r) {
    const [x0] = project(r.rect.x0, r.rect.y1);
    const [x1] = project(r.rect.x1, r.rect.y0);
    const top = project(r.rect.x0, r.rect.y0)[1] - (r.layer === 'wall' ? WALL_H : 80);
    const bottom = project(r.rect.x1, r.rect.y1)[1];
    return { x: x0, y: top, w: x1 - x0, h: bottom - top };
  },

  draw(ctx, scene) {
    const { analysis: a } = scene;
    const g = a.geometry;
    const entries: DrawEntry[] = [];
    const px = 1 / scene.zoom;

    // Ground: outdoor strip, then the shop floor.
    cellsPath(ctx, g.outdoor);
    ctx.fillStyle = PALETTE.outdoor;
    ctx.fill();
    cellsPath(ctx, g.floor);
    ctx.fillStyle = floorPattern(ctx, scene);
    ctx.fill();
    if (scene.showGrid) {
      ctx.lineWidth = px;
      ctx.strokeStyle = PALETTE.grid;
      cellsPath(ctx, g.floor);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      cellsPath(ctx, g.outdoor);
      ctx.stroke();
      // Plot borders.
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = PALETTE.plotLine;
      ctx.setLineDash([6 * px, 6 * px]);
      ctx.beginPath();
      for (let p = 0; p < 9; p++) {
        if (!scene.layout.shop.plots[p]) continue;
        diamond(ctx, { x0: (p % 3) * 12, y0: Math.floor(p / 3) * 12, x1: (p % 3) * 12 + 12, y1: Math.floor(p / 3) * 12 + 12 });
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (scene.showPath) {
      cellsPath(ctx, a.reach.reachable);
      ctx.fillStyle = PALETTE.reach;
      ctx.fill();
    }

    // Door: a mat on the inside cell and a marker on the outside one.
    const door = doorCells(g.door);
    ctx.beginPath();
    diamond(ctx, { x0: door.inside[0], y0: door.inside[1], x1: door.inside[0] + 1, y1: door.inside[1] + 1 });
    diamond(ctx, { x0: door.outside[0], y0: door.outside[1], x1: door.outside[0] + 1, y1: door.outside[1] + 1 });
    ctx.fillStyle = 'rgba(255,213,74,0.55)';
    ctx.fill();
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = PALETTE.door;
    ctx.stroke();

    const live = a.resolved.filter((r) => r.item.zone !== 'stored' && r.item.id !== scene.dragging);

    // Rugs lie flat under everything else.
    for (const r of depthSort(live.filter((r) => r.layer === 'rug'))) {
      const box = spriteBox(r.stage, r.rect, true);
      if (!box) continue;
      const mirror = isMirrored(r.stage, r.item.rot);
      drawImage(ctx, box.file, box.x, box.y, box.w, box.h, mirror);
      entries.push({ id: r.item.id, kind: 'rug', ...box, mirror });
    }

    // Footprint highlights on the floor.
    for (const r of live) {
      if (r.layer === 'wall') continue;
      const f = itemFlags(scene, r.item.id);
      if (!f.selected && !f.invalid && !f.unreachable) continue;
      ctx.beginPath();
      diamond(ctx, r.rect);
      ctx.fillStyle = f.invalid || f.unreachable ? PALETTE.bad : 'rgba(255,213,74,0.3)';
      ctx.fill();
      if (f.selected) {
        ctx.lineWidth = 2.5 * px;
        ctx.strokeStyle = PALETTE.selected;
        ctx.stroke();
      }
    }

    // Walls, wall decor and standing pieces in painter's order.
    const decorByWall = new Map<string, Resolved[]>();
    for (const r of live)
      if (r.layer === 'wall' && r.item.side) {
        const k = `${r.item.x},${r.item.y},${r.item.side}`;
        decorByWall.set(k, [...(decorByWall.get(k) ?? []), r]);
      }
    const nodes: Node[] = [
      ...g.walls.map((seg): Node => ({
        kind: 'wall',
        seg,
        decor: decorByWall.get(`${seg.x},${seg.y},${seg.side}`) ?? [],
        rect: seg.side === 'nx' ? { x0: seg.x - 0.05, y0: seg.y, x1: seg.x, y1: seg.y + 1 } : { x0: seg.x, y0: seg.y - 0.05, x1: seg.x + 1, y1: seg.y },
      })),
      ...live.filter((r) => r.layer === 'floor' || r.layer === 'outdoor').map((r): Node => ({ kind: 'object', r, rect: r.rect })),
    ];
    const badges: [number, number][] = [];
    for (const node of depthSort(nodes)) {
      if (node.kind === 'wall') {
        drawWall(ctx, scene, node.seg);
        for (const r of node.decor) {
          const box = wallDecorBox(r.stage, node.seg);
          if (!box) continue;
          const mirror = node.seg.side === 'nx';
          const f = itemFlags(scene, r.item.id);
          if (f.selected) {
            ctx.save();
            ctx.shadowColor = PALETTE.selected;
            ctx.shadowBlur = 14;
          }
          drawImage(ctx, box.file, box.x, box.y, box.w, box.h, mirror);
          if (f.selected) ctx.restore();
          if (f.invalid) badges.push([box.x + box.w / 2, box.y]);
          entries.push({ id: r.item.id, kind: 'walldeco', ...box, mirror });
        }
        continue;
      }
      const { r } = node;
      const box = spriteBox(r.stage, r.rect, false);
      if (!box) continue;
      const mirror = isMirrored(r.stage, r.item.rot);
      const f = itemFlags(scene, r.item.id);
      if (f.selected) {
        ctx.save();
        ctx.shadowColor = PALETTE.selected;
        ctx.shadowBlur = 16;
      }
      drawImage(ctx, box.file, box.x, box.y, box.w, box.h, mirror);
      if (f.selected) ctx.restore();
      if (f.invalid || f.unreachable) badges.push([box.x + box.w / 2, box.y + 4]);
      entries.push({ id: r.item.id, kind: 'object', ...box, mirror });
    }

    // Ghost of the piece being placed or dragged.
    if (scene.ghost) {
      const r = resolveItem(scene.ghost.item);
      if (r) {
        ctx.save();
        if (r.layer === 'wall' && r.item.side) {
          const seg = { x: r.item.x, y: r.item.y, side: r.item.side };
          const q = wallQuad(seg);
          ctx.beginPath();
          ctx.moveTo(q[0][0], q[0][1]);
          for (const p of q.slice(1)) ctx.lineTo(p[0], p[1]);
          ctx.closePath();
          ctx.fillStyle = scene.ghost.valid ? PALETTE.ok : PALETTE.bad;
          ctx.fill();
          const box = wallDecorBox(r.stage, seg);
          ctx.globalAlpha = 0.75;
          if (box) drawImage(ctx, box.file, box.x, box.y, box.w, box.h, seg.side === 'nx');
        } else {
          ctx.beginPath();
          diamond(ctx, r.rect);
          ctx.fillStyle = scene.ghost.valid ? PALETTE.ok : PALETTE.bad;
          ctx.fill();
          const box = spriteBox(r.stage, r.rect, r.layer === 'rug');
          ctx.globalAlpha = 0.7;
          if (box) drawImage(ctx, box.file, box.x, box.y, box.w, box.h, isMirrored(r.stage, r.item.rot));
        }
        ctx.restore();
      }
    }

    // Door picking: show every front edge, highlight the hovered one.
    if (scene.pickingDoor) {
      for (const f of g.fronts) {
        const hovered = scene.hoverDoor && f.x === scene.hoverDoor.x && f.y === scene.hoverDoor.y && f.side === scene.hoverDoor.side;
        const [x0, y0] = f.side === 'px' ? project(f.x + 1, f.y) : project(f.x, f.y + 1);
        const [x1, y1] = project(f.x + 1, f.y + 1);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineWidth = (hovered ? 8 : 3) * px;
        ctx.strokeStyle = hovered ? PALETTE.selected : 'rgba(255,213,74,0.6)';
        ctx.stroke();
      }
    }

    for (const [x, y] of badges) badge(ctx, x, y, scene.zoom);
    return entries;
  },

  pickWall(scene, wx, wy) {
    for (const seg of scene.analysis.geometry.walls) {
      const q = wallQuad(seg);
      // Wall quads are parallelograms: test with edge cross products.
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        const [ax, ay] = q[i];
        const [bx, by] = q[(i + 1) % 4];
        const cross = (bx - ax) * (wy - ay) - (by - ay) * (wx - ax);
        if (seg.side === 'ny' ? cross > 0 : cross < 0) inside = false;
      }
      if (inside) return seg;
    }
    return null;
  },

  pickFront(scene, wx, wy) {
    let best: DoorPos | null = null;
    let bestD = 40 * 40;
    for (const f of scene.analysis.geometry.fronts) {
      const [x0, y0] = f.side === 'px' ? project(f.x + 1, f.y) : project(f.x, f.y + 1);
      const [x1, y1] = project(f.x + 1, f.y + 1);
      const d = ((x0 + x1) / 2 - wx) ** 2 + ((y0 + y1) / 2 - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  },

  pickItem(scene, entries, wx, wy) {
    const hit = hitEntry(entries, wx, wy, alphaAt, ['object', 'walldeco']);
    if (hit) return hit;
    const [gx, gy] = unproject(wx, wy);
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    const under = scene.analysis.resolved.filter(
      (r) => r.item.zone !== 'stored' && r.layer !== 'wall' && cx >= r.rect.x0 && cx < r.rect.x1 && cy >= r.rect.y0 && cy < r.rect.y1,
    );
    return (under.find((r) => r.layer !== 'rug') ?? under[0])?.item.id ?? null;
  },
};
