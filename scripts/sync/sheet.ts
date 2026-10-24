// Level tables and expansion tables from the community Google Sheet
// (public, exported per tab as CSV).
import Papa from 'papaparse';
import type { Expansions, FamilyLevels } from '../../src/data/schema.ts';
import { fetchText } from './http.ts';
import {
  type Grid,
  type RawLevelTable,
  matchFamilies,
  parseBasementExpansions,
  parseLevelTables,
  parseShopExpansions,
} from './sheetParse.ts';

export const SHEET_ID = '1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c';
export const SHEET_TABS = {
  racks: 348010505, // "Racks, Counter & Trunks"
  bins: 69438216, // "Resource Bins"
  shopExpansions: 788450752,
  basementExpansions: 2073268902,
} as const;

export const sheetUrl = (gid: number) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

async function fetchGrid(gid: number): Promise<Grid> {
  const csv = await fetchText(sheetUrl(gid));
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: false });
  return parsed.data;
}

export async function fetchSheet(familyNames: Record<string, string>): Promise<{
  levels: FamilyLevels[];
  unmatched: string[];
  expansions: Expansions;
}> {
  const tables: RawLevelTable[] = [];
  for (const gid of [SHEET_TABS.racks, SHEET_TABS.bins]) tables.push(...parseLevelTables(await fetchGrid(gid)));
  const { matched, unmatched } = matchFamilies(tables, familyNames);
  const expansions: Expansions = {
    shop: parseShopExpansions(await fetchGrid(SHEET_TABS.shopExpansions)),
    basement: parseBasementExpansions(await fetchGrid(SHEET_TABS.basementExpansions)),
  };
  return { levels: matched, unmatched, expansions };
}
