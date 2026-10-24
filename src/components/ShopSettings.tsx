import { useEffect, useMemo, useState } from 'react';
import { cosmetics, expansions } from '../data/catalog';
import type { Cosmetic } from '../data/schema';
import { MAX_OUTDOOR, plotsConnected } from '../model/geometry';
import { expansionForPlots, furnitureLimit, plotsForExpansion } from '../model/limits';
import { assetUrl } from '../render/spriteCache';
import { clearItems, updateShop } from '../store/actions';
import { useActiveLayout } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';
import { short } from './format';

function CosmeticPicker({ kind, items, value, onChange }: { kind: string; items: Cosmetic[]; value: string | null; onChange: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => items.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [items, q]);
  const current = items.find((c) => c.id === value);
  return (
    <div className="cosmetic-picker">
      <div className="row">
        <span className="muted">
          {kind}: <b>{current?.name ?? 'Default'}</b>
        </span>
        <input type="search" placeholder={`Search ${items.length}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${kind}`} />
      </div>
      <div className="cosmetic-grid">
        <button type="button" className={`cosmetic default${value == null ? ' on' : ''}`} onClick={() => onChange(null)} title="Default">
          Default
        </button>
        {list.map((c) => (
          <button key={c.id} type="button" className={`cosmetic${value === c.id ? ' on' : ''}`} onClick={() => onChange(c.id)} title={c.name}>
            <img src={assetUrl(c.file)} alt={c.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ShopSettings() {
  const open = useUiStore((s) => s.settingsOpen);
  const set = useUiStore((s) => s.set);
  const notify = useUiStore((s) => s.notify);
  const layout = useActiveLayout();
  const { shop } = layout;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ settingsOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, set]);

  if (!open) return null;
  const plotCount = shop.plots.filter(Boolean).length;
  const expected = plotsForExpansion(shop.expansion);

  const togglePlot = (i: number) => {
    const plots = shop.plots.map((p, j) => (j === i ? !p : p));
    if (!plotsConnected(plots)) {
      notify(plots.some(Boolean) ? 'Plots have to touch each other' : 'Keep at least one plot');
      return;
    }
    updateShop({ plots });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && set({ settingsOpen: false })}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <h2 id="settings-title">Shop settings</h2>
          <button type="button" className="icon-btn" onClick={() => set({ settingsOpen: false })} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body settings">
          <section>
            <h4>Floor plots</h4>
            <p className="muted small">Each plot is 12×12 cells. Click to unlock or lock plots; they must touch. The back walls run along the top edges.</p>
            <div className="plot-editor">
              <div className="plot-grid">
                {shop.plots.map((on, i) => (
                  <button key={i} type="button" className={on ? 'on' : ''} onClick={() => togglePlot(i)} aria-pressed={on} aria-label={`Plot ${i + 1}`}>
                    {on ? '■' : ''}
                  </button>
                ))}
              </div>
              <div>
                <p>
                  <b>{plotCount}</b> plot{plotCount === 1 ? '' : 's'} unlocked.
                  {plotCount !== expected && (
                    <>
                      {' '}
                      Expansion #{shop.expansion} has {expected}.{' '}
                      <button type="button" className="link" onClick={() => updateShop({ expansion: expansionForPlots(plotCount) })}>
                        Set expansion to #{expansionForPlots(plotCount)}
                      </button>
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    set({ settingsOpen: false, pickingDoor: true, armed: null });
                  }}
                >
                  Move the door on the map…
                </button>
              </div>
            </div>
          </section>

          <section className="grid2">
            <label>
              Shop expansion
              <select value={shop.expansion} onChange={(e) => updateShop({ expansion: Number(e.target.value) })}>
                {expansions.shop.map((x) => (
                  <option key={x.index} value={x.index}>
                    #{x.index}: {x.capacity} furniture{x.type === 'furniture' ? ' (furniture only)' : ''}
                    {x.levelRequired ? `, ${x.levelRequired}` : ''}
                  </option>
                ))}
              </select>
              <span className="muted small">Furniture limit {furnitureLimit(shop.expansion)}</span>
            </label>
            <label>
              Basement
              <select value={shop.basement} onChange={(e) => updateShop({ basement: Number(e.target.value) })}>
                <option value={0}>No basement</option>
                {expansions.basement.map((x) => (
                  <option key={x.index} value={x.index}>
                    #{x.index}: holds {x.capacity}
                    {x.levelRequired ? ` (Lv ${x.levelRequired})` : ''}
                    {x.gold ? `, ${short(x.gold)} gold` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Merchant level
              <input type="number" min={1} max={200} value={shop.merchantLevel} onChange={(e) => updateShop({ merchantLevel: Math.max(1, Number(e.target.value) || 1) })} />
              <span className="muted small">Pieces above this level are flagged.</span>
            </label>
            <label>
              Outdoor area depth: {shop.outdoorDepth}
              <input type="range" min={0} max={MAX_OUTDOOR} value={shop.outdoorDepth} onChange={(e) => updateShop({ outdoorDepth: Number(e.target.value) })} />
              <span className="muted small">Cells in front of the shop for outdoor decor.</span>
            </label>
          </section>

          <section>
            <h4>Flooring &amp; wallpaper</h4>
            <p className="muted small">Previews use the wiki's icons, cropped into a repeating texture, so they only approximate the in-game look.</p>
            <CosmeticPicker kind="Floor" items={cosmetics.floors} value={shop.floor} onChange={(floor) => updateShop({ floor })} />
            <CosmeticPicker kind="Wallpaper" items={cosmetics.walls} value={shop.wall} onChange={(wall) => updateShop({ wall })} />
          </section>

          <section>
            <h4>Start over</h4>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Remove all ${layout.items.length} pieces from "${layout.name}"? You can undo this.`)) clearItems();
              }}
            >
              Remove all furniture
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
