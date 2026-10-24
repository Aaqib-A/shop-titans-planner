import { useRef } from 'react';
import type { Issue } from '../model/types';
import { useAnalysis } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : used > 0 ? 100 : 0;
  const over = used > max;
  return (
    <div className={`meter${over ? ' over' : ''}`}>
      <div className="meter-label">
        <span>{label}</span>
        <b>
          {used} / {max}
        </b>
      </div>
      <div className="meter-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const ICON: Record<Issue['severity'], string> = { error: '✖', warning: '▲', info: 'ℹ' };

export function ChecksPanel() {
  const a = useAnalysis();
  const focusOn = useUiStore((s) => s.focusOn);
  const cursor = useRef(new Map<string, number>());
  const order: Issue['severity'][] = ['error', 'warning', 'info'];
  const issues = [...a.issues].sort((x, y) => order.indexOf(x.severity) - order.indexOf(y.severity));

  const show = (issue: Issue) => {
    if (!issue.itemIds?.length) return;
    const i = (cursor.current.get(issue.code) ?? -1) + 1;
    cursor.current.set(issue.code, i);
    focusOn(issue.itemIds[i % issue.itemIds.length]);
  };

  return (
    <div className="checks">
      <Meter label="Racks, bins & trunks" used={a.limit.used} max={a.limit.max} />
      <Meter label="Basement" used={a.limit.stored} max={a.limit.basementCap} />
      {issues.length === 0 ? (
        <p className="alert ok">All good: every display and the counter can be reached from the door.</p>
      ) : (
        <ul className="issues">
          {issues.map((issue) => (
            <li key={issue.code} className={issue.severity}>
              <span className="icon" aria-hidden>
                {ICON[issue.severity]}
              </span>
              <span className="msg">{issue.message}</span>
              {issue.itemIds?.length ? (
                <button type="button" className="link" onClick={() => show(issue)}>
                  Show{issue.itemIds.length > 1 ? ' next' : ''}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        The path check approximates the game: a piece counts as reachable when customers can stand on any free cell next to it. Rugs are walkable.
        Turn on <b>Path</b> on the map to see the reachable floor.
      </p>
    </div>
  );
}
