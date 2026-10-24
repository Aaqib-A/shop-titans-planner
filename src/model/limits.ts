import { basementExpansion, expansions, shopExpansion } from '../data/catalog';
import type { FurnitureType } from '../data/schema';
import { PLOTS } from './geometry';

/**
 * Furniture types that use up the shop's furniture limit ("Rack and Bin
 * Slots"). Decor, the counter and pet dwellings don't. Change it here if the
 * game's rule turns out different.
 */
export const COUNTED_TYPES: FurnitureType[] = ['rack', 'bin', 'chest'];

export const maxShopExpansion = () => Math.max(...expansions.shop.map((e) => e.index));
export const maxBasementExpansion = () => Math.max(0, ...expansions.basement.map((e) => e.index));

export function furnitureLimit(expansion: number): number {
  return shopExpansion(expansion)?.capacity ?? 0;
}

export function basementCapacity(basement: number): number {
  return basement > 0 ? (basementExpansion(basement)?.capacity ?? 0) : 0;
}

/** Physical 12×12 plots unlocked by an expansion number (later ones are furniture-only). */
export function plotsForExpansion(expansion: number): number {
  const sized = expansions.shop.filter((e) => e.type === 'size' && e.index <= expansion).length;
  return Math.min(PLOTS * PLOTS, Math.max(1, sized));
}

/** The lowest expansion that unlocks `plots` physical plots. */
export function expansionForPlots(plots: number): number {
  const sized = expansions.shop.filter((e) => e.type === 'size').sort((a, b) => a.index - b.index);
  return sized[Math.min(sized.length, Math.max(1, plots)) - 1]?.index ?? plots;
}
