# Shop Titans Shop Planner

A browser tool for planning a Shop Titans shop: lay out racks, counter, trunks, bins and decor on the real grid, see it in an isometric (game-like) or top-down view, and check it before you rebuild your shop in the game.

It is a static site with no backend, so it runs anywhere that serves files (Docker + nginx, Netlify, or any static host).

## What it does

- **Catalog of ~900 furniture stages** (racks, counter, trunks, bins, indoor/outdoor/wall decor, rugs, pet dwellings) with real footprints, prestige, prices and sprites. Search and filter by source (store, packs, events) and merchant level.
- **Shop shape:** a 3×3 grid of 12×12 plots. Unlock any connected set, pick the door on a front edge, and set the outdoor strip depth.
- **Placing:** click a card and click the map, or drag it in. Pieces snap to the grid and can't overlap; rugs go underneath furniture. Wall decor goes on the back walls and outdoor decor in front of the shop.
- **Levels:** set any piece's level (1–25). The footprint and sprite change at stages 6, 11, 16 and 21, exactly as in the game data.
- **Checks:** furniture limit for your expansion (racks + bins + trunks, including stored ones), basement capacity, overlaps, out-of-zone pieces, merchant-level requirements, and whether customers can walk from the door to every display and the counter.
- **Stats:** prestige, rack energy caps, max energy with the counter bonus, display slots, storage per resource, and the gold/gem/dragonmark cost of buying and upgrading everything.
- **Cosmetics:** 172 floors and 165 wallpapers (approximate previews).
- **Saving:** several named layouts autosaved in the browser, undo/redo, JSON export/import, share links (the whole layout is in the URL), and PNG export.

Shortcuts: `R` rotate, `Del` delete, `Ctrl+D` duplicate, arrows nudge, `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo, `V` switch view, `F` fit, `G` grid, `P` path overlay, `Esc` stop placing. Drag empty space to pan; use the wheel to zoom.

## Run it locally

Needs Node 20+ (22 recommended).

```sh
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```sh
npm test             # unit tests (geometry, pathing, limits, stats, save/share, sheet parsing)
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ locally
npm run sync         # refresh game data and sprites (see below)
```

## Deploy

The build is fully offline: game data and sprites are committed under `src/data/` and `public/sprites/`.

### Docker

```sh
docker build -t shop-titans-planner .
docker run --rm -p 8080:80 shop-titans-planner      # http://localhost:8080
# or
docker compose up -d --build
```

The image is nginx serving `dist/` (~15 MB of sprites, cached for a week; hashed assets cached for a year).

### Netlify

`netlify.toml` is included, so any of these work:

- **Git:** push the repo to GitHub/GitLab and import it in Netlify. It runs `npm run build` and publishes `dist/`.
- **CLI:** `npx netlify deploy --build --prod`
- **Drag and drop:** run `npm run build`, then drop the `dist/` folder on https://app.netlify.com/drop.

## Refreshing game data

`npm run sync` rebuilds `src/data/*.json` and downloads any missing sprites (`-- --force` re-downloads all of them). Run it after a game update, check the diff, and commit.

| Source | Used for |
|---|---|
| [playshoptitans.com/furniture](https://playshoptitans.com/furniture/rack) (official) | Furniture records: footprints, stages, prestige, prices, unlock levels. The site embeds them as JSON in each category page. Also the sprites. |
| [Community spreadsheet](https://docs.google.com/spreadsheets/d/1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c/) | Per-level tables for racks, counter, trunks and bins; shop and basement expansions. |
| [Shop Titans Wiki](https://shop-titans.fandom.com/wiki) | Flooring and wallpaper icons; fallback art. |

The sync cross-checks the sheet against the official per-level formulas and prints any differences. At the last sync there were two: Ether Bin footprint at L21+ and Stardust Bin storage at L12+. Footprints always come from the official data.

## Assumptions

These rules aren't documented anywhere definitive, so they're kept configurable:

- **Shop shape:** a 3×3 grid of 12×12 plots, with the door on any front (+x/+y) edge ([`src/model/geometry.ts`](src/model/geometry.ts)).
- **Furniture limit:** counts racks, bins and trunks, not the counter, decor or pet dwellings (`COUNTED_TYPES` in [`src/model/limits.ts`](src/model/limits.ts)).
- **Customer path:** a piece is reachable if customers can stand on any free cell next to it. Required for the counter and racks; decor with admirers only gets a note (`ACCESS_REQUIRED` in [`src/model/pathing.ts`](src/model/pathing.ts)).
- **Sprites in the isometric view:** the game's icons are 3/4 renders, scaled to each footprint. Pieces that look off can be tuned in [`src/data/sprite-overrides.json`](src/data/sprite-overrides.json), e.g. `{ "fireplace": { "scale": 1.1, "dy": -6 } }`.
- **Flooring and wallpaper:** these are the wiki's preview icons cropped into a repeating texture, not the game's textures.

## Project layout

```
scripts/sync/        data + sprite sync (official site, sheet, wiki)
src/data/            generated JSON (committed) + typed catalog indexes
src/model/           pure logic: geometry, pathing, limits, stats, save/share
src/store/           zustand stores (layouts + undo, UI state) and edit actions
src/render/          canvas renderers (isometric, top-down), canvas view, PNG export
src/components/      React UI panels
tests/               vitest unit tests
```

In development, `window.__planner` exposes the stores and actions for scripted checks.

## Disclaimer

This is a fan-made tool, not affiliated with or endorsed by the makers of Shop Titans. Game names, data and art belong to their owners. The repository includes downloaded game art, so keep it private unless you're sure sharing it is fine.
