// `npm run sync`: refreshes src/data/*.json and public/sprites/** from the
// official site, the community Google Sheet and the Fandom wiki. The output
// is committed so that builds never touch the network.
//
//   npm run sync               download only what is missing
//   npm run sync -- --force    re-download every sprite
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cosmetic, Cosmetics, FamilyLevels, FurnitureDef, LevelRow, SpriteInfo, SyncMeta } from '../../src/data/schema.ts';
import { OFFICIAL_BASE, fetchOfficialFurniture } from './official.ts';
import { SHEET_ID, fetchSheet } from './sheet.ts';
import { safeFileName, syncSprites } from './sprites.ts';
import { WIKI_API, categoryFiles, fileTitleToName, fileUrls } from './wiki.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(ROOT, 'src/data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const force = process.argv.includes('--force');

const LEVELED_TYPES = new Set(['rack', 'bin', 'counter', 'chest']);

/** One JSON record per line: small diffs, still readable. */
function jsonLines(value: unknown): string {
  if (Array.isArray(value)) return `[\n${value.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `{\n${entries.join(',\n')}\n}\n`;
  }
  return `${JSON.stringify(value)}\n`;
}

async function write(file: string, value: unknown, pretty = false) {
  const body = pretty ? `${JSON.stringify(value, null, 2)}\n` : jsonLines(value);
  await writeFile(path.join(DATA_DIR, file), body);
}

function formatSeconds(s: number): string | null {
  if (!s) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || `${s}s`;
}

/** Level rows computed from the official per-stage formulas. */
function officialLevels(stages: FurnitureDef[]): LevelRow[] {
  const rows: LevelRow[] = [];
  stages.forEach((s, si) => {
    const last = si + 1 < stages.length ? stages[si + 1].level - 1 : s.level + 4;
    for (let level = s.level, i = 0; level <= last && i < 5; level++, i++) {
      const row: LevelRow = {
        level,
        w: s.w,
        l: s.l,
        gold: s.upgrade.gold[i],
        gems: s.upgrade.gems[i],
        dragonmarks: s.upgrade.dragonmarks[i],
        time: formatSeconds(s.upgrade.time[i]),
      };
      if (s.formula.energyCap) row.energyCap = s.formula.energyCap[0] + s.formula.energyCap[1] * i;
      if (s.formula.storage) row.storage = s.formula.storage[0] + s.formula.storage[1] * i;
      if (s.formula.energyBonus) row.saleEnergy = s.formula.energyBonus[0] + s.formula.energyBonus[1] * i;
      rows.push(row);
    }
  });
  return rows;
}

function crossCheck(sheet: FamilyLevels, official: LevelRow[]): string[] {
  const problems: string[] = [];
  for (const row of sheet.rows) {
    const o = official.find((r) => r.level === row.level);
    if (!o) continue;
    if (o.w * o.l !== row.w * row.l) problems.push(`L${row.level} size ${row.w}x${row.l} vs official ${o.w}x${o.l}`);
    if (row.energyCap != null && o.energyCap != null && row.energyCap !== o.energyCap)
      problems.push(`L${row.level} energy ${row.energyCap} vs official ${o.energyCap}`);
    if (row.storage != null && o.storage != null && !row.storageText && row.storage !== o.storage)
      problems.push(`L${row.level} storage ${row.storage} vs official ${o.storage}`);
  }
  return problems;
}

async function main() {
  console.log('1/4 Official furniture catalog');
  const { defs } = await fetchOfficialFurniture();

  const families = new Map<string, FurnitureDef[]>();
  for (const d of defs) families.set(d.family, [...(families.get(d.family) ?? []), d]);

  console.log('2/4 Google Sheet level + expansion tables');
  const familyNames: Record<string, string> = {};
  for (const [family, stages] of families) if (LEVELED_TYPES.has(stages[0].type)) familyNames[family] = stages[0].name;
  const sheet = await fetchSheet(familyNames);
  if (sheet.unmatched.length) console.warn(`  sheet tables with no matching family: ${sheet.unmatched.join(', ')}`);

  const levels: FamilyLevels[] = [];
  for (const [family, stages] of families) {
    if (!LEVELED_TYPES.has(stages[0].type)) continue;
    const official = officialLevels(stages);
    const fromSheet = sheet.levels.find((l) => l.family === family);
    if (fromSheet) {
      const problems = crossCheck(fromSheet, official);
      if (problems.length) console.warn(`  ${family}: sheet differs from official data at ${problems.length} level(s): ${problems.slice(0, 3).join('; ')}`);
      levels.push(fromSheet);
    } else {
      levels.push({ family, title: stages[0].name, source: 'official', extraPrices: stages[0].xtraPrice, rows: official });
    }
  }

  console.log('3/4 Furniture sprites');
  const spriteKeys = [...new Set(defs.map((d) => d.sprite).filter((s): s is string => !!s))];
  const furnitureOpts = { outDir: path.join(PUBLIC_DIR, 'sprites/furniture'), publicPrefix: 'sprites/furniture', trim: true, force };
  const first = await syncSprites(
    spriteKeys.map((key) => ({ key, urls: [`${OFFICIAL_BASE}/assets/furniture/${key}.png`] })),
    furnitureOpts,
  );
  const sprites: Record<string, SpriteInfo> = { ...first.sprites };
  let missing = first.missing;
  if (missing.length) {
    // Fall back to the wiki's art, looked up by display name.
    const nameOf = new Map(defs.map((d) => [d.sprite, d.name]));
    const titles = missing.map((k) => `File:${nameOf.get(k)}.png`);
    const urls = await fileUrls(titles);
    const second = await syncSprites(
      missing.map((key, i) => ({ key, urls: urls.has(titles[i]) ? [urls.get(titles[i])!] : [] })),
      { ...furnitureOpts, force: true },
    );
    Object.assign(sprites, second.sprites);
    missing = second.missing;
  }
  for (const d of defs) if (d.sprite && !sprites[d.sprite]) d.sprite = null;
  console.log(`  ${Object.keys(sprites).length} sprites (${first.downloaded} new), ${missing.length} without art`);

  console.log('4/4 Wiki flooring + wallpaper icons');
  const cosmetics: Cosmetics = { floors: [], walls: [] };
  for (const [kind, category] of [['floors', 'Flooring_Icons'], ['walls', 'Wallpaper_Icons']] as const) {
    const titles = await categoryFiles(category);
    const urls = await fileUrls(titles);
    const jobs = titles.filter((t) => urls.has(t)).map((t) => ({ key: fileTitleToName(t), urls: [urls.get(t)!] }));
    const res = await syncSprites(jobs, {
      outDir: path.join(PUBLIC_DIR, `sprites/cosmetics/${kind}`),
      publicPrefix: `sprites/cosmetics/${kind}`,
      trim: true,
      maxSize: 192,
      force,
    });
    cosmetics[kind] = jobs
      .filter((j) => res.sprites[j.key])
      .map((j): Cosmetic => ({ id: safeFileName(j.key), name: j.key, file: res.sprites[j.key].file }))
      .sort((a, b) => a.name.localeCompare(b.name));
    console.log(`  ${kind}: ${cosmetics[kind].length}`);
  }

  const counts = {
    furniture: defs.length,
    families: families.size,
    sprites: Object.keys(sprites).length,
    levelFamilies: levels.length,
    shopExpansions: sheet.expansions.shop.length,
    basementExpansions: sheet.expansions.basement.length,
    floors: cosmetics.floors.length,
    walls: cosmetics.walls.length,
  };
  const problems: string[] = [];
  if (counts.furniture < 800) problems.push(`only ${counts.furniture} furniture records`);
  if (counts.shopExpansions < 20) problems.push(`only ${counts.shopExpansions} shop expansions`);
  if (counts.basementExpansions < 20) problems.push(`only ${counts.basementExpansions} basement expansions`);
  for (const l of levels) {
    const stages = families.get(l.family)!.length;
    if (stages > 1 && l.rows.length !== 25) problems.push(`${l.family} has ${l.rows.length} level rows`);
  }
  if (problems.length) {
    console.error(`Sync looks wrong, nothing written:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }

  await write('furniture.json', defs);
  await write('sprites.json', sprites);
  await write('levels.json', levels);
  await write('expansions.json', sheet.expansions, true);
  await write('cosmetics.json', cosmetics, true);
  const meta: SyncMeta = {
    syncedAt: new Date().toISOString(),
    sources: {
      official: `${OFFICIAL_BASE}/furniture`,
      sheet: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/`,
      wiki: WIKI_API,
    },
    counts,
  };
  await write('meta.json', meta, true);
  console.log('Done:', counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
