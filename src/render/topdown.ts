// Top-down view: square cells, footprints as coloured blocks with the sprite
// inside. Easier for precise planning than the isometric view.
import { getCosmetic, spriteFor } from '../data/catalog';
import { type Resolved, type WallSeg, EXTENT, cellIndex, resolveItem } from '../model/geometry';
import type { DoorPos, Rect } from '../model/types';
import { alphaAt, getImage, getPatternSource } from './spriteCache';
import { type DrawEntry, type Renderer, type SceneInput, PALETTE, TYPE_COLORS, hitEntry, isMirrored, itemFlags } from './scene';

export const CELL = 24;
const WALL_T = 8;

const project = (gx: number, gy: number): [number, number] => [gx * CELL, gy * CELL];
const unproject = (wx: number, wy: number): [number, number] => [wx / CELL, wy / CELL];

const toPx = (r: Rect) => ({ x: r.x0 * CELL, y: r.y0 * CELL, w: (r.x1 - r.x0) * CELL, h: (r.y1 - r.y0) * CELL });

function wallRect(seg: WallSeg) {
  return seg.side === 'nx'
    ? { x: seg.x * CELL - WALL_T, y: seg.y * CELL, w: WALL_T, h: CELL }
    : { x: seg.x * CELL, y: seg.y * CELL - WALL_T, w: CELL, h: WALL_T };
}

function frontLine(f: DoorPos): [number, number, number, number] {
  return f.side === 'px'
    ? [(f.x + 1) * CELL, f.y * CELL, (f.x + 1) * CELL, (f.y + 1) * CELL]
    : [f.x * CELL, (f.y + 1) * CELL, (f.x + 1) * CELL, (f.y + 1) * CELL];
}

