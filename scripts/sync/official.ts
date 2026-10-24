// Furniture catalog from the official site, playshoptitans.com. Each category
// page is a Next.js page that embeds the game's furniture records as JSON in
// <script id="__NEXT_DATA__">.
import type { Availability, FurnitureDef, FurnitureType } from '../../src/data/schema.ts';
import { FURNITURE_TYPES } from '../../src/data/schema.ts';
import { fetchText } from './http.ts';

export const OFFICIAL_BASE = 'https://playshoptitans.com';

// Raw record as served by the site; only the fields we read are typed.
export interface RawFurniture {
  uid: string;
  type: string;
  family: string;
  prefab: string | null;
  isSpecial: boolean;
  events: string | null;
  prohibited: boolean;
  level: number;
  lock: boolean;
  excl: string | null;
  releaseAt: string | null;
  max: number;
  reqLevel: string | null;
  xtraPrice: string | null;
  next: string | null;
  length: number;
  width: number;
  prestige: number;
  prestigePerLevel: number;
  inspectEnergy: string | null;
  maxVisitors: number;
  maxItems: number;
  detail: string | null;
  shardPrice: number;
  energyCap: number;
  energyCapLvl: number;
  energyCapBonus: number;
  energyBonus: number;
  energyBonusLvl: number;
  storageBase: string | null;
  storagePerLevel: string | null;
  [key: string]: unknown;
}

interface NextData {
  props: { pageProps: { furniture: RawFurniture[]; texts: Record<string, string> } };
}

export function extractNextData(html: string): NextData {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No __NEXT_DATA__ script found; the official site layout may have changed');
  return JSON.parse(m[1]) as NextData;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function availability(r: RawFurniture): Availability {
  if (!r.lock) return 'store';
  if (r.events) return 'event';
  if (r.excl === 'pack') return 'pack';
  return 'locked';
}

function levelCosts(r: RawFurniture, prefix: string): number[] {
  return [1, 2, 3, 4, 5].map((i) => num(r[`${prefix}${i}`]));
}

export function normalize(raw: RawFurniture[], texts: Record<string, string>): FurnitureDef[] {
  const byFamily = new Map<string, RawFurniture[]>();
  for (const r of raw) {
    if (r.prohibited) continue;
    const list = byFamily.get(r.family) ?? [];
    list.push(r);
    byFamily.set(r.family, list);
  }
  const defs: FurnitureDef[] = [];
  for (const [family, records] of byFamily) {
    records.sort((a, b) => a.level - b.level);
    records.forEach((r, i) => {
      if (!(FURNITURE_TYPES as readonly string[]).includes(r.type)) return;
      const formula: FurnitureDef['formula'] = {};
      if (r.energyCap && r.type !== 'counter') formula.energyCap = [r.energyCap, num(r.energyCapLvl)];
      if (r.type === 'counter') formula.energyBonus = [num(r.energyBonus), num(r.energyBonusLvl)];
      if (r.storageBase != null) formula.storage = [num(r.storageBase), num(r.storagePerLevel)];
      if (r.energyCapBonus) formula.energyCapBonus = r.energyCapBonus;
      defs.push({
        uid: r.uid,
        family,
        type: r.type as FurnitureType,
        name: texts[`${r.uid}_name`] ?? texts[`${family}_name`] ?? r.uid,
        w: r.width,
        l: r.length,
        level: r.level || 1,
        stage: i + 1,
        sprite: r.prefab ?? r.uid,
        reqLevel: num(r.reqLevel) || 1,
        prestige: num(r.prestige),
        prestigePerLevel: num(r.prestigePerLevel),
        price: { gold: num(r.gold1), gems: num(r.gems1), shards: num(r.shardPrice) },
        xtraPrice: r.xtraPrice ? r.xtraPrice.split(',').map(num) : [],
        max: num(r.max),
        maxVisitors: num(r.maxVisitors),
        maxItems: num(r.maxItems),
        inspectEnergy: num(r.inspectEnergy),
        resource: r.detail ?? null,
        event: r.events ?? null,
        availability: availability(r),
        releaseAt: r.releaseAt ?? null,
        upgrade: {
          gold: levelCosts(r, 'gold'),
          gems: levelCosts(r, 'gems'),
          dragonmarks: levelCosts(r, 'demblem'),
          time: levelCosts(r, 'time'),
        },
        formula,
      });
    });
  }
  const typeOrder = new Map(FURNITURE_TYPES.map((t, i) => [t, i]));
  return defs.sort(
    (a, b) =>
      typeOrder.get(a.type)! - typeOrder.get(b.type)! ||
      a.family.localeCompare(b.family) ||
      a.level - b.level,
  );
}

export async function fetchOfficialFurniture(): Promise<{ defs: FurnitureDef[]; raw: RawFurniture[] }> {
  const raw: RawFurniture[] = [];
  const texts: Record<string, string> = {};
  for (const category of FURNITURE_TYPES) {
    const html = await fetchText(`${OFFICIAL_BASE}/furniture/${category}`);
    const { pageProps } = extractNextData(html).props;
    console.log(`  official/${category}: ${pageProps.furniture.length} records`);
    raw.push(...pageProps.furniture);
    Object.assign(texts, pageProps.texts);
  }
  return { defs: normalize(raw, texts), raw };
}
