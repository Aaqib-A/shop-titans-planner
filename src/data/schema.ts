// Shapes of the generated JSON files in src/data. Written by `npm run sync`
// (scripts/sync) and read by the app, so keep both sides in step.

export const FURNITURE_TYPES = [
  'counter',
  'rack',
  'chest',
  'bin',
  'indoordeco',
  'floordeco',
  'walldeco',
  'outdoordeco',
  'pethouse',
] as const;
export type FurnitureType = (typeof FURNITURE_TYPES)[number];

/** Where a piece of furniture can be bought. */
export type Availability = 'store' | 'event' | 'pack' | 'locked';

/** One stage of a furniture family (stages start at levels 1/6/11/16/21). */
export interface FurnitureDef {
  uid: string;
  family: string;
  type: FurnitureType;
  name: string;
  /** Footprint along x / y in grid cells, unrotated. */
  w: number;
  l: number;
  /** First level of this stage. */
  level: number;
  /** 1-based stage index within the family. */
  stage: number;
  /** Sprite key in sprites.json, or null when no art could be found. */
  sprite: string | null;
  /** Merchant level required to buy. */
  reqLevel: number;
  prestige: number;
  prestigePerLevel: number;
  /** Purchase price of the first piece. */
  price: { gold: number; gems: number; shards: number };
  /** Prices of additional pieces (2nd, 3rd, ...). */
  xtraPrice: number[];
  /** Maximum owned, 0 = unlimited. */
  max: number;
  maxVisitors: number;
  maxItems: number;
  inspectEnergy: number;
  /** Resource(s) held by a bin, e.g. "iron" or "iron,wood,leather,herbs". */
  resource: string | null;
  event: string | null;
  availability: Availability;
  releaseAt: string | null;
  /** Cost of each of the five levels in this stage (index 0 = `level`). */
  upgrade: { gold: number[]; gems: number[]; dragonmarks: number[]; time: number[] };
  /** Per-level stat formulas from the official data (base at `level`, + perLevel each level). */
  formula: {
    energyCap?: [number, number];
    energyBonus?: [number, number];
    storage?: [number, number];
    energyCapBonus?: number;
  };
}

export interface SpriteInfo {
  file: string;
  w: number;
  h: number;
}

export interface LevelRow {
  level: number;
  w: number;
  l: number;
  energyCap?: number;
  storage?: number;
  /** Raw storage text when a bin holds several resources ("20 / 10"). */
  storageText?: string;
  saleEnergy?: number;
  maxEnergyPct?: number;
  regenPct?: number;
  surchargePct?: number;
  timePerSale?: string;
  /** Cost to reach this level (level 1 = purchase price of the first piece). */
  gold: number;
  gems: number;
  dragonmarks: number;
  time: string | null;
  requiredBuilding?: string | null;
}

export interface FamilyLevels {
  family: string;
  title: string;
  source: 'sheet' | 'official';
  extraPrices: number[];
  requiredMerchantLevel?: number;
  rows: LevelRow[];
}

export interface ShopExpansion {
  index: number;
  type: 'size' | 'furniture';
  levelRequired: string | null;
  capacity: number;
  gold: number;
  gems: number;
  time: string | null;
}

export interface BasementExpansion {
  index: number;
  levelRequired: number | null;
  capacity: number;
  gold: number;
  gems: number;
  time: string | null;
}

export interface Expansions {
  shop: ShopExpansion[];
  basement: BasementExpansion[];
}

export interface Cosmetic {
  id: string;
  name: string;
  file: string;
}

export interface Cosmetics {
  floors: Cosmetic[];
  walls: Cosmetic[];
}

export interface SyncMeta {
  syncedAt: string;
  sources: Record<string, string>;
  counts: Record<string, number>;
}
