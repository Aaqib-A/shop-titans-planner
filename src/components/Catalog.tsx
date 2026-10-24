import { useMemo, useState } from 'react';
import { type Family, TYPE_LABELS, families } from '../data/catalog';
import { FURNITURE_TYPES, type FurnitureType } from '../data/schema';
import { FAMILY_MIME } from '../render/CanvasView';
import { useActiveLayout } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';
import { Sprite } from './Sprite';
import { short } from './format';

type Source = 'all' | 'store' | 'exclusive';
type Sort = 'level' | 'name' | 'prestige';

function price(f: Family) {
  const p = f.stages[0].price;
  const firstLevel = f.levels?.[0];
  const gold = firstLevel ? firstLevel.gold : p.gold;
  if (gold) return <span className="price gold">{short(gold)}</span>;
  if (p.gems) return <span className="price gems">{short(p.gems)}</span>;
  if (p.shards) return <span className="price shards">{short(p.shards)}</span>;
  return <span className="price muted">{f.type === 'counter' ? 'free' : 'special'}</span>;
}

function Card({ fam, locked }: { fam: Family; locked: boolean }) {
  const armed = useUiStore((s) => s.armed?.family === fam.id);
  const set = useUiStore((s) => s.set);
  const base = fam.stages[0];
  const arm = () => set({ armed: armed ? null : { family: fam.id, level: 1, rot: 0 }, pickingDoor: false });
  return (
    <button
      type="button"
      className={`card${armed ? ' armed' : ''}${locked ? ' locked' : ''}`}
      title={`${fam.name}: ${base.w}×${base.l}${base.prestige ? `, ${base.prestige} prestige` : ''}${locked ? `, needs merchant level ${base.reqLevel}` : ''}`}
      draggable
      onClick={arm}
      onDragStart={(e) => {
        e.dataTransfer.setData(FAMILY_MIME, fam.id);
        e.dataTransfer.effectAllowed = 'copy';
        set({ armed: { family: fam.id, level: 1, rot: 0 }, pickingDoor: false });
      }}
    >
      <Sprite def={base} size={64} />
      <span className="card-name">{fam.name}</span>
      <span className="card-meta">
        <span>
          {base.w}×{base.l}
        </span>
        {base.prestige > 0 && <span className="prestige">★{short(base.prestige)}</span>}
        {price(fam)}
      </span>
      {base.availability !== 'store' && <span className="card-tag">{base.availability === 'event' ? 'event' : base.availability === 'pack' ? 'pack' : 'locked'}</span>}
      {locked && <span className="card-lvl">Lv {base.reqLevel}</span>}
    </button>
  );
}

export function Catalog() {
  const [tab, setTab] = useState<FurnitureType>('rack');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>('all');
  const [sort, setSort] = useState<Sort>('level');
  const [hideLocked, setHideLocked] = useState(false);
  const merchantLevel = useActiveLayout().shop.merchantLevel;

  const counts = useMemo(() => {
    const c = {} as Record<FurnitureType, number>;
    for (const f of families) c[f.type] = (c[f.type] ?? 0) + 1;
    return c;
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return families
      .filter((f) => (q ? f.name.toLowerCase().includes(q) : f.type === tab))
      .filter((f) => source === 'all' || (source === 'store' ? f.stages[0].availability === 'store' : f.stages[0].availability !== 'store'))
      .filter((f) => !hideLocked || f.stages[0].reqLevel <= merchantLevel)
      .sort((a, b) => {
        if (sort === 'prestige') return b.stages[0].prestige - a.stages[0].prestige || a.name.localeCompare(b.name);
        if (sort === 'level') {
          // Regular-store pieces first; most decor is pack-only.
          const store = (f: Family) => (f.stages[0].availability === 'store' ? 0 : 1);
          return store(a) - store(b) || a.stages[0].reqLevel - b.stages[0].reqLevel || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }, [tab, query, source, sort, hideLocked, merchantLevel]);

  return (
    <aside className="catalog panel">
      <div className="catalog-tabs" role="tablist">
        {FURNITURE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={!query && tab === t}
            className={!query && tab === t ? 'active' : ''}
            onClick={() => {
              setTab(t);
              setQuery('');
            }}
          >
            {TYPE_LABELS[t]}
            <span className="count">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="catalog-filters">
        <input type="search" placeholder="Search all furniture…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search furniture" />
        <div className="row">
          <select value={source} onChange={(e) => setSource(e.target.value as Source)} aria-label="Availability">
            <option value="all">All sources</option>
            <option value="store">Regular store</option>
            <option value="exclusive">Packs, events &amp; locked</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
            <option value="level">By level</option>
            <option value="name">By name</option>
            <option value="prestige">By prestige</option>
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={hideLocked} onChange={(e) => setHideLocked(e.target.checked)} />
          Only up to merchant level {merchantLevel}
        </label>
      </div>
      <div className="card-grid">
        {list.map((f) => (
          <Card key={f.id} fam={f} locked={f.stages[0].reqLevel > merchantLevel} />
        ))}
        {!list.length && <p className="empty">Nothing matches.</p>}
      </div>
    </aside>
  );
}
