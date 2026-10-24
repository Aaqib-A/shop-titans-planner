import { type Family, TYPE_LABELS, clampLevel, getFamily, levelRow, stageFor } from '../data/catalog';
import { footprintSize } from '../model/geometry';
import { purchasePrice, upgradeCost } from '../model/stats';
import type { PlacedItem } from '../model/types';
import { isMirrored } from '../render/scene';
import { deleteItem, duplicateItem, restoreItem, rotateItem, setLevel, storeItem } from '../store/actions';
import { useActiveLayout, useAnalysis } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';
import { Sprite } from './Sprite';
import { full, short } from './format';

function LevelControl({ fam, level, onChange }: { fam: Family; level: number; onChange: (l: number) => void }) {
  if (fam.maxLevel <= 1) return null;
  const stageStarts = fam.stages.map((s) => s.level);
  return (
    <div className="level-control">
      <label>
        Level
        <input type="number" min={1} max={fam.maxLevel} value={level} onChange={(e) => onChange(clampLevel(fam, Number(e.target.value)))} />
        <span className="muted">/ {fam.maxLevel}</span>
      </label>
      <input type="range" min={1} max={fam.maxLevel} value={level} onChange={(e) => onChange(Number(e.target.value))} aria-label="Level" />
      <div className="stage-buttons">
        {stageStarts.map((l, i) => (
          <button key={l} type="button" className={stageFor(fam, level).level === l ? 'on' : ''} onClick={() => onChange(l)} title={`Stage ${i + 1} starts at level ${l}`}>
            S{i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function LevelStats({ fam, level }: { fam: Family; level: number }) {
  const row = levelRow(fam, level);
  const next = levelRow(fam, level + 1);
  const stage = stageFor(fam, level);
  const toHere = upgradeCost(fam, level);
  const rows: [string, string][] = [];
  if (row?.energyCap != null) rows.push(['Energy cap', full(row.energyCap)]);
  if (row?.storage != null) rows.push([fam.type === 'rack' ? 'Display slots' : 'Storage', row.storageText ?? full(row.storage)]);
  if (row?.saleEnergy != null) rows.push(['Energy per sale', full(row.saleEnergy)]);
  if (row?.maxEnergyPct) rows.push(['Max energy bonus', `${row.maxEnergyPct}%`]);
  if (row?.regenPct) rows.push(['Regen bonus', `${row.regenPct}%`]);
  if (row?.timePerSale) rows.push(['Sells', row.timePerSale]);
  if (row?.surchargePct) rows.push(['Surcharge', `${row.surchargePct}%`]);
  if (stage.prestige) rows.push(['Prestige', full(stage.prestige)]);
  if (stage.maxVisitors && fam.type === 'indoordeco') rows.push(['Admirers at once', String(stage.maxVisitors)]);
  if (stage.inspectEnergy && fam.type === 'indoordeco') rows.push(['Energy per admire', String(stage.inspectEnergy)]);
  if (row?.requiredBuilding) rows.push(['Needs building', row.requiredBuilding]);
  if (level > 1 && fam.levels) rows.push(['Upgrades so far', `${short(toHere.gold)} gold${toHere.dragonmarks ? ` + ${short(toHere.dragonmarks)} DM` : ''}`]);
  if (next) rows.push([`Next (L${next.level})`, `${short(next.gold)} gold${next.dragonmarks ? ` + ${short(next.dragonmarks)} DM` : ''}${next.time ? ` · ${next.time}` : ''}`]);
  if (!rows.length) return null;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Header({ fam, level, rot, sub }: { fam: Family; level: number; rot: 0 | 1; sub?: string }) {
  const stage = stageFor(fam, level);
  const fp = footprintSize(stage, rot);
  const base = fam.stages[0];
  const buy = purchasePrice(fam, 1);
  return (
    <div className="insp-head">
      <Sprite def={stage} size={84} mirror={isMirrored(stage, rot)} />
      <div>
        <h3>{fam.name}</h3>
        <p className="muted">
          {TYPE_LABELS[fam.type]} · {fp.w}×{fp.l}
          {sub ? ` · ${sub}` : ''}
        </p>
        <p className="muted small">
          {base.reqLevel > 1 ? `Merchant Lv ${base.reqLevel} · ` : ''}
          {buy.gold ? `${short(buy.gold)} gold` : buy.gems ? `${short(buy.gems)} gems` : buy.shards ? `${short(buy.shards)} shards` : fam.type === 'counter' ? 'Free' : 'Special'}
          {base.availability !== 'store' ? ` · ${base.availability === 'pack' ? 'from packs' : base.availability === 'event' ? `event (${base.event})` : 'locked'}` : ''}
        </p>
      </div>
    </div>
  );
}

function SelectedItem({ item }: { item: PlacedItem }) {
  const analysis = useAnalysis();
  const fam = getFamily(item.family);
  if (!fam) return <p className="muted">This piece isn't in the game data any more.</p>;
  const problem = analysis.invalid.get(item.id);
  const unreachable = analysis.reach.unreachable.includes(item.id);
  const decorUnreachable = analysis.reach.unreachableDecor.includes(item.id);
  const stored = item.zone === 'stored';
  return (
    <div className="inspector">
      <Header fam={fam} level={item.level} rot={item.rot} sub={stored ? 'in basement' : `at ${item.x}, ${item.y}`} />
      {problem && <p className="alert error">Misplaced: {problem}.</p>}
      {unreachable && <p className="alert error">Customers can't reach this from the door.</p>}
      {decorUnreachable && <p className="alert info">Customers can't walk up to admire this.</p>}
      <LevelControl fam={fam} level={item.level} onChange={(l) => setLevel(item.id, l)} />
      <LevelStats fam={fam} level={item.level} />
      <div className="button-row">
        {item.zone !== 'wall' && (
          <button type="button" onClick={() => rotateItem(item.id)} title="Rotate (R)">
            Rotate
          </button>
        )}
        <button type="button" onClick={() => duplicateItem(item.id)} title="Duplicate (Ctrl+D)">
          Duplicate
        </button>
        {stored ? (
          <button type="button" onClick={() => restoreItem(item.id)}>
            Put back
          </button>
        ) : (
          fam.type !== 'counter' && (
            <button type="button" onClick={() => storeItem(item.id)} title="Move to the basement">
              Store
            </button>
          )
        )}
        <button type="button" className="danger" onClick={() => deleteItem(item.id)} title="Delete (Del)">
          Delete
        </button>
      </div>
    </div>
  );
}

function ArmedPiece() {
  const armed = useUiStore((s) => s.armed)!;
  const set = useUiStore((s) => s.set);
  const fam = getFamily(armed.family);
  if (!fam) return null;
  return (
    <div className="inspector">
      <Header fam={fam} level={armed.level} rot={armed.rot} sub="placing" />
      <LevelControl fam={fam} level={armed.level} onChange={(level) => set({ armed: { ...armed, level } })} />
      <LevelStats fam={fam} level={armed.level} />
      <div className="button-row">
        <button type="button" onClick={() => set({ armed: { ...armed, rot: armed.rot ? 0 : 1 } })}>
          Rotate
        </button>
        <button type="button" onClick={() => set({ armed: null })}>
          Stop placing
        </button>
      </div>
    </div>
  );
}

export function Inspector() {
  const selected = useUiStore((s) => s.selected);
  const armed = useUiStore((s) => s.armed);
  const layout = useActiveLayout();
  const item = selected ? layout.items.find((i) => i.id === selected) : undefined;
  if (armed) return <ArmedPiece />;
  if (item) return <SelectedItem item={item} />;
  return (
    <div className="inspector empty-state">
      <h3>Nothing selected</h3>
      <ul className="hints">
        <li>Pick furniture on the left, then click the map to place it (or drag it in).</li>
        <li>Click a piece to select it; drag it to move.</li>
        <li>
          <kbd>R</kbd> rotate · <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · arrows nudge
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>V</kbd> switch view · <kbd>F</kbd> fit · drag empty space to pan, wheel to zoom
        </li>
      </ul>
    </div>
  );
}
