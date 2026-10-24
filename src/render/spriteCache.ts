// Image loading for the canvas: sprites, alpha masks for pixel-accurate
// clicking, and repeating patterns cut from the cosmetic icons.

type Listener = () => void;

const images = new Map<string, HTMLImageElement>();
const listeners = new Set<Listener>();
const alphaMasks = new Map<string, { w: number; h: number; data: Uint8ClampedArray } | null>();
const patterns = new Map<string, HTMLCanvasElement | null>();

const base = import.meta.env.BASE_URL;
export const assetUrl = (file: string) => `${base}${file}`;

/** Called whenever another image finishes loading, so the canvas can redraw. */
export function onImageLoad(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getImage(file: string): HTMLImageElement | null {
  let img = images.get(file);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = assetUrl(file);
    images.set(file, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Resolves once the cached image for `file` has loaded (null if it failed). */
export function loadImage(file: string): Promise<HTMLImageElement | null> {
  getImage(file);
  const img = images.get(file)!;
  if (img.complete) return Promise.resolve(img.naturalWidth > 0 ? img : null);
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}

/** Alpha (0–255) at a point given in 0..1 image coordinates. */
export function alphaAt(file: string, u: number, v: number): number {
  let mask = alphaMasks.get(file);
  if (mask === undefined) {
    const img = getImage(file);
    if (!img) return 255;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 255;
    ctx.drawImage(img, 0, 0);
    try {
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const alpha = new Uint8ClampedArray(c.width * c.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      mask = { w: c.width, h: c.height, data: alpha };
    } catch {
      mask = null;
    }
    alphaMasks.set(file, mask);
  }
  if (!mask) return 255;
  const x = Math.floor(u * mask.w);
  const y = Math.floor(v * mask.h);
  if (x < 0 || y < 0 || x >= mask.w || y >= mask.h) return 0;
  return mask.data[y * mask.w + x];
}

/**
 * The cosmetic icons are small 3D previews of a tile. Crop the flat middle of
 * the face so it can repeat as a texture. Fractions are of the trimmed icon.
 */
const CROPS = {
  floor: { x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.55 },
  wall: { x0: 0.14, y0: 0.04, x1: 0.9, y1: 0.93 },
} as const;

export function getPatternSource(kind: 'floor' | 'wall', file: string): HTMLCanvasElement | null {
  const key = `${kind}:${file}`;
  if (patterns.has(key)) return patterns.get(key)!;
  const img = getImage(file);
  if (!img) return null;
  const crop = CROPS[kind];
  const sx = img.naturalWidth * crop.x0;
  const sy = img.naturalHeight * crop.y0;
  const sw = img.naturalWidth * (crop.x1 - crop.x0);
  const sh = img.naturalHeight * (crop.y1 - crop.y0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw));
  c.height = Math.max(1, Math.round(sh));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  patterns.set(key, c);
  return c;
}
