import { describe, expect, it } from 'vitest';
import { getFamily, stageFor } from '../src/data/catalog';
import {
  buildGeometry,
  checkPlacement,
  defaultDoor,
  isFloorCell,
  isOutdoorCell,
  plotsConnected,
  resolveItem,
} from '../src/model/geometry';
import { item, smallShop } from './helpers';

describe('catalog stages', () => {
  it('picks the stage by level and grows the footprint', () => {
    const rack = getFamily('vertrack')!;
    expect(rack.maxLevel).toBe(25);
    expect(stageFor(rack, 1)).toMatchObject({ uid: 'vertrack1', w: 2, l: 3 });
    expect(stageFor(rack, 6)).toMatchObject({ uid: 'vertrack2', w: 2, l: 5 });
    expect(stageFor(rack, 25)).toMatchObject({ uid: 'vertrack5', w: 2, l: 7 });
    expect(getFamily('plant')!.maxLevel).toBe(1);
  });
});

describe('plots', () => {
  it('requires connected plots', () => {
    expect(plotsConnected([true, true, false, false, false, false, false, false, false])).toBe(true);
    expect(plotsConnected([true, false, false, false, true, false, false, false, false])).toBe(false);
    expect(plotsConnected(Array(9).fill(false))).toBe(false);
  });

  it('builds floor, back walls, front edges and the outdoor strip', () => {
    const g = buildGeometry(smallShop().shop);
    expect(g.floorCount).toBe(144);
    expect(isFloorCell(g, 11, 11)).toBe(true);
    expect(isFloorCell(g, 12, 0)).toBe(false);
    // 12 cells along each back edge, 12 along each front edge.
    expect(g.walls.filter((w) => w.side === 'nx')).toHaveLength(12);
    expect(g.walls.filter((w) => w.side === 'ny')).toHaveLength(12);
    expect(g.fronts).toHaveLength(24);
    expect(isOutdoorCell(g, 12, 3)).toBe(true);
    expect(isOutdoorCell(g, 15, 15)).toBe(true);
    expect(isOutdoorCell(g, 16, 3)).toBe(false);
    expect(g.doorValid).toBe(true);
  });

  it('falls back to a door in the middle of the longest front edge', () => {
    const g = buildGeometry(smallShop([], { door: { x: 3, y: 3, side: 'px' } }).shop);
    expect(g.doorValid).toBe(false);
    expect(g.door).toEqual({ x: 5, y: 11, side: 'py' });
    expect(defaultDoor([])).toEqual({ x: 0, y: 0, side: 'py' });
  });
});

describe('placement', () => {
  const layout = smallShop();
  const g = buildGeometry(layout.shop);

  it('rotation swaps the footprint', () => {
    expect(resolveItem(item('vertrack', 0, 0))!.rect).toEqual({ x0: 0, y0: 0, x1: 2, y1: 3 });
    expect(resolveItem(item('vertrack', 0, 0, { rot: 1 }))!.rect).toEqual({ x0: 0, y0: 0, x1: 3, y1: 2 });
  });

  it('rejects overlaps on the same layer but lets furniture stand on rugs', () => {
    const rack = resolveItem(item('vertrack', 2, 2))!;
    const rug = resolveItem(item('carpet_square', 0, 0))!;
    expect(checkPlacement(g, [rack], resolveItem(item('vertrack', 3, 3))!).ok).toBe(false);
    expect(checkPlacement(g, [rack], resolveItem(item('vertrack', 4, 2))!).ok).toBe(true);
    expect(checkPlacement(g, [rug], rack).ok).toBe(true);
  });

  it('keeps pieces inside their zone', () => {
    expect(checkPlacement(g, [], resolveItem(item('vertrack', 11, 0))!).reason).toBe('outside the shop floor');
    const statue = resolveItem(item('statue_blacksmith', 12, 0, { zone: 'outdoor' }))!;
    expect(checkPlacement(g, [], statue).ok).toBe(true);
    const indoorStatue = resolveItem(item('statue_blacksmith', 0, 0, { zone: 'outdoor' }))!;
    expect(checkPlacement(g, [], indoorStatue).ok).toBe(false);
    expect(checkPlacement(g, [], resolveItem(item('wd_books', 0, 4, { zone: 'wall', side: 'nx' }))!).ok).toBe(true);
    expect(checkPlacement(g, [], resolveItem(item('wd_books', 4, 4, { zone: 'wall', side: 'nx' }))!).ok).toBe(false);
  });
});
