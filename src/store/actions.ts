// Edit operations on the active layout, shared by the canvas, panels and
// keyboard shortcuts.
import { clampLevel, getFamily } from '../data/catalog';
import { type Resolved, type WallSeg, checkPlacement, defaultDoor, buildGeometry, layerOf, resolveItem } from '../model/geometry';
import { newId } from '../model/serialize';
import type { PlacedItem, ShopSettings, WallSide, Zone } from '../model/types';
import { analysisFor, getActiveLayout, useLayoutStore } from './layoutStore';
import { useUiStore } from './uiStore';

export function zoneForFamily(familyId: string): Zone {
  const fam = getFamily(familyId);
  if (!fam) return 'floor';
  const layer = layerOf(fam.type);
  return layer === 'wall' ? 'wall' : layer === 'outdoor' ? 'outdoor' : 'floor';
}

const commit = (recipe: Parameters<ReturnType<typeof useLayoutStore.getState>['commit']>[0]) =>
  useLayoutStore.getState().commit(recipe);
const notify = (text: string) => useUiStore.getState().notify(text);

/** Resolved pieces on the map, optionally without one of them. */
function placedExcept(id?: string): Resolved[] {
  return analysisFor(getActiveLayout()).resolved.filter((r) => r.item.id !== id && r.item.zone !== 'stored');
}

export function validate(candidate: PlacedItem, ignoreId?: string) {
  const r = resolveItem(candidate);
  if (!r) return { ok: false, reason: 'unknown piece' };
  return checkPlacement(analysisFor(getActiveLayout()).geometry, placedExcept(ignoreId ?? candidate.id), r);
}

/** Nearest valid spot to `item`'s position, searching outward ring by ring. */
export function findFreeSpot(item: PlacedItem, ignoreId?: string): { x: number; y: number; side?: WallSide } | null {
  const { geometry } = analysisFor(getActiveLayout());
  if (item.zone === 'wall') {
    const free = geometry.walls
      .map((w): WallSeg & { d: number } => ({ ...w, d: Math.abs(w.x - item.x) + Math.abs(w.y - item.y) + (w.side === item.side ? 0 : 0.5) }))
      .sort((a, b) => a.d - b.d)
      .find((w) => validate({ ...item, x: w.x, y: w.y, side: w.side }, ignoreId).ok);
    return free ? { x: free.x, y: free.y, side: free.side } : null;
  }
  for (let radius = 0; radius < 48; radius++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const pos = { x: item.x + dx, y: item.y + dy };
        if (validate({ ...item, ...pos }, ignoreId).ok) return pos;
      }
  return null;
}

export function placeNew(family: string, level: number, x: number, y: number, rot: 0 | 1, side?: WallSide): string | null {
  const fam = getFamily(family);
  if (!fam) return null;
  const item: PlacedItem = { id: newId(), family, level: clampLevel(fam, level), x, y, rot, zone: zoneForFamily(family) };
  if (item.zone === 'wall') item.side = side;
  const check = validate(item);
  if (!check.ok) {
    notify(`Can't place ${fam.name} here: ${check.reason}`);
    return null;
  }
  commit((d) => {
    d.items.push(item);
  });
  return item.id;
}

function update(id: string, patch: Partial<PlacedItem>) {
  commit((d) => {
    const it = d.items.find((i) => i.id === id);
    if (it) Object.assign(it, patch);
  });
}

export function findItem(id: string): PlacedItem | undefined {
  return getActiveLayout().items.find((i) => i.id === id);
}

export function moveItem(id: string, x: number, y: number, side?: WallSide): boolean {
  const it = findItem(id);
  if (!it) return false;
  const moved = { ...it, x, y, ...(side ? { side } : {}) };
  if (!validate(moved).ok) return false;
  if (moved.x !== it.x || moved.y !== it.y || moved.side !== it.side) update(id, { x, y, ...(side ? { side } : {}) });
  return true;
}

export function nudge(id: string, dx: number, dy: number) {
  const it = findItem(id);
  if (!it || it.zone === 'stored' || it.zone === 'wall') return;
  if (!moveItem(id, it.x + dx, it.y + dy)) notify('Blocked');
}

export function rotateItem(id: string) {
  const it = findItem(id);
  if (!it || it.zone === 'wall') return;
  const rot: 0 | 1 = it.rot ? 0 : 1;
  if (it.zone === 'stored' || validate({ ...it, rot }).ok) {
    update(id, { rot });
    return;
  }
  const spot = findFreeSpot({ ...it, rot }, id);
  if (spot && Math.abs(spot.x - it.x) + Math.abs(spot.y - it.y) <= 4) update(id, { rot, ...spot });
  else notify('No room to rotate here');
}

export function setLevel(id: string, level: number) {
  const it = findItem(id);
  const fam = it && getFamily(it.family);
  if (!it || !fam) return;
  update(id, { level: clampLevel(fam, level) });
}

export function deleteItem(id: string) {
  commit((d) => {
    d.items = d.items.filter((i) => i.id !== id);
  });
  const ui = useUiStore.getState();
  if (ui.selected === id) ui.set({ selected: null });
}

export function duplicateItem(id: string): string | null {
  const it = findItem(id);
  if (!it) return null;
  const copy: PlacedItem = { ...it, id: newId() };
  if (it.zone !== 'stored') {
    const spot = findFreeSpot(copy);
    if (!spot) {
      copy.zone = 'stored';
      notify('No free spot, so the copy went to the basement');
    } else Object.assign(copy, spot);
  }
  commit((d) => {
    d.items.push(copy);
  });
  useUiStore.getState().set({ selected: copy.id });
  return copy.id;
}

export function storeItem(id: string) {
  update(id, { zone: 'stored' });
}

export function restoreItem(id: string) {
  const it = findItem(id);
  if (!it) return;
  const zone = zoneForFamily(it.family);
  const candidate = { ...it, zone, side: zone === 'wall' ? (it.side ?? 'ny') : undefined };
  const spot = findFreeSpot(candidate, id);
  if (!spot) {
    notify('No free spot to put it back');
    return;
  }
  update(id, { zone, ...spot, ...(zone === 'wall' ? {} : { side: undefined }) });
}

export function updateShop(patch: Partial<ShopSettings>) {
  commit((d) => {
    Object.assign(d.shop, patch);
    if (patch.plots) {
      const g = buildGeometry(d.shop);
      if (!g.doorValid) d.shop.door = defaultDoor(g.fronts);
    }
  });
}

export function clearItems() {
  commit((d) => {
    d.items = [];
  });
  useUiStore.getState().set({ selected: null });
}
