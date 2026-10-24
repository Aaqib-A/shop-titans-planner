import { useCallback, useEffect, useRef, useState } from 'react';
import { getFamily, stageFor } from '../data/catalog';
import { footprintSize } from '../model/geometry';
import type { DoorPos, PlacedItem } from '../model/types';
import { placeNew, moveItem, updateShop, validate, zoneForFamily } from '../store/actions';
import { analysisFor, getActiveLayout, useLayoutStore } from '../store/layoutStore';
import { type ViewKind, useUiStore } from '../store/uiStore';
import { isoRenderer } from './iso';
import type { DrawEntry, Ghost, Renderer, SceneInput } from './scene';
import { onImageLoad } from './spriteCache';
import { topRenderer } from './topdown';

export const renderers: Record<ViewKind, Renderer> = { iso: isoRenderer, top: topRenderer };
export const FAMILY_MIME = 'application/x-shop-family';

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number; moved: boolean }
  | { kind: 'drag'; id: string; sx: number; sy: number; offX: number; offY: number; moved: boolean };

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 5;

export function buildScene(overrides: Partial<SceneInput> = {}): SceneInput {
  const layout = getActiveLayout();
  const ui = useUiStore.getState();
  return {
    layout,
    analysis: analysisFor(layout),
    selected: ui.selected,
    ghost: null,
    dragging: null,
    pickingDoor: ui.pickingDoor,
    hoverDoor: null,
    showGrid: ui.showGrid,
    showPath: ui.showPath,
    zoom: 1,
    ...overrides,
  };
}

