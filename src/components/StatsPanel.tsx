import { TYPE_LABELS } from '../data/catalog';
import { FURNITURE_TYPES } from '../data/schema';
import { useAnalysis } from '../store/layoutStore';
import { full, short } from './format';

function Row({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div title={title}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function StatsPanel() {
  const { stats: s } = useAnalysis();
  const money = (m: { gold: number; gems: number; dragonmarks: number; shards: number }) =>
    [m.gold && `${short(m.gold)} gold`, m.gems && `${short(m.gems)} gems`, m.dragonmarks && `${short(m.dragonmarks)} DM`, m.shards && `${short(m.shards)} shards`]
      .filter(Boolean)
      .join(' · ') || '–';
  return (
    <div className="stats">
      <section>
        <h4>Shop</h4>
        <dl className="kv">
          <Row k="Prestige from furniture" v={full(s.prestige)} />
          <Row k="Pieces placed" v={full(s.placed)} />
          <Row k="In basement" v={full(s.stored)} />
        </dl>
      </section>
      <section>
        <h4>Energy</h4>
        <dl className="kv">
          <Row k="Rack energy caps" v={full(s.rackEnergy)} />
          <Row k="Counter max-energy bonus" v={`${s.counterMaxEnergyPct}%`} />
          <Row k="Max energy" v={full(s.maxEnergy)} title="Rack energy caps plus the counter's percentage bonus" />
          <Row k="Energy per sale" v={s.counterSaleEnergy == null ? 'no counter' : full(s.counterSaleEnergy)} />
          <Row k="Display slots" v={full(s.displaySlots)} />
        </dl>
      </section>
      <section>
        <h4>Storage</h4>
        <dl className="kv">
          <Row k="Trunk inventory" v={full(s.trunkCapacity)} />
          {s.storage.map((r) => (
            <Row key={r.resource} k={`${r.resource[0].toUpperCase()}${r.resource.slice(1)} (${r.bins})`} v={full(r.total)} title={r.note} />
          ))}
          {!s.storage.length && <Row k="Resource bins" v="none" />}
        </dl>
      </section>
      <section>
        <h4>Cost to own everything</h4>
        <dl className="kv">
          <Row k="Buying" v={money(s.purchase)} title="First-piece price, then the sheet's extra-piece prices for each additional rack, bin or trunk" />
          <Row k="Upgrades to set levels" v={money(s.upgrades)} title="Sum of the sheet's Gold Cost, Gem Cost and Dragonmarks columns from level 2 up" />
        </dl>
      </section>
      <section>
        <h4>Pieces by type</h4>
        <dl className="kv">
          {FURNITURE_TYPES.filter((t) => s.counts[t]).map((t) => (
            <Row key={t} k={TYPE_LABELS[t]} v={full(s.counts[t] ?? 0)} />
          ))}
          {!Object.keys(s.counts).length && <Row k="Nothing yet" v="" />}
        </dl>
      </section>
    </div>
  );
}
