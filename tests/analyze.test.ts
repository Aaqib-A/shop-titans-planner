import { describe, expect, it } from 'vitest';
import { getFamily } from '../src/data/catalog';
import { analyze } from '../src/model/analyze';
import { furnitureLimit, plotsForExpansion } from '../src/model/limits';
import { purchasePrice, upgradeCost } from '../src/model/stats';
import { item, smallShop } from './helpers';

const codes = (layout: ReturnType<typeof smallShop>) => analyze(layout).issues.map((i) => i.code);

describe('pathing', () => {
  it('flags racks walled off from the door', () => {
    // A wall of vertical racks (2×3, rotated to 3×2) across y = 5..6 cuts the
    // shop in two; the counter and a rack behind it become unreachable.
    const wall = [0, 3, 6, 9].map((x) => item('vertrack', x, 5, { rot: 1 }));
    const behind = item('table', 4, 1);
    const counter = item('counter', 0, 0);
    const a = analyze(smallShop([...wall, behind, counter]));
    expect(a.reach.unreachable.sort()).toEqual([behind.id, counter.id].sort());
    expect(a.issues.find((i) => i.code === 'unreachable')?.itemIds).toHaveLength(2);
  });

  it('treats rugs as walkable and reports a blocked door', () => {
    const rug = item('carpet_largerect', 0, 4);
    expect(analyze(smallShop([rug, item('counter', 8, 0)])).reach.unreachable).toEqual([]);
    expect(codes(smallShop([item('vertrack', 5, 9)]))).toContain('door');
  });
});

describe('limits and issues', () => {
  it('reads furniture limits from the expansion table', () => {
    expect(furnitureLimit(1)).toBe(8);
    expect(furnitureLimit(9)).toBe(72);
    expect(furnitureLimit(10)).toBe(73);
    expect(plotsForExpansion(9)).toBe(9);
    expect(plotsForExpansion(20)).toBe(9);
    expect(plotsForExpansion(3)).toBe(3);
  });

  it('counts racks, bins and trunks (including stored) against the limit', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('bin_iron', (i % 5) * 2, Math.floor(i / 5) * 2 + 1));
    const a = analyze(smallShop([...items, item('plant', 0, 9)]));
    expect(a.limit).toMatchObject({ used: 9, max: 8 });
    expect(a.issues.map((i) => i.code)).toContain('limit');
    const stored = analyze(smallShop([item('bin_iron', 0, 0, { zone: 'stored' })]));
    expect(stored.limit).toMatchObject({ used: 1, stored: 1 });
    expect(stored.issues.map((i) => i.code)).toContain('basement');
  });

  it('flags overlaps, misplaced items, a second counter and missing counter', () => {
    const a = analyze(smallShop([item('vertrack', 0, 0), item('vertrack', 1, 1), item('counter', 6, 0), item('counter', 9, 0)]));
    expect(a.invalid.size).toBe(2);
    expect(a.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['invalid', 'max']));
    expect(codes(smallShop([]))).toContain('counter');
  });

  it('warns when plots and the expansion number disagree', () => {
    expect(codes(smallShop([], { expansion: 3 }))).toContain('plot-count');
    expect(codes(smallShop([], { expansion: 1 }))).not.toContain('plot-count');
  });
});

describe('stats', () => {
  it('uses the sheet level tables', () => {
    const a = analyze(
      smallShop([
        item('vertrack', 0, 0, { level: 10 }),
        item('counter', 4, 0, { level: 25 }),
        item('bin_iron', 8, 0, { level: 5 }),
        item('chest', 8, 4, { level: 3 }),
      ]),
    );
    expect(a.stats.rackEnergy).toBe(48);
    expect(a.stats.counterSaleEnergy).toBe(73);
    expect(a.stats.counterMaxEnergyPct).toBe(10);
    expect(a.stats.maxEnergy).toBe(53);
    expect(a.stats.displaySlots).toBe(8);
    expect(a.stats.storage).toEqual([{ resource: 'iron', total: 59, bins: 1 }]);
    expect(a.stats.trunkCapacity).toBe(25);
  });

  it('prices extra pieces and cumulative upgrades', () => {
    const rack = getFamily('vertrack')!;
    expect(purchasePrice(rack, 1).gold).toBe(100);
    expect(purchasePrice(rack, 2).gold).toBe(1000);
    expect(purchasePrice(rack, 20).gold).toBe(50000);
    expect(upgradeCost(rack, 1).gold).toBe(0);
    expect(upgradeCost(rack, 3)).toMatchObject({ gold: 3000, gems: 50 });
    const plant = getFamily('plant')!;
    expect(purchasePrice(plant, 3).gold).toBe(250);
  });

  it('sums prestige of placed decor only', () => {
    const a = analyze(smallShop([item('plant', 0, 0), item('plant', 3, 0), item('plant', 6, 0, { zone: 'stored' })]));
    expect(a.stats.prestige).toBe(10);
  });
});
