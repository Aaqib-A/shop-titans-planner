import { syncMeta } from '../data/catalog';

export function About({ onClose }: { onClose: () => void }) {
  const synced = new Date(syncMeta.syncedAt);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal narrow" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header>
          <h2 id="about-title">About Shop Planner</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p>
            A fan-made planner for <b>Shop Titans</b> layouts. It isn't affiliated with or endorsed by the game's makers; game names and art belong to their
            owners.
          </p>
          <h4>Data</h4>
          <ul>
            <li>
              Furniture, footprints and sprites:{' '}
              <a href={syncMeta.sources.official} target="_blank" rel="noreferrer">
                playshoptitans.com
              </a>{' '}
              ({syncMeta.counts.furniture} stages, {syncMeta.counts.sprites} sprites)
            </li>
            <li>
              Level tables and expansions:{' '}
              <a href={syncMeta.sources.sheet} target="_blank" rel="noreferrer">
                the community Shop Titans spreadsheet
              </a>
            </li>
            <li>
              Flooring and wallpaper icons:{' '}
              <a href="https://shop-titans.fandom.com/wiki" target="_blank" rel="noreferrer">
                Shop Titans Wiki
              </a>
            </li>
          </ul>
          <p className="muted small">Last synced {synced.toLocaleString()}. Run <code>npm run sync</code> to refresh after a game update.</p>
          <h4>Assumptions</h4>
          <ul className="small">
            <li>The shop is a 3×3 grid of 12×12 plots; you choose which ones are unlocked.</li>
            <li>Racks, bins and trunks count towards the furniture limit; the counter, decor and pet dwellings don't.</li>
            <li>The path check treats a piece as reachable from any free neighbouring cell.</li>
          </ul>
          <p className="muted small">Your layouts are saved in this browser only. Use Export JSON or Share to keep or send them.</p>
        </div>
      </div>
    </div>
  );
}
