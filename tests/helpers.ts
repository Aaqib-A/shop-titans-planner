import { newLayout } from '../src/model/serialize';
import type { Layout, PlacedItem, ShopSettings } from '../src/model/types';

let n = 0;

export function item(family: string, x: number, y: number, extra: Partial<PlacedItem> = {}): PlacedItem {
  return { id: `t${n++}`, family, level: 1, x, y, rot: 0, zone: 'floor', ...extra };
}

/** A one-plot shop (plot 0, cells 0..11) with the door on the +y edge at x = 5. */
export function smallShop(items: PlacedItem[] = [], shop: Partial<ShopSettings> = {}): Layout {
  const layout = newLayout('test');
  layout.shop = {
    ...layout.shop,
    plots: [true, false, false, false, false, false, false, false, false],
    door: { x: 5, y: 11, side: 'py' },
    expansion: 1,
    ...shop,
  };
  layout.items = items;
  return layout;
}
