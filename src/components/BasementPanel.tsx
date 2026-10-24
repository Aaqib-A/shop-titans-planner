import { getFamily, stageFor } from '../data/catalog';
import { deleteItem, restoreItem } from '../store/actions';
import { useActiveLayout, useAnalysis } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';
import { Sprite } from './Sprite';

export function BasementPanel() {
  const layout = useActiveLayout();
  const { limit } = useAnalysis();
  const selected = useUiStore((s) => s.selected);
  const set = useUiStore((s) => s.set);
  const stored = layout.items.filter((i) => i.zone === 'stored');
  return (
    <div className="basement">
      <p className="muted small">
        {limit.basementCap
          ? `Basement holds ${limit.basementCap} pieces (expansion #${layout.shop.basement}). Stored racks, bins and trunks still count towards the shop's furniture limit.`
          : 'No basement set. Choose a basement expansion in Shop settings.'}
      </p>
      {!stored.length && <p className="empty">Nothing stored. Select a piece and press Store to move it here.</p>}
      <ul className="stored-list">
        {stored.map((item) => {
          const fam = getFamily(item.family);
          if (!fam) return null;
          return (
            <li key={item.id} className={selected === item.id ? 'selected' : ''}>
              <button type="button" className="stored-main" onClick={() => set({ selected: item.id })}>
                <Sprite def={stageFor(fam, item.level)} size={40} />
                <span>
                  {fam.name}
                  {fam.maxLevel > 1 && <span className="muted"> · L{item.level}</span>}
                </span>
              </button>
              <button type="button" onClick={() => restoreItem(item.id)}>
                Put back
              </button>
              <button type="button" className="danger icon-btn" title="Delete" onClick={() => deleteItem(item.id)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