export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const armed = useUiStore((s) => s.armed);
  const pickingDoor = useUiStore((s) => s.pickingDoor);
  const cameras = useRef<Record<ViewKind, Camera | null>>({ iso: null, top: null });
  const interaction = useRef<Interaction>({ kind: 'none' });
  const ghost = useRef<Ghost | null>(null);
  const dragging = useRef<string | null>(null);
  const hoverDoor = useRef<DoorPos | null>(null);
  const entries = useRef<DrawEntry[]>([]);
  const lastPointer = useRef<{ wx: number; wy: number } | null>(null);
  const frame = useRef(0);
  const [tip, setTip] = useState<{ text: string; x: number; y: number; bad: boolean } | null>(null);


  const size = () => {
    const el = wrapRef.current;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  };

  const fit = useCallback((v: ViewKind): Camera => {
    const r = renderers[v];
    const b = r.worldBounds(analysisFor(getActiveLayout()).geometry);
    const { w, h } = size();
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(w / b.w, h / b.h) * 0.96));
    const cam = { zoom, x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + b.h / 2) * zoom };
    cameras.current[v] = cam;
    return cam;
  }, []);

  const camera = useCallback((): Camera => cameras.current[useUiStore.getState().view] ?? fit(useUiStore.getState().view), [fit]);

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const v = useUiStore.getState().view;
    const { w, h } = size();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const cam = camera();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
    ctx.imageSmoothingQuality = 'high';
    const scene = buildScene({ ghost: ghost.current, dragging: dragging.current, hoverDoor: hoverDoor.current, zoom: cam.zoom });
    entries.current = renderers[v].draw(ctx, scene);
  }, [camera]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // Redraw on any state change, image load or resize.
  useEffect(() => {
    const unsubs = [useLayoutStore.subscribe(schedule), useUiStore.subscribe(schedule), onImageLoad(schedule)];
    const ro = new ResizeObserver(schedule);
    if (wrapRef.current) ro.observe(wrapRef.current);
    schedule();
    return () => {
      unsubs.forEach((u) => u());
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule]);

  // Fit requests, and centring on an item.
  useEffect(
    () =>
      useUiStore.subscribe((s, prev) => {
        if (s.fitRequest !== prev.fitRequest) fit(s.view);
        if (s.focus && s.focus !== prev.focus) {
          const r = analysisFor(getActiveLayout()).byId.get(s.focus.id);
          if (r && r.item.zone !== 'stored') {
            const cam = camera();
            const b = renderers[s.view].itemBounds(r);
            const { w, h } = size();
            cameras.current[s.view] = { ...cam, x: w / 2 - (b.x + b.w / 2) * cam.zoom, y: h / 2 - (b.y + b.h / 2) * cam.zoom };
          }
        }
      }),
    [fit, camera],
  );

  // Re-fit when switching to another layout.
  useEffect(
    () =>
      useLayoutStore.subscribe((s, prev) => {
        if (s.activeId !== prev.activeId) {
          cameras.current = { iso: null, top: null };
          schedule();
        }
      }),
    [schedule],
  );

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cam = camera();
    return { wx: (clientX - rect.left - cam.x) / cam.zoom, wy: (clientY - rect.top - cam.y) / cam.zoom, sx: clientX - rect.left, sy: clientY - rect.top };
  };

  /** Candidate position for a piece under the pointer. */
  const candidate = (family: string, level: number, rot: 0 | 1, wx: number, wy: number, base?: PlacedItem, offset?: { x: number; y: number }): Ghost | null => {
    const fam = getFamily(family);
    if (!fam) return null;
    const r = renderers[useUiStore.getState().view];
    const scene = buildScene();
    const zone = base?.zone === 'stored' ? zoneForFamily(family) : (base?.zone ?? zoneForFamily(family));
    const item: PlacedItem = base ? { ...base, zone } : { id: '__ghost__', family, level, x: 0, y: 0, rot, zone };
    if (zone === 'wall') {
      const seg = r.pickWall(scene, wx, wy);
      if (!seg) return null;
      Object.assign(item, { x: seg.x, y: seg.y, side: seg.side });
    } else {
      const [gx, gy] = r.unproject(wx, wy);
      const fp = footprintSize(stageFor(fam, item.level), item.rot);
      const off = offset ?? { x: fp.w / 2, y: fp.l / 2 };
      item.x = Math.round(gx - off.x);
      item.y = Math.round(gy - off.y);
    }
    return { item, valid: validate(item, base?.id).ok };
  };

  const showTip = (g: Ghost | null, sx: number, sy: number) => {
    if (!g) return setTip(null);
    const name = getFamily(g.item.family)?.name ?? '';
    const reason = g.valid ? null : validate(g.item, g.item.id).reason;
    setTip((t) => {
      const text = reason ? `${name}: ${reason}` : name;
      if (t && t.text === text && Math.abs(t.x - sx) < 2 && Math.abs(t.y - sy) < 2) return t;
      return { text, x: sx, y: sy, bad: !!reason };
    });
  };

  const refreshArmedGhost = useCallback(() => {
    const a = useUiStore.getState().armed;
    const p = lastPointer.current;
    if (!a || !p || interaction.current.kind === 'drag') return;
    ghost.current = candidate(a.family, a.level, a.rot, p.wx, p.wy);
    schedule();
  }, [schedule]);

  useEffect(() => {
    if (!armed) {
      if (interaction.current.kind !== 'drag') ghost.current = null;
      setTip(null);
    }
    refreshArmedGhost();
  }, [armed, refreshArmedGhost]);

  // --- pointer handling ---------------------------------------------------

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    const { wx, wy } = toWorld(e.clientX, e.clientY);
    const ui = useUiStore.getState();
    const cam = camera();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.altKey) {
      interaction.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: true };
      return;
    }
    if (ui.pickingDoor) {
      const door = renderers[ui.view].pickFront(buildScene(), wx, wy);
      if (door) {
        updateShop({ door });
        ui.set({ pickingDoor: false });
        ui.notify('Door moved');
      }
      return;
    }
    if (ui.armed) {
      const g = candidate(ui.armed.family, ui.armed.level, ui.armed.rot, wx, wy);
      if (g) {
        const id = placeNew(g.item.family, g.item.level, g.item.x, g.item.y, g.item.rot, g.item.side);
        if (id) ui.set({ selected: id });
      }
      return;
    }
    const hit = renderers[ui.view].pickItem(buildScene(), entries.current, wx, wy);
    if (hit) {
      const it = getActiveLayout().items.find((i) => i.id === hit);
      ui.set({ selected: hit });
      if (it) {
        const [gx, gy] = renderers[ui.view].unproject(wx, wy);
        interaction.current = { kind: 'drag', id: hit, sx: e.clientX, sy: e.clientY, offX: gx - it.x, offY: gy - it.y, moved: false };
      }
      return;
    }
    interaction.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { wx, wy, sx, sy } = toWorld(e.clientX, e.clientY);
    lastPointer.current = { wx, wy };
    const ui = useUiStore.getState();
    const act = interaction.current;
    if (act.kind === 'pan') {
      const dx = e.clientX - act.sx;
      const dy = e.clientY - act.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) act.moved = true;
      if (act.moved) {
        const cam = camera();
        cameras.current[ui.view] = { ...cam, x: act.cx + dx, y: act.cy + dy };
        schedule();
      }
      return;
    }
    if (act.kind === 'drag') {
      if (!act.moved && Math.abs(e.clientX - act.sx) + Math.abs(e.clientY - act.sy) > 4) act.moved = true;
      if (!act.moved) return;
      const it = getActiveLayout().items.find((i) => i.id === act.id);
      if (!it) return;
      dragging.current = it.zone === 'stored' ? null : it.id;
      ghost.current = candidate(it.family, it.level, it.rot, wx, wy, it, { x: act.offX, y: act.offY });
      showTip(ghost.current, sx, sy);
      schedule();
      return;
    }
    if (ui.pickingDoor) {
      hoverDoor.current = renderers[ui.view].pickFront(buildScene(), wx, wy);
      schedule();
      return;
    }
    if (ui.armed) {
      ghost.current = candidate(ui.armed.family, ui.armed.level, ui.armed.rot, wx, wy);
      showTip(ghost.current, sx, sy);
      schedule();
    }
  };

  const endInteraction = (commit: boolean) => {
    const act = interaction.current;
    interaction.current = { kind: 'none' };
    if (act.kind === 'drag' && act.moved) {
      const g = ghost.current;
      if (commit && g) {
        if (g.valid) moveItem(act.id, g.item.x, g.item.y, g.item.side);
        else useUiStore.getState().notify(`Can't move there: ${validate(g.item, act.id).reason}`);
      }
      ghost.current = null;
      dragging.current = null;
      setTip(null);
      schedule();
    }
    if (act.kind === 'pan' && !act.moved && commit) useUiStore.getState().set({ selected: null });
  };

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = camera();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
      const k = zoom / cam.zoom;
      cameras.current[useUiStore.getState().view] = { zoom, x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k };
      schedule();
    },
    [camera, schedule],
  );

  useEffect(() => {
    const c = canvasRef.current;
    c?.addEventListener('wheel', onWheel, { passive: false });
    return () => c?.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const zoomBy = (factor: number) => {
    const cam = camera();
    const { w, h } = size();
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
    const k = zoom / cam.zoom;
    cameras.current[useUiStore.getState().view] = { zoom, x: w / 2 - (w / 2 - cam.x) * k, y: h / 2 - (h / 2 - cam.y) * k };
    schedule();
  };

  // --- drag and drop from the catalog --------------------------------------

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(FAMILY_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const a = useUiStore.getState().armed;
    if (!a) return;
    const { wx, wy, sx, sy } = toWorld(e.clientX, e.clientY);
    lastPointer.current = { wx, wy };
    ghost.current = candidate(a.family, a.level, a.rot, wx, wy);
    showTip(ghost.current, sx, sy);
    schedule();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const a = useUiStore.getState().armed;
    const { wx, wy } = toWorld(e.clientX, e.clientY);
    if (a) {
      const g = candidate(a.family, a.level, a.rot, wx, wy);
      if (g) {
        const id = placeNew(g.item.family, g.item.level, g.item.x, g.item.y, g.item.rot, g.item.side);
        if (id) useUiStore.getState().set({ selected: id });
      }
    }
    useUiStore.getState().set({ armed: null });
    ghost.current = null;
    setTip(null);
    schedule();
  };

  const showGrid = useUiStore((s) => s.showGrid);
  const showPath = useUiStore((s) => s.showPath);
  const setUi = useUiStore((s) => s.set);
  const armedName = armed ? getFamily(armed.family)?.name : null;

  return (
    <div className={`canvas-wrap${armed ? ' is-placing' : ''}${pickingDoor ? ' is-door' : ''}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endInteraction(true)}
        onPointerCancel={() => endInteraction(false)}
        onPointerLeave={() => {
          if (useUiStore.getState().armed && interaction.current.kind === 'none') {
            ghost.current = null;
            setTip(null);
            schedule();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          endInteraction(false);
          setUi({ armed: null, pickingDoor: false });
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={() => {
          ghost.current = null;
          setTip(null);
          schedule();
        }}
      />
      {tip && (
        <div className={`canvas-tip${tip.bad ? ' bad' : ''}`} style={{ left: tip.x + 16, top: tip.y + 16 }}>
          {tip.text}
        </div>
      )}
      {(armedName || pickingDoor) && (
        <div className="canvas-hint">
          {pickingDoor ? (
            <>Click a front edge of the shop to move the door. Right-click or Esc to cancel.</>
          ) : (
            <>
              Placing <b>{armedName}</b>: click to place, <kbd>R</kbd> rotates, <kbd>Esc</kbd> or right-click stops.
            </>
          )}
        </div>
      )}
      <div className="canvas-tools">
        <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" title="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button type="button" title="Fit the shop (F)" onClick={() => useUiStore.getState().requestFit()}>
          Fit
        </button>
        <button type="button" className={showGrid ? 'on' : ''} title="Grid lines (G)" onClick={() => setUi({ showGrid: !showGrid })}>
          Grid
        </button>
        <button
          type="button"
          className={showPath ? 'on' : ''}
          title="Shade the floor customers can reach from the door (P)"
          onClick={() => setUi({ showPath: !showPath })}
        >
          Path
        </button>
      </div>
    </div>
  );
}
