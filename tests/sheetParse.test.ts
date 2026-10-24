import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { matchFamilies, parseLevelTables, parseNumber, parsePriceList } from '../scripts/sync/sheetParse';

const grid = Papa.parse<string[]>(readFileSync(new URL('./fixtures/racks-excerpt.csv', import.meta.url), 'utf8')).data;

describe('sheet cell parsing', () => {
  it('parses numbers, dashes and percentages', () => {
    expect(parseNumber('1,000,000')).toBe(1000000);
    expect(parseNumber('---')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('5%')).toBe(5);
    expect(parseNumber('20 / 10')).toBe(20);
  });

  it('parses extra purchase price lists', () => {
    expect(parsePriceList('1,000 / 5,000 / 10,000 Gold')).toEqual([1000, 5000, 10000]);
  });
});

describe('level tables', () => {
  const tables = parseLevelTables(grid);

  it('finds side-by-side tables with their titles', () => {
    expect(tables.map((t) => t.title)).toEqual(['VERTICAL RACK', 'COUNTER', 'TABLE', 'TRUNK']);
  });

  it('reads level rows and the extra price note', () => {
    const rack = tables[0];
    expect(rack.rows).toHaveLength(8);
    expect(rack.rows[0]).toMatchObject({ level: 1, w: 2, l: 3, energyCap: 9, storage: 4, gold: 100, gems: 10 });
    expect(rack.rows[5]).toMatchObject({ level: 6, w: 2, l: 5, energyCap: 24, storage: 8, gold: 100000, time: '4 hours, 30 mins' });
    expect(rack.extraPrices).toEqual([1000, 5000, 10000, 15000, 20000, 30000, 40000, 50000]);
  });

  it('reads counter and trunk specific columns', () => {
    const counter = tables[1];
    expect(counter.rows[1]).toMatchObject({ level: 2, saleEnergy: 2, gold: 1000, gems: 30 });
    expect(counter.extraPrices).toEqual([]);
    const trunk = tables[3];
    expect(trunk.rows[2]).toMatchObject({ level: 3, storage: 25, gold: 2500 });
    expect(trunk.extraPrices).toEqual([5000, 15000, 30000, 50000]);
  });

  it('matches titles to families by display name', () => {
    const { matched, unmatched } = matchFamilies(tables, {
      vertrack: 'Vertical Rack',
      counter: 'Counter',
      table: 'Table',
      chest: 'Trunk',
    });
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => m.family)).toEqual(['vertrack', 'counter', 'table', 'chest']);
  });
});
