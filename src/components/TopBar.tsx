import { useRef, useState } from 'react';
import { fromFile, newId, toFile, toShareString } from '../model/serialize';
import { download, exportPng, safeName } from '../render/exportPng';
import { getActiveLayout, useActiveLayout, useLayoutStore } from '../store/layoutStore';
import { useUiStore } from '../store/uiStore';

export function TopBar({ onAbout }: { onAbout: () => void }) {
  const layouts = useLayoutStore((s) => s.layouts);
  const activeId = useLayoutStore((s) => s.activeId);
  const canUndo = useLayoutStore((s) => s.past.length > 0);
  const canRedo = useLayoutStore((s) => s.future.length > 0);
  const { setActive, addLayout, duplicateLayout, renameLayout, deleteLayout, undo, redo } = useLayoutStore.getState();
  const layout = useActiveLayout();
  const view = useUiStore((s) => s.view);
  const set = useUiStore((s) => s.set);
  const notify = useUiStore((s) => s.notify);
  const fileInput = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);

  const share = async () => {
    const url = `${location.origin}${location.pathname}#l=${toShareString(getActiveLayout())}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Share link copied');
    } catch {
      prompt('Copy this link:', url);
    }
  };

  const exportJson = () => {
    const l = getActiveLayout();
    download(new Blob([toFile(l)], { type: 'application/json' }), `${safeName(l.name)}.json`);
  };

  const importJson = async (file: File) => {
    try {
      const imported = fromFile(await file.text());
      imported.id = newId();
      addLayout(imported);
      notify(`Imported "${imported.name}"`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <header className="topbar">
      <div className="brand" title="Shop Titans shop planner">
        <span className="logo" aria-hidden>
          ⚒
        </span>
        <span>Shop Planner</span>
      </div>

      <div className="layout-picker">
        {renaming ? (
          <input
            autoFocus
            defaultValue={layout.name}
            aria-label="Layout name"
            onBlur={(e) => {
              renameLayout(activeId, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <select value={activeId} onChange={(e) => setActive(e.target.value)} aria-label="Layout">
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <div className="menu-wrap">
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} title="Layout actions">
            ▾
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={() => (addLayout(), setMenu(false))}>
                New layout
              </button>
              <button type="button" onClick={() => (duplicateLayout(activeId), setMenu(false))}>
                Duplicate
              </button>
              <button type="button" onClick={() => (setRenaming(true), setMenu(false))}>
                Rename
              </button>
              <hr />
              <button type="button" onClick={() => (exportJson(), setMenu(false))}>
                Export JSON
              </button>
              <button type="button" onClick={() => (fileInput.current?.click(), setMenu(false))}>
                Import JSON…
              </button>
              <hr />
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Delete "${layout.name}"? This can't be undone.`)) deleteLayout(activeId);
                }}
              >
                Delete layout
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="segmented" role="group" aria-label="View">
        <button type="button" className={view === 'iso' ? 'on' : ''} onClick={() => set({ view: 'iso' })}>
          Isometric
        </button>
        <button type="button" className={view === 'top' ? 'on' : ''} onClick={() => set({ view: 'top' })}>
          Top-down
        </button>
      </div>

      <div className="group">
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>

      <div className="spacer" />

      <div className="group">
        <button type="button" onClick={() => set({ settingsOpen: true })}>
          Shop settings
        </button>
        <button type="button" onClick={share} title="Copy a link that opens this layout">
          Share
        </button>
        <button
          type="button"
          onClick={() => exportPng(view).catch((err) => notify(err instanceof Error ? err.message : 'Export failed'))}
          title="Download a picture of the current view"
        >
          PNG
        </button>
        <button type="button" onClick={onAbout} title="About this planner and its data">
          ?
        </button>
      </div>
    </header>
  );
}
