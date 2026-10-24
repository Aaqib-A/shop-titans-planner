// Pure parsers for the community Google Sheet's CSV exports. The sheet lays
// several tables side by side on one tab; each table has a title cell
// ("VERTICAL RACK"), an optional "Extra ... Purchase Prices" note on the title
// row, and a header row starting with "<Thing> Level".
import type { BasementExpansion, FamilyLevels, LevelRow, ShopExpansion } from '../../src/data/schema.ts';

export type Grid = string[][];

const LEVEL_HEADER = /^(Rack|Bin|Counter|Chest) Level$/;

/** "1,000" → 1000, "---" / "" → null, "5%" → 5, "20 / 10" → 20. */
export function parseNumber(cell: string | undefined): number | null {
  if (cell == null) return null;
  const s = cell.trim();
  if (!s || /^-+$/.test(s)) return null;
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const text = (cell: string | undefined): string | null => {
  const s = (cell ?? '').trim();
  return !s || /^-+$/.test(s) ? null : s;
};

export function parseSize(cell: string): { w: number; l: number } | null {
  const m = cell.trim().match(/^(\d+)\s*x\s*(\d+)$/i);
  return m ? { w: Number(m[1]), l: Number(m[2]) } : null;
}

/** "1,000 / 5,000 / 10,000 Gold" → [1000, 5000, 10000]. */
export function parsePriceList(cell: string): number[] {
  return cell
    .replace(/gold/i, '')
    .split('/')
    .map((p) => parseNumber(p))
    .filter((n): n is number => n != null);
}

export interface RawLevelTable {
  title: string;
  extraPrices: number[];
  requiredMerchantLevel?: number;
  rows: LevelRow[];
}

function findTitle(grid: Grid, headerRow: number, col: number): { title: string; row: number } | null {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 4); r--) {
    const t = text(grid[r]?.[col - 1]);
    if (t && /^[A-Z][A-Z' ]+$/.test(t)) return { title: t, row: r };
  }
  return null;
}

function rowFromCells(headers: string[], cells: string[]): LevelRow | null {
  const get = (name: string) => {
    const i = headers.indexOf(name);
    return i < 0 ? undefined : cells[i];
  };
  const level = parseNumber(cells[0]);
  const size = parseSize(get('Size') ?? '');
  if (level == null || !size) return null;
  const row: LevelRow = {
    level,
    w: size.w,
    l: size.l,
    gold: parseNumber(get('Gold Cost')) ?? 0,
    gems: parseNumber(get('Gem Cost')) ?? 0,
    dragonmarks: parseNumber(get('Dragonmarks')) ?? 0,
    time: text(get('Upgrade Time')),
  };
  const energyCap = parseNumber(get('Energy Cap'));
  if (energyCap != null) row.energyCap = energyCap;
  const storageCell = get('Storage Cap') ?? get('Inventory Cap');
  const storage = parseNumber(storageCell);
  if (storage != null) row.storage = storage;
  if (storageCell && storageCell.includes('/')) row.storageText = storageCell.trim();
  const saleEnergy = parseNumber(get('Sale Energy'));
  if (saleEnergy != null) row.saleEnergy = saleEnergy;
  const maxEnergy = parseNumber(get('Max Energy (%)'));
  if (maxEnergy != null) row.maxEnergyPct = maxEnergy;
  const regen = parseNumber(get('Regen Bonus (%)'));
  if (regen != null) row.regenPct = regen;
  const surcharge = parseNumber(get('Surcharge %'));
  if (surcharge != null) row.surchargePct = surcharge;
  const perSale = text(get('Time per Sale'));
  if (perSale) row.timePerSale = perSale;
  if (headers.includes('Required Building')) row.requiredBuilding = text(get('Required Building'));
  return row;
}

/** Finds every "<Thing> Level" table on a tab. */
export function parseLevelTables(grid: Grid): RawLevelTable[] {
  const tables: RawLevelTable[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!LEVEL_HEADER.test(grid[r][c]?.trim() ?? '')) continue;
      const title = findTitle(grid, r, c);
      if (!title) continue;
      const headers: string[] = [];
      for (let k = c; k < grid[r].length && grid[r][k]?.trim(); k++) headers.push(grid[r][k].trim());
      const rows: LevelRow[] = [];
      for (let rr = r + 1; rr < grid.length; rr++) {
        const cells = grid[rr].slice(c, c + headers.length);
        if (parseNumber(cells[0]) == null) break;
        const row = rowFromCells(headers, cells);
        if (row) rows.push(row);
      }
      // The title row carries notes to the right of the title, e.g.
      // "Extra Rack Purchase Prices", "1,000 / 5,000 ... Gold".
      const titleRow = grid[title.row];
      let extraPrices: number[] = [];
      let requiredMerchantLevel: number | undefined;
      for (let k = c; k < c + headers.length + 2 && k < titleRow.length; k++) {
        const cell = titleRow[k]?.trim() ?? '';
        if (/Purchase Prices/i.test(cell)) {
          const value = titleRow.slice(k + 1, c + headers.length + 2).find((v) => /\d/.test(v));
          if (value) extraPrices = parsePriceList(value);
        }
        if (/Required Merchant Level/i.test(cell)) {
          const value = titleRow.slice(k + 1, c + headers.length + 2).find((v) => /\d/.test(v));
          requiredMerchantLevel = parseNumber(value) ?? undefined;
        }
      }
      tables.push({ title: title.title, extraPrices, requiredMerchantLevel, rows });
    }
  }
  return tables;
}

