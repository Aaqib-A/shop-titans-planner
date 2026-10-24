import { useEffect, useState } from 'react';
import { About } from './components/About';
import { BasementPanel } from './components/BasementPanel';
import { Catalog } from './components/Catalog';
import { ChecksPanel } from './components/ChecksPanel';
import { Inspector } from './components/Inspector';
import { ShopSettings } from './components/ShopSettings';
import { StatsPanel } from './components/StatsPanel';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { CanvasView } from './render/CanvasView';
import { deleteItem, duplicateItem, nudge, rotateItem } from './store/actions';
import { useAnalysis, useLayoutStore } from './store/layoutStore';
import { useUiStore } from './store/uiStore';

type Tab = 'inspect' | 'checks' | 'stats' | 'basement';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const ui = useUiStore.getState();
      if (ui.settingsOpen) return;
      const layoutStore = useLayoutStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) layoutStore.redo();
        else layoutStore.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        layoutStore.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        if (ui.selected) duplicateItem(ui.selected);
        return;
      }
      if (mod || e.altKey) return;
      switch (key) {
        case 'escape':
          ui.set({ armed: null, pickingDoor: false, selected: ui.armed || ui.pickingDoor ? ui.selected : null });
          break;
        case 'r':
          if (ui.armed) ui.set({ armed: { ...ui.armed, rot: ui.armed.rot ? 0 : 1 } });
          else if (ui.selected) rotateItem(ui.selected);
          break;
        case 'delete':
        case 'backspace':
          if (ui.selected) {
            e.preventDefault();
            deleteItem(ui.selected);
          }
          break;
        case 'v':
          ui.set({ view: ui.view === 'iso' ? 'top' : 'iso' });
          break;
        case 'f':
          ui.requestFit();
          break;
        case 'g':
          ui.set({ showGrid: !ui.showGrid });
          break;
        case 'p':
          ui.set({ showPath: !ui.showPath });
          break;
        case 'arrowup':
        case 'arrowdown':
        case 'arrowleft':
        case 'arrowright': {
          if (!ui.selected) return;
          e.preventDefault();
          const d = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }[key] as [number, number];
          nudge(ui.selected, d[0], d[1]);
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function SidePanel() {
  const [tab, setTab] = useState<Tab>('inspect');
  const selected = useUiStore((s) => s.selected);
  const armed = useUiStore((s) => s.armed);
  const { issues, limit } = useAnalysis();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  useEffect(() => {
    if (selected || armed) setTab('inspect');
  }, [selected, armed]);

  const tabs: [Tab, string, React.ReactNode][] = [
    ['inspect', 'Inspect', null],
    ['checks', 'Checks', errors ? <span className="badge error">{errors}</span> : warnings ? <span className="badge warning">{warnings}</span> : null],
    ['stats', 'Stats', null],
    ['basement', 'Basement', limit.stored ? <span className="badge">{limit.stored}</span> : null],
  ];
  return (
    <aside className="side panel">
      <div className="side-tabs" role="tablist">
        {tabs.map(([id, label, badge]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
            {badge}
          </button>
        ))}
      </div>
      <div className="side-body">
        {tab === 'inspect' && <Inspector />}
        {tab === 'checks' && <ChecksPanel />}
        {tab === 'stats' && <StatsPanel />}
        {tab === 'basement' && <BasementPanel />}
      </div>
    </aside>
  );
}

export function App() {
  const [about, setAbout] = useState(false);
  const loadError = useLayoutStore((s) => s.loadError);
  const notify = useUiStore((s) => s.notify);
  useShortcuts();
  useEffect(() => {
    if (loadError) notify(`Couldn't open the shared layout: ${loadError}`);
  }, [loadError, notify]);
  return (
    <div className="app">
      <TopBar onAbout={() => setAbout(true)} />
      <main className="workspace">
        <Catalog />
        <CanvasView />
        <SidePanel />
      </main>
      <ShopSettings />
      {about && <About onClose={() => setAbout(false)} />}
      <Toast />
    </div>
  );
}