function contain(file: string, sw: number, sh: number, box: { x: number; y: number; w: number; h: number }, pad: number) {
  const s = Math.min((box.w - pad * 2) / sw, (box.h - pad * 2) / sh);
  const w = sw * s;
  const h = sh * s;
  return { file, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function drawImage(ctx: CanvasRenderingContext2D, file: string, x: number, y: number, w: number, h: number, mirror: boolean, quarter = false) {
  const img = getImage(file);
  if (!img) return;
  if (quarter) {
    // Draw rotated 90° so a wide sprite fills a tall footprint; (x, y, w, h) is the rotated box.
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(Math.PI / 2);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, -h / 2, -w / 2, h, w);
    ctx.restore();
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawPiece(ctx: CanvasRenderingContext2D, scene: SceneInput, r: Resolved, entries: DrawEntry[] | null, alpha = 1) {
  const box = toPx(r.rect);
  const color = TYPE_COLORS[r.family.type];
  const f = itemFlags(scene, r.item.id);
  const px = 1 / scene.zoom;
  ctx.save();
  ctx.globalAlpha = alpha;
  const inset = r.layer === 'rug' ? 0.5 : 1.5;
  roundRect(ctx, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, r.layer === 'rug' ? 2 : 4);
  ctx.fillStyle = r.layer === 'rug' ? `${color}40` : `${color}55`;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * px);
  ctx.strokeStyle = f.invalid || f.unreachable ? PALETTE.warn : color;
  if (r.layer === 'rug') ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  const sprite = spriteFor(r.stage);
  const mirror = isMirrored(r.stage, r.item.rot);
  if (sprite) {
    // Turn wide sprites to follow tall footprints.
    const quarter = box.h > box.w * 1.3 && sprite.w > sprite.h;
    const img = quarter
      ? contain(sprite.file, sprite.h, sprite.w, box, Math.min(box.w, box.h) * 0.08)
      : contain(sprite.file, sprite.w, sprite.h, box, Math.min(box.w, box.h) * 0.08);
    if (r.layer === 'rug') ctx.globalAlpha = alpha * 0.85;
    drawImage(ctx, img.file, img.x, img.y, img.w, img.h, mirror, quarter);
    entries?.push({ id: r.item.id, kind: r.layer === 'rug' ? 'rug' : 'object', ...box, file: null, mirror });
  } else entries?.push({ id: r.item.id, kind: r.layer === 'rug' ? 'rug' : 'object', ...box, file: null, mirror });
  if (f.invalid || f.unreachable) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(240,80,80,0.28)';
    roundRect(ctx, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, 4);
    ctx.fill();
  }
  if (r.family.maxLevel > 1 && scene.zoom * CELL >= 14) {
    const label = `${r.item.level}`;
    ctx.font = `bold ${10}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(20,16,12,0.85)';
    roundRect(ctx, box.x + box.w - tw - 2, box.y + box.h - 14, tw, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, box.x + box.w - tw / 2 - 2, box.y + box.h - 8);
  }
  if (f.selected) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5 * px;
    ctx.strokeStyle = PALETTE.selected;
    roundRect(ctx, box.x, box.y, box.w, box.h, 4);
    ctx.stroke();
  }
  ctx.restore();
}

export const topRenderer: Renderer = {
  project,
  unproject,

  worldBounds(g) {
    const b = g.bounds;
    return { x: b.x0 * CELL - 30, y: b.y0 * CELL - 30, w: (b.x1 - b.x0) * CELL + 60, h: (b.y1 - b.y0) * CELL + 60 };
  },

  itemBounds(r) {
    if (r.layer === 'wall' && r.item.side) return wallRect({ x: r.item.x, y: r.item.y, side: r.item.side });
    return toPx(r.rect);
  },

  draw(ctx, scene) {
    const { analysis: a } = scene;
    const g = a.geometry;
    const entries: DrawEntry[] = [];
    const px = 1 / scene.zoom;

    ctx.fillStyle = PALETTE.outdoor;
    for (let y = 0; y < EXTENT; y++)
      for (let x = 0; x < EXTENT; x++) if (g.outdoor[cellIndex(x, y)]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

    const cos = getCosmetic('floor', scene.layout.shop.floor);
    const src = cos && getPatternSource('floor', cos.file);
    const pattern = src && ctx.createPattern(src, 'repeat');
    if (pattern && src) pattern.setTransform(new DOMMatrix([(CELL * 2) / src.width, 0, 0, (CELL * 2) / src.height, 0, 0]));
    ctx.fillStyle = pattern || PALETTE.floor;
    ctx.beginPath();
    for (let y = 0; y < EXTENT; y++)
      for (let x = 0; x < EXTENT; x++) if (g.floor[cellIndex(x, y)]) ctx.rect(x * CELL, y * CELL, CELL, CELL);
    ctx.fill();

    if (scene.showPath) {
      ctx.fillStyle = PALETTE.reach;
      for (let y = 0; y < EXTENT; y++)
        for (let x = 0; x < EXTENT; x++) if (a.reach.reachable[cellIndex(x, y)]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }

    if (scene.showGrid) {
      ctx.lineWidth = px;
      ctx.strokeStyle = PALETTE.grid;
      ctx.beginPath();
      for (let y = 0; y < EXTENT; y++)
        for (let x = 0; x < EXTENT; x++)
          if (g.floor[cellIndex(x, y)] || g.outdoor[cellIndex(x, y)]) ctx.rect(x * CELL, y * CELL, CELL, CELL);
      ctx.stroke();
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = PALETTE.plotLine;
      ctx.setLineDash([6 * px, 6 * px]);
      ctx.beginPath();
      for (let p = 0; p < 9; p++)
        if (scene.layout.shop.plots[p]) ctx.rect((p % 3) * 12 * CELL, Math.floor(p / 3) * 12 * CELL, 12 * CELL, 12 * CELL);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Back walls.
    const wallCos = getCosmetic('wall', scene.layout.shop.wall);
    const wallSrc = wallCos && getPatternSource('wall', wallCos.file);
    ctx.fillStyle = PALETTE.wall;
    if (wallSrc) {
      const p = ctx.createPattern(wallSrc, 'repeat');
      if (p) {
        p.setTransform(new DOMMatrix([(CELL * 2) / wallSrc.width, 0, 0, (CELL * 2) / wallSrc.height, 0, 0]));
        ctx.fillStyle = p;
      }
    }
    for (const seg of g.walls) {
      const w = wallRect(seg);
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
    ctx.fillStyle = PALETTE.wallTop;
    for (const seg of g.walls) {
      const w = wallRect(seg);
      if (seg.side === 'nx') ctx.fillRect(w.x, w.y, 2, w.h);
      else ctx.fillRect(w.x, w.y, w.w, 2);
    }

    // Door: a thick bar on the front edge with an arrow pointing in.
    const [dx0, dy0, dx1, dy1] = frontLine(g.door);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.door;
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.stroke();
    ctx.lineCap = 'butt';
    {
      const mx = (dx0 + dx1) / 2;
      const my = (dy0 + dy1) / 2;
      const [ox, oy] = g.door.side === 'py' ? [0, 1] : [1, 0];
      const tip = 10;
      const back = 26;
      ctx.beginPath();
      ctx.moveTo(mx + ox * tip, my + oy * tip);
      ctx.lineTo(mx + ox * back - oy * 9, my + oy * back - ox * 9);
      ctx.lineTo(mx + ox * back + oy * 9, my + oy * back + ox * 9);
      ctx.closePath();
      ctx.fillStyle = PALETTE.door;
      ctx.fill();
    }

    const live = a.resolved.filter((r) => r.item.zone !== 'stored' && r.item.id !== scene.dragging);
    for (const r of live) if (r.layer === 'rug') drawPiece(ctx, scene, r, entries);
    for (const r of live) if (r.layer === 'floor' || r.layer === 'outdoor') drawPiece(ctx, scene, r, entries);
    for (const r of live) {
      if (r.layer !== 'wall' || !r.item.side) continue;
      const w = wallRect({ x: r.item.x, y: r.item.y, side: r.item.side });
      const sprite = spriteFor(r.stage);
      const size = CELL * 0.95;
      const box = { x: w.x + w.w / 2 - size / 2, y: w.y + w.h / 2 - size / 2, w: size, h: size };
      const f = itemFlags(scene, r.item.id);
      ctx.fillStyle = f.invalid ? PALETTE.warn : TYPE_COLORS.walldeco;
      roundRect(ctx, box.x, box.y, box.w, box.h, 4);
      ctx.fill();
      if (sprite) {
        const img = contain(sprite.file, sprite.w, sprite.h, box, 2);
        drawImage(ctx, img.file, img.x, img.y, img.w, img.h, r.item.side === 'nx');
      }
      if (f.selected) {
        ctx.lineWidth = 2.5 * px;
        ctx.strokeStyle = PALETTE.selected;
        ctx.stroke();
      }
      entries.push({ id: r.item.id, kind: 'walldeco', ...box, file: null, mirror: false });
    }

    if (scene.ghost) {
      const r = resolveItem(scene.ghost.item);
      if (r) {
        if (r.layer === 'wall' && r.item.side) {
          const w = wallRect({ x: r.item.x, y: r.item.y, side: r.item.side });
          ctx.fillStyle = scene.ghost.valid ? PALETTE.ok : PALETTE.bad;
          ctx.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
        } else {
          const box = toPx(r.rect);
          ctx.fillStyle = scene.ghost.valid ? PALETTE.ok : PALETTE.bad;
          ctx.fillRect(box.x, box.y, box.w, box.h);
          drawPiece(ctx, { ...scene, selected: null }, r, null, 0.75);
        }
      }
    }

    if (scene.pickingDoor) {
      for (const f of g.fronts) {
        const hovered = scene.hoverDoor && f.x === scene.hoverDoor.x && f.y === scene.hoverDoor.y && f.side === scene.hoverDoor.side;
        const [x0, y0, x1, y1] = frontLine(f);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineWidth = hovered ? 8 : 3;
        ctx.strokeStyle = hovered ? PALETTE.selected : 'rgba(255,213,74,0.6)';
        ctx.stroke();
      }
    }
    return entries;
  },

  pickWall(scene, wx, wy) {
    let best: WallSeg | null = null;
    let bestD = Infinity;
    for (const seg of scene.analysis.geometry.walls) {
      const w = wallRect(seg);
      const pad = 10;
      if (wx < w.x - pad || wx > w.x + w.w + pad || wy < w.y - pad || wy > w.y + w.h + pad) continue;
      const d = (w.x + w.w / 2 - wx) ** 2 + (w.y + w.h / 2 - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = seg;
      }
    }
    return best;
  },

  pickFront(scene, wx, wy) {
    let best: DoorPos | null = null;
    let bestD = 20 * 20;
    for (const f of scene.analysis.geometry.fronts) {
      const [x0, y0, x1, y1] = frontLine(f);
      const d = ((x0 + x1) / 2 - wx) ** 2 + ((y0 + y1) / 2 - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  },

  pickItem(_scene, entries, wx, wy) {
    return hitEntry(entries, wx, wy, alphaAt, ['walldeco', 'object']) ?? hitEntry(entries, wx, wy, alphaAt, ['rug']);
  },
};
