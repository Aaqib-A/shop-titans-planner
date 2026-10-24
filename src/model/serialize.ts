// Layout persistence: a versioned JSON shape for files and localStorage, and
// a compact compressed form for share URLs.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { PLOTS } from './geometry';
import type { DoorPos, Layout, PlacedItem, ShopSettings, WallSide, Zone } from './types';

export const SCHEMA_VERSION = 1;

export interface LayoutFile {
  app: 'shop-titans-planner';
  version: number;
  layout: Layout;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultShop(): ShopSettings {
  return {
    plots: Array.from({ length: PLOTS * PLOTS }, () => true),
    door: { x: 17, y: 35, side: 'py' },
    expansion: 9,
    basement: 0,
    merchantLevel: 80,
    outdoorDepth: 4,
    floor: null,
    wall: null,
  };
}

export function newLayout(name = 'My shop'): Layout {
  const now = Date.now();
  return { id: newId(), name, createdAt: now, updatedAt: now, shop: defaultShop(), items: [] };
}

// --- validation -----------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);
const ZONES: Zone[] = ['floor', 'wall', 'outdoor', 'stored'];

function cleanItem(v: unknown): PlacedItem | null {
  if (!isObj(v) || typeof v.family !== 'string') return null;
  const zone = ZONES.includes(v.zone as Zone) ? (v.zone as Zone) : 'floor';
  const item: PlacedItem = {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    family: v.family,
    level: Math.max(1, int(v.level, 1)),
    x: int(v.x, 0),
    y: int(v.y, 0),
    rot: v.rot === 1 ? 1 : 0,
    zone,
  };
  if (v.side === 'nx' || v.side === 'ny') item.side = v.side;
  return item;
}

function cleanShop(v: unknown): ShopSettings {
  const d = defaultShop();
  if (!isObj(v)) return d;
  const plots = Array.isArray(v.plots) && v.plots.length === PLOTS * PLOTS ? v.plots.map(Boolean) : d.plots;
  const door = isObj(v.door) && (v.door.side === 'px' || v.door.side === 'py')
    ? { x: int(v.door.x, d.door.x), y: int(v.door.y, d.door.y), side: v.door.side as DoorPos['side'] }
    : d.door;
  return {
    plots,
    door,
    expansion: Math.max(1, int(v.expansion, d.expansion)),
    basement: Math.max(0, int(v.basement, d.basement)),
    merchantLevel: Math.max(1, int(v.merchantLevel, d.merchantLevel)),
    outdoorDepth: Math.max(0, int(v.outdoorDepth, d.outdoorDepth)),
    floor: typeof v.floor === 'string' ? v.floor : null,
    wall: typeof v.wall === 'string' ? v.wall : null,
  };
}

/** Accepts anything and returns a valid layout, or throws if it isn't one. */
export function cleanLayout(v: unknown): Layout {
  if (!isObj(v) || !Array.isArray(v.items)) throw new Error('Not a shop layout');
  const now = Date.now();
  const items = v.items.map(cleanItem).filter((i): i is PlacedItem => i !== null);
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) item.id = newId();
    seen.add(item.id);
  }
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 80) : 'Imported shop',
    createdAt: int(v.createdAt, now),
    updatedAt: int(v.updatedAt, now),
    shop: cleanShop(v.shop),
    items,
  };
}

/** Upgrades older file versions; there is only v1 so far. */
function migrate(file: Record<string, unknown>): unknown {
  const version = int(file.version, 1);
  if (version > SCHEMA_VERSION) throw new Error(`This file was made by a newer version (v${version}) of the planner`);
  return file.layout;
}

// --- JSON files -----------------------------------------------------------

export function toFile(layout: Layout): string {
  const file: LayoutFile = { app: 'shop-titans-planner', version: SCHEMA_VERSION, layout };
  return JSON.stringify(file, null, 2);
}

export function fromFile(text: string): Layout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  if (isObj(data) && data.app === 'shop-titans-planner') return cleanLayout(migrate(data));
  return cleanLayout(data);
}

// --- share URLs -----------------------------------------------------------
// Compact positional form: { v, n, s: [plots bitmask, door x, door y, door side,
// expansion, basement, merchant level, outdoor depth, floor, wall], i: [[family,
// level, x, y, rot, zone, side?]] }

const ZONE_CODE: Record<Zone, number> = { floor: 0, wall: 1, outdoor: 2, stored: 3 };
type CompactItem = [string, number, number, number, number, number, string?];

export function toShareString(layout: Layout): string {
  const { shop } = layout;
  const mask = shop.plots.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);
  const compact = {
    v: SCHEMA_VERSION,
    n: layout.name,
    s: [mask, shop.door.x, shop.door.y, shop.door.side, shop.expansion, shop.basement, shop.merchantLevel, shop.outdoorDepth, shop.floor, shop.wall],
    i: layout.items.map((it): CompactItem => {
      const row: CompactItem = [it.family, it.level, it.x, it.y, it.rot, ZONE_CODE[it.zone]];
      if (it.side) row.push(it.side);
      return row;
    }),
  };
  return compressToEncodedURIComponent(JSON.stringify(compact));
}

export function fromShareString(encoded: string): Layout {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) throw new Error('The share link is damaged or incomplete');
  const c = JSON.parse(json) as { v: number; n: string; s: unknown[]; i: CompactItem[] };
  if (c.v > SCHEMA_VERSION) throw new Error('This link was made by a newer version of the planner');
  const [mask, dx, dy, side, expansion, basement, merchantLevel, outdoorDepth, floor, wall] = c.s;
  const zones = Object.keys(ZONE_CODE) as Zone[];
  return cleanLayout({
    name: c.n,
    shop: {
      plots: Array.from({ length: PLOTS * PLOTS }, (_, i) => ((mask as number) & (1 << i)) !== 0),
      door: { x: dx, y: dy, side },
      expansion,
      basement,
      merchantLevel,
      outdoorDepth,
      floor,
      wall,
    },
    items: c.i.map(([family, level, x, y, rot, zone, wallSide]) => ({
      family,
      level,
      x,
      y,
      rot,
      zone: zones[zone] ?? 'floor',
      side: wallSide as WallSide | undefined,
    })),
  });
}

// --- localStorage ---------------------------------------------------------

const STORAGE_KEY = 'shop-titans-planner.v1';

export interface SavedState {
  layouts: Layout[];
  activeId: string;
}

export function loadSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { layouts?: unknown[]; activeId?: string };
    const layouts = (data.layouts ?? []).flatMap((l) => {
      try {
        return [cleanLayout(l)];
      } catch {
        return [];
      }
    });
    if (!layouts.length) return null;
    const activeId = layouts.some((l) => l.id === data.activeId) ? data.activeId! : layouts[0].id;
    return { layouts, activeId };
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
