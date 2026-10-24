// Typed indexes over the generated game data.
import cosmeticsJson from './cosmetics.json';
import expansionsJson from './expansions.json';
import furnitureJson from './furniture.json';
import levelsJson from './levels.json';
import metaJson from './meta.json';
import type {
  Cosmetic,
  Cosmetics,
  Expansions,
  FamilyLevels,
  FurnitureDef,
  FurnitureType,
  LevelRow,
  SpriteInfo,
  SyncMeta,
} from './schema';
import spriteOverridesJson from './sprite-overrides.json';
import spritesJson from './sprites.json';

export const furniture = furnitureJson as FurnitureDef[];
export const sprites = spritesJson as Record<string, SpriteInfo>;
export const familyLevels = levelsJson as FamilyLevels[];
export const expansions = expansionsJson as Expansions;
export const cosmetics = cosmeticsJson as Cosmetics;
export const syncMeta = metaJson as SyncMeta;

export interface SpriteOverride {
  /** Multiplies the default size in the isometric view. */
  scale?: number;
  /** Offsets in isometric world pixels (tile = 64×32). */
  dx?: number;
  dy?: number;
}
export const spriteOverrides = spriteOverridesJson as Record<string, SpriteOverride>;

export interface Family {
  id: string;
  type: FurnitureType;
  name: string;
  /** Stages sorted by level; length 1 for decor. */
  stages: FurnitureDef[];
  maxLevel: number;
  levels: LevelRow[] | null;
  extraPrices: number[];
}

const byUid = new Map<string, FurnitureDef>();
const familyMap = new Map<string, Family>();
const levelMap = new Map(familyLevels.map((l) => [l.family, l]));

for (const def of furniture) {
  byUid.set(def.uid, def);
  let fam = familyMap.get(def.family);
  if (!fam) {
    fam = { id: def.family, type: def.type, name: def.name, stages: [], maxLevel: 1, levels: null, extraPrices: def.xtraPrice };
    familyMap.set(def.family, fam);
  }
  fam.stages.push(def);
}
for (const fam of familyMap.values()) {
  fam.stages.sort((a, b) => a.level - b.level);
  const lv = levelMap.get(fam.id);
  if (lv && fam.stages.length > 1) {
    fam.levels = lv.rows;
    fam.maxLevel = Math.max(...lv.rows.map((r) => r.level));
    if (lv.extraPrices.length) fam.extraPrices = lv.extraPrices;
  } else if (fam.stages.length > 1) {
    fam.maxLevel = fam.stages[fam.stages.length - 1].level + 4;
  }
}

export const families: Family[] = [...familyMap.values()];

export function getFamily(id: string): Family | undefined {
  return familyMap.get(id);
}

export function getDef(uid: string): FurnitureDef | undefined {
  return byUid.get(uid);
}

export function clampLevel(fam: Family, level: number): number {
  return Math.max(1, Math.min(fam.maxLevel, Math.round(level) || 1));
}

/** The stage in effect at `level`: the last stage whose first level is ≤ level. */
export function stageFor(fam: Family, level: number): FurnitureDef {
  let stage = fam.stages[0];
  for (const s of fam.stages) if (s.level <= level) stage = s;
  return stage;
}

export function levelRow(fam: Family, level: number): LevelRow | undefined {
  return fam.levels?.find((r) => r.level === level);
}

export function spriteFor(def: FurnitureDef): SpriteInfo | undefined {
  return def.sprite ? sprites[def.sprite] : undefined;
}

export function shopExpansion(index: number) {
  return expansions.shop.find((e) => e.index === index);
}

export function basementExpansion(index: number) {
  return expansions.basement.find((e) => e.index === index);
}

const cosmeticById = new Map<string, Cosmetic>([
  ...cosmetics.floors.map((c) => [`floor:${c.id}`, c] as const),
  ...cosmetics.walls.map((c) => [`wall:${c.id}`, c] as const),
]);

export function getCosmetic(kind: 'floor' | 'wall', id: string | null): Cosmetic | undefined {
  return id ? cosmeticById.get(`${kind}:${id}`) : undefined;
}

export const TYPE_LABELS: Record<FurnitureType, string> = {
  counter: 'Counter',
  rack: 'Racks',
  chest: 'Trunks',
  bin: 'Bins',
  indoordeco: 'Indoor',
  floordeco: 'Rugs',
  walldeco: 'Wall',
  outdoordeco: 'Outdoor',
  pethouse: 'Pets',
};