const normName = (s: string) =>
  s
    .toUpperCase()
    .replace(/[’']/g, "'")
    .replace(/\s+BIN$/, '')
    .trim();

/** Matches sheet table titles to official family ids by display name. */
export function matchFamilies(
  tables: RawLevelTable[],
  familyNames: Record<string, string>,
): { matched: FamilyLevels[]; unmatched: string[] } {
  const byName = new Map<string, string>();
  for (const [family, name] of Object.entries(familyNames)) byName.set(normName(name), family);
  const matched: FamilyLevels[] = [];
  const unmatched: string[] = [];
  for (const t of tables) {
    const family = byName.get(normName(t.title));
    if (!family) {
      unmatched.push(t.title);
      continue;
    }
    matched.push({
      family,
      title: t.title,
      source: 'sheet',
      extraPrices: t.extraPrices,
      requiredMerchantLevel: t.requiredMerchantLevel,
      rows: t.rows,
    });
  }
  return { matched, unmatched };
}

function findHeaderRow(grid: Grid, required: string[]): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < grid.length; r++) {
    const cells = grid[r].map((c) => c.trim());
    if (required.every((h) => cells.includes(h))) {
      const cols: Record<string, number> = {};
      cells.forEach((c, i) => {
        if (c && cols[c] == null) cols[c] = i;
      });
      return { row: r, cols };
    }
  }
  return null;
}

export function parseShopExpansions(grid: Grid): ShopExpansion[] {
  const h = findHeaderRow(grid, ['#', 'Expansion Type', 'Capacity']);
  if (!h) throw new Error('Shop expansions header not found');
  const out: ShopExpansion[] = [];
  for (let r = h.row + 1; r < grid.length; r++) {
    const g = (name: string) => grid[r][h.cols[name]];
    const index = parseNumber(g('#'));
    const capacity = parseNumber(g('Capacity'));
    if (index == null || capacity == null) break;
    out.push({
      index,
      type: /furniture only/i.test(g('Expansion Type') ?? '') ? 'furniture' : 'size',
      levelRequired: text(g('Level Required')),
      capacity,
      gold: parseNumber(g('Gold Cost')) ?? 0,
      gems: parseNumber(g('Gem Cost')) ?? 0,
      time: text(g('Completion Time')),
    });
  }
  return out;
}

export function parseBasementExpansions(grid: Grid): BasementExpansion[] {
  const h = findHeaderRow(grid, ['#', 'Level Required', 'Capacity']);
  if (!h) throw new Error('Basement expansions header not found');
  const out: BasementExpansion[] = [];
  for (let r = h.row + 1; r < grid.length; r++) {
    const g = (name: string) => grid[r][h.cols[name]];
    const index = parseNumber(g('#'));
    const capacity = parseNumber(g('Capacity'));
    if (index == null || capacity == null) break;
    out.push({
      index,
      levelRequired: parseNumber(g('Level Required')),
      capacity,
      gold: parseNumber(g('Gold Cost')) ?? 0,
      gems: parseNumber(g('Gem Cost')) ?? 0,
      time: text(g('Completion Time')),
    });
  }
  return out;
}
