// Downloads sprites, trims their transparent border and stores them as WebP.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { SpriteInfo } from '../../src/data/schema.ts';
import { fetchBuffer, mapLimit } from './http.ts';

export interface SpriteJob {
  key: string;
  urls: string[];
}

export interface SpriteOptions {
  outDir: string;
  /** Path prefix stored in SpriteInfo.file, relative to /public. */
  publicPrefix: string;
  /** Longest side after resizing; undefined keeps native size. */
  maxSize?: number;
  trim?: boolean;
  force?: boolean;
  concurrency?: number;
}

export const safeFileName = (key: string) =>
  key
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();

async function processImage(input: Buffer, opts: SpriteOptions): Promise<{ data: Buffer; w: number; h: number }> {
  let img = sharp(input).ensureAlpha();
  if (opts.trim) img = img.trim({ threshold: 1 });
  // Materialise the trim before resizing so the bounds come from the trimmed image.
  const trimmed = await img.png().toBuffer();
  let out = sharp(trimmed);
  if (opts.maxSize) out = out.resize({ width: opts.maxSize, height: opts.maxSize, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await out.webp({ quality: 85, alphaQuality: 90, effort: 5 }).toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Returns sprite info by key; keys whose every URL failed are listed in `missing`. */
export async function syncSprites(
  jobs: SpriteJob[],
  opts: SpriteOptions,
): Promise<{ sprites: Record<string, SpriteInfo>; missing: string[]; downloaded: number }> {
  await mkdir(opts.outDir, { recursive: true });
  const sprites: Record<string, SpriteInfo> = {};
  const missing: string[] = [];
  let downloaded = 0;
  await mapLimit(jobs, opts.concurrency ?? 4, async (job) => {
    const fileName = `${safeFileName(job.key)}.webp`;
    const outPath = path.join(opts.outDir, fileName);
    const file = `${opts.publicPrefix}/${fileName}`;
    if (!opts.force && existsSync(outPath)) {
      const meta = await sharp(await readFile(outPath)).metadata();
      sprites[job.key] = { file, w: meta.width ?? 0, h: meta.height ?? 0 };
      return;
    }
    for (const url of job.urls) {
      const buf = await fetchBuffer(url).catch(() => null);
      if (!buf) continue;
      const { data, w, h } = await processImage(buf, opts);
      await writeFile(outPath, data);
      sprites[job.key] = { file, w, h };
      downloaded++;
      return;
    }
    missing.push(job.key);
  });
  return { sprites, missing: missing.sort(), downloaded };
}
