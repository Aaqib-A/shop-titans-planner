import { type Family, levelRow } from '../data/catalog';
import type { FurnitureType } from '../data/schema';
import type { Resolved } from './geometry';

export interface StorageTotal {
  resource: string;
  total: number;
  bins: number;
  /** Set when a multi-resource bin (Dragon's Hoard) contributes "20 / 10 / ..." values. */
  note?: string;
}

export interface Money {
  gold: number;
  gems: number;
  dragonmarks: number;
  shards: number;
}

export interface Stats {
  prestige: number;
  rackEnergy: number;
  counterSaleEnergy: number | null;
  counterMaxEnergyPct: number;
  maxEnergy: number;
  displaySlots: number;
  trunkCapacity: number;
  storage: StorageTotal[];
  purchase: Money;
  upgrades: Money;
  counts: Partial<Record<FurnitureType, number>>;
  placed: number;
  stored: number;
}

const zero = (): Money => ({ gold: 0, gems: 0, dragonmarks: 0, shards: 0 });

/** Price of the nth piece (1-based) of a family. */
export function purchasePrice(fam: Family, n: number): Money {
  const base = fam.stages[0];
  const price = zero();
  if (n > 1 && fam.extraPrices.length) {
    price.gold = fam.extraPrices[Math.min(n - 2, fam.extraPrices.length - 1)];
    return price;
  }
  const row = levelRow(fam, 1);
  price.gold = row ? row.gold : base.price.gold;
  price.gems = row ? 0 : base.price.gems;
  price.shards = row ? 0 : base.price.shards;
  return price;
}

/** Cumulative upgrade cost from level 1 to `level`. */
export function upgradeCost(fam: Family, level: number): Money {
  const cost = zero();
  if (!fam.levels) return cost;
  for (const row of fam.levels) {
    if (row.level < 2 || row.level > level) continue;
    cost.gold += row.gold;
    cost.gems += row.gems;
    cost.dragonmarks += row.dragonmarks;
  }
  return cost;
}

const add = (a: Money, b: Money) => {
  a.gold += b.gold;
  a.gems += b.gems;
  a.dragonmarks += b.dragonmarks;
  a.shards += b.shards;
};

export function computeStats(items: Resolved[]): Stats {
  const stats: Stats = {
    prestige: 0,
    rackEnergy: 0,
    counterSaleEnergy: null,
    counterMaxEnergyPct: 0,
    maxEnergy: 0,
    displaySlots: 0,
    trunkCapacity: 0,
    storage: [],
    purchase: zero(),
    upgrades: zero(),
    counts: {},
    placed: 0,
    stored: 0,
  };
  const storage = new Map<string, StorageTotal>();
  const owned = new Map<string, number>();

  for (const r of items) {
    const { family: fam, item, stage } = r;
    const n = (owned.get(fam.id) ?? 0) + 1;
    owned.set(fam.id, n);
    add(stats.purchase, purchasePrice(fam, n));
    add(stats.upgrades, upgradeCost(fam, item.level));
    stats.counts[fam.type] = (stats.counts[fam.type] ?? 0) + 1;

    if (item.zone === 'stored') {
      stats.stored++;
      continue;
    }
    stats.placed++;
    stats.prestige += stage.prestige + stage.prestigePerLevel * Math.max(0, item.level - stage.level);

    const row = levelRow(fam, item.level);
    const fromFormula = (f: [number, number] | undefined) => (f ? f[0] + f[1] * (item.level - stage.level) : 0);
    switch (fam.type) {
      case 'rack':
        stats.rackEnergy += row?.energyCap ?? fromFormula(stage.formula.energyCap);
        stats.displaySlots += row?.storage ?? stage.maxItems;
        break;
      case 'counter':
        stats.counterSaleEnergy = row?.saleEnergy ?? fromFormula(stage.formula.energyBonus);
        stats.counterMaxEnergyPct = row?.maxEnergyPct ?? 0;
        break;
      case 'chest':
        stats.trunkCapacity += row?.storage ?? fromFormula(stage.formula.storage);
        break;
      case 'bin': {
        const resources = (stage.resource ?? 'unknown').split(',');
        const value = row?.storage ?? fromFormula(stage.formula.storage);
        for (const resource of resources) {
          const entry = storage.get(resource) ?? { resource, total: 0, bins: 0 };
          entry.total += value;
          entry.bins++;
          if (row?.storageText) entry.note = `includes ${fam.name} (${row.storageText})`;
          storage.set(resource, entry);
        }
        break;
      }
    }
  }
  stats.maxEnergy = Math.round(stats.rackEnergy * (1 + stats.counterMaxEnergyPct / 100));
  stats.storage = [...storage.values()].sort((a, b) => a.resource.localeCompare(b.resource));
  return stats;
}
