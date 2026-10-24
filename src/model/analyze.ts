// Everything the UI shows about a layout, derived in one pass.
import { type ShopGeometry, type Resolved, buildGeometry, collides, resolveItem, zoneProblem } from './geometry';
import { COUNTED_TYPES, basementCapacity, furnitureLimit, plotsForExpansion } from './limits';
import { type Reachability, computeReachability } from './pathing';
import { type Stats, computeStats } from './stats';
import type { Issue, Layout } from './types';

export interface Analysis {
  geometry: ShopGeometry;
  resolved: Resolved[];
  byId: Map<string, Resolved>;
  /** Items that can't stay where they are, with the reason. */
  invalid: Map<string, string>;
  reach: Reachability;
  issues: Issue[];
  stats: Stats;
  limit: { used: number; max: number; stored: number; basementCap: number };
}

const names = (ids: string[], byId: Map<string, Resolved>) => {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const n = byId.get(id)?.family.name ?? id;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
};

export function analyze(layout: Layout): Analysis {
  const geometry = buildGeometry(layout.shop);
  const resolved = layout.items.map(resolveItem).filter((r): r is Resolved => r !== null);
  const byId = new Map(resolved.map((r) => [r.item.id, r]));
  const issues: Issue[] = [];
  const invalid = new Map<string, string>();

  const unknown = layout.items.filter((i) => !byId.has(i.id));
  if (unknown.length)
    issues.push({ severity: 'warning', code: 'unknown', message: `${unknown.length} piece(s) are no longer in the game data and are hidden.` });

  const placed = resolved.filter((r) => r.item.zone !== 'stored');
  for (const r of placed) {
    const problem = zoneProblem(geometry, r);
    if (problem) invalid.set(r.item.id, problem);
  }
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      if (collides(placed[i], placed[j])) {
        invalid.set(placed[i].item.id, `overlaps ${placed[j].family.name}`);
        invalid.set(placed[j].item.id, `overlaps ${placed[i].family.name}`);
      }
  if (invalid.size)
    issues.push({
      severity: 'error',
      code: 'invalid',
      message: `Misplaced: ${names([...invalid.keys()], byId)}`,
      itemIds: [...invalid.keys()],
    });

  const { shop } = layout;
  const plotCount = shop.plots.filter(Boolean).length;
  if (!geometry.plotsConnected) issues.push({ severity: 'error', code: 'plots', message: 'Unlocked plots must touch each other.' });
  const expectedPlots = plotsForExpansion(shop.expansion);
  if (plotCount !== expectedPlots)
    issues.push({
      severity: 'warning',
      code: 'plot-count',
      message: `Expansion #${shop.expansion} has ${expectedPlots} plot(s) of floor, but ${plotCount} are unlocked.`,
    });

  const reach = computeReachability(geometry, resolved);
  if (reach.doorBlocked) issues.push({ severity: 'error', code: 'door', message: 'Something is standing in the doorway.' });
  if (reach.unreachable.length)
    issues.push({
      severity: 'error',
      code: 'unreachable',
      message: `Customers can't reach: ${names(reach.unreachable, byId)}`,
      itemIds: reach.unreachable,
    });
  if (reach.unreachableDecor.length)
    issues.push({
      severity: 'info',
      code: 'unreachable-decor',
      message: `Customers can't walk up to admire: ${names(reach.unreachableDecor, byId)}`,
      itemIds: reach.unreachableDecor,
    });

  const counted = resolved.filter((r) => COUNTED_TYPES.includes(r.family.type));
  const stored = resolved.filter((r) => r.item.zone === 'stored');
  const limit = {
    used: counted.length,
    max: furnitureLimit(shop.expansion),
    stored: stored.length,
    basementCap: basementCapacity(shop.basement),
  };
  if (limit.used > limit.max)
    issues.push({ severity: 'error', code: 'limit', message: `${limit.used} racks/bins/trunks, but expansion #${shop.expansion} allows ${limit.max}.` });
  if (limit.stored > limit.basementCap)
    issues.push({
      severity: 'error',
      code: 'basement',
      message: limit.basementCap
        ? `${limit.stored} pieces in the basement, which holds ${limit.basementCap}.`
        : `${limit.stored} piece(s) stored, but there's no basement yet.`,
      itemIds: stored.map((r) => r.item.id),
    });

  const perFamily = new Map<string, Resolved[]>();
  for (const r of resolved) perFamily.set(r.family.id, [...(perFamily.get(r.family.id) ?? []), r]);
  for (const [, list] of perFamily) {
    const max = list[0].family.stages[0].max;
    if (max > 0 && list.length > max)
      issues.push({
        severity: 'error',
        code: 'max',
        message: `You can own at most ${max} ${list[0].family.name}; this layout has ${list.length}.`,
        itemIds: list.map((r) => r.item.id),
      });
  }
  if (!placed.some((r) => r.family.type === 'counter'))
    issues.push({ severity: 'warning', code: 'counter', message: 'No counter placed: customers need one to buy.' });

  const tooHigh = resolved.filter((r) => r.family.stages[0].reqLevel > shop.merchantLevel);
  if (tooHigh.length)
    issues.push({
      severity: 'warning',
      code: 'level',
      message: `Needs a higher merchant level than ${shop.merchantLevel}: ${names(tooHigh.map((r) => r.item.id), byId)}`,
      itemIds: tooHigh.map((r) => r.item.id),
    });

  return { geometry, resolved, byId, invalid, reach, issues, stats: computeStats(resolved), limit };
}
