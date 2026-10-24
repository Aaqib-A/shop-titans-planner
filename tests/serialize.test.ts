import { describe, expect, it } from 'vitest';
import { cleanLayout, fromFile, fromShareString, toFile, toShareString } from '../src/model/serialize';
import { item, smallShop } from './helpers';

const sample = () =>
  smallShop(
    [
      item('vertrack', 0, 0, { level: 12, rot: 1 }),
      item('wd_books', 0, 4, { zone: 'wall', side: 'nx' }),
      item('statue_blacksmith', 12, 0, { zone: 'outdoor' }),
      item('plant', 0, 0, { zone: 'stored' }),
    ],
    { floor: 'academy_tile', wall: null, basement: 3, merchantLevel: 42 },
  );

const strip = (l: ReturnType<typeof sample>) => ({ name: l.name, shop: l.shop, items: l.items.map(({ id: _id, ...rest }) => rest) });

describe('serialize', () => {
  it('round-trips through a JSON file', () => {
    const layout = sample();
    const back = fromFile(toFile(layout));
    expect(back).toEqual(layout);
  });

  it('round-trips through a share string', () => {
    const layout = sample();
    const encoded = toShareString(layout);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(strip(fromShareString(encoded))).toEqual(strip(layout));
  });

  it('rejects junk and repairs partial layouts', () => {
    expect(() => fromFile('nope')).toThrow(/not valid JSON/);
    expect(() => cleanLayout({ hello: 1 })).toThrow(/Not a shop layout/);
    expect(() => fromShareString('garbage')).toThrow();
    const repaired = cleanLayout({ items: [{ family: 'plant', x: 1.4, y: '2', zone: 'moon' }, { nope: true }] });
    expect(repaired.items).toHaveLength(1);
    expect(repaired.items[0]).toMatchObject({ family: 'plant', x: 1, y: 0, zone: 'floor', rot: 0, level: 1 });
    expect(repaired.shop.plots).toHaveLength(9);
  });

  it('refuses files from a newer schema', () => {
    const file = JSON.stringify({ app: 'shop-titans-planner', version: 99, layout: sample() });
    expect(() => fromFile(file)).toThrow(/newer version/);
  });
});
