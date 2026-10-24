// Saved layouts plus undo/redo for the active one. Every edit goes through
// `commit`, which snapshots the previous layout (immer keeps snapshots cheap).
import { produce } from 'immer';
import { create } from 'zustand';
import { analyze, type Analysis } from '../model/analyze';
import { buildGeometry, defaultDoor } from '../model/geometry';
import { fromShareString, loadSaved, newId, newLayout, saveState } from '../model/serialize';
import type { Layout } from '../model/types';

const HISTORY_LIMIT = 100;

interface LayoutState {
  layouts: Layout[];
  activeId: string;
  past: Layout[];
  future: Layout[];
  /** Set when the share link in the URL couldn't be read. */
  loadError: string | null;

  commit: (recipe: (draft: Layout) => void) => void;
  undo: () => void;
  redo: () => void;
  setActive: (id: string) => void;
  addLayout: (layout?: Layout) => string;
  duplicateLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  deleteLayout: (id: string) => void;
}

function starterLayout(): Layout {
  const layout = newLayout('My shop');
  const door = defaultDoor(buildGeometry(layout.shop).fronts);
  layout.shop.door = door;
  layout.items.push({ id: newId(), family: 'counter', level: 1, x: door.x - 1, y: door.y - 6, rot: 0, zone: 'floor' });
  return layout;
}

function initialState(): Pick<LayoutState, 'layouts' | 'activeId' | 'loadError'> {
  const saved = loadSaved();
  const layouts = saved?.layouts ?? [];
  let activeId = saved?.activeId ?? '';
  let loadError: string | null = null;

  const hash = typeof location !== 'undefined' ? location.hash : '';
  const shared = hash.match(/[#&]l=([^&]+)/)?.[1];
  if (shared) {
    try {
      const layout = fromShareString(shared);
      layout.id = newId();
      layout.name = `${layout.name} (shared)`;
      layouts.push(layout);
      activeId = layout.id;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!layouts.length) {
    const layout = starterLayout();
    layouts.push(layout);
    activeId = layout.id;
  }
  return { layouts, activeId, loadError };
}

const replaceActive = (layouts: Layout[], next: Layout) => layouts.map((l) => (l.id === next.id ? next : l));

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  ...initialState(),
  past: [],
  future: [],

  commit: (recipe) => {
    const { layouts, activeId, past } = get();
    const current = layouts.find((l) => l.id === activeId);
    if (!current) return;
    const next = produce(current, (draft) => {
      recipe(draft);
    });
    if (next === current) return;
    const stamped = produce(next, (d) => {
      d.updatedAt = Date.now();
    });
    set({ layouts: replaceActive(layouts, stamped), past: [...past.slice(-HISTORY_LIMIT + 1), current], future: [] });
  },

  undo: () => {
    const { layouts, activeId, past, future } = get();
    const prev = past[past.length - 1];
    const current = layouts.find((l) => l.id === activeId);
    if (!prev || !current) return;
    set({ layouts: replaceActive(layouts, prev), past: past.slice(0, -1), future: [current, ...future] });
  },

  redo: () => {
    const { layouts, activeId, past, future } = get();
    const next = future[0];
    const current = layouts.find((l) => l.id === activeId);
    if (!next || !current) return;
    set({ layouts: replaceActive(layouts, next), past: [...past, current], future: future.slice(1) });
  },

  setActive: (id) => {
    if (id === get().activeId) return;
    set({ activeId: id, past: [], future: [] });
  },

  addLayout: (layout) => {
    const next = layout ?? starterLayout();
    set((s) => ({ layouts: [...s.layouts, next], activeId: next.id, past: [], future: [] }));
    return next.id;
  },

  duplicateLayout: (id) => {
    const src = get().layouts.find((l) => l.id === id);
    if (!src) return;
    const now = Date.now();
    const copy: Layout = {
      ...structuredClone(src),
      id: newId(),
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    get().addLayout(copy);
  },

  renameLayout: (id, name) => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return;
    set((s) => ({ layouts: s.layouts.map((l) => (l.id === id ? { ...l, name: trimmed, updatedAt: Date.now() } : l)) }));
  },

  deleteLayout: (id) => {
    const { layouts, activeId } = get();
    const rest = layouts.filter((l) => l.id !== id);
    if (!rest.length) rest.push(starterLayout());
    const nextActive = id === activeId ? rest[0].id : activeId;
    set({ layouts: rest, activeId: nextActive, ...(id === activeId ? { past: [], future: [] } : {}) });
  },
}));

export function getActiveLayout(): Layout {
  const { layouts, activeId } = useLayoutStore.getState();
  return layouts.find((l) => l.id === activeId) ?? layouts[0];
}

export function useActiveLayout(): Layout {
  return useLayoutStore((s) => s.layouts.find((l) => l.id === s.activeId) ?? s.layouts[0]);
}

// Analysis is memoised on layout identity, so the canvas and the panels share it.
let lastLayout: Layout | null = null;
let lastAnalysis: Analysis | null = null;
export function analysisFor(layout: Layout): Analysis {
  if (layout !== lastLayout || !lastAnalysis) {
    lastAnalysis = analyze(layout);
    lastLayout = layout;
  }
  return lastAnalysis;
}

export function useAnalysis(): Analysis {
  return analysisFor(useActiveLayout());
}

// Autosave, debounced.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export let lastSaveFailed = false;
useLayoutStore.subscribe((state, prev) => {
  if (state.layouts === prev.layouts && state.activeId === prev.activeId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lastSaveFailed = !saveState({ layouts: state.layouts, activeId: state.activeId });
  }, 400);
});
