import { create } from 'zustand';

export type ViewKind = 'iso' | 'top';

export interface Armed {
  family: string;
  level: number;
  rot: 0 | 1;
}

interface UiState {
  view: ViewKind;
  selected: string | null;
  /** Catalog piece being placed; stays armed until Esc / right-click. */
  armed: Armed | null;
  /** Click a front edge on the map to move the door. */
  pickingDoor: boolean;
  showGrid: boolean;
  showPath: boolean;
  settingsOpen: boolean;
  toast: { text: string; n: number } | null;
  /** Bumped to ask the canvas to centre on an item. */
  focus: { id: string; n: number } | null;
  /** Bumped to ask the canvas to fit the shop. */
  fitRequest: number;

  set: (patch: Partial<Omit<UiState, 'set' | 'notify' | 'focusOn' | 'requestFit'>>) => void;
  notify: (text: string) => void;
  focusOn: (id: string) => void;
  requestFit: () => void;
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`shop-titans-planner.${key}`);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`shop-titans-planner.${key}`, JSON.stringify(value));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

export const useUiStore = create<UiState>()((set, get) => ({
  view: readPref<ViewKind>('view', 'iso'),
  selected: null,
  armed: null,
  pickingDoor: false,
  showGrid: readPref('showGrid', true),
  showPath: readPref('showPath', false),
  settingsOpen: false,
  toast: null,
  focus: null,
  fitRequest: 0,

  set: (patch) => set(patch),
  notify: (text) => set({ toast: { text, n: (get().toast?.n ?? 0) + 1 } }),
  focusOn: (id) => set({ selected: id, focus: { id, n: (get().focus?.n ?? 0) + 1 } }),
  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
}));

useUiStore.subscribe((s, prev) => {
  if (s.view !== prev.view) writePref('view', s.view);
  if (s.showGrid !== prev.showGrid) writePref('showGrid', s.showGrid);
  if (s.showPath !== prev.showPath) writePref('showPath', s.showPath);
});
