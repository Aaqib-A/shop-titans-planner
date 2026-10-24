import { analysisFor, getActiveLayout } from '../store/layoutStore';
import type { ViewKind } from '../store/uiStore';
import { buildScene, renderers } from './CanvasView';
import { getCosmetic, spriteFor } from '../data/catalog';
import { loadImage } from './spriteCache';

const BACKGROUND = '#1d1914';

/** Waits until every image the layout uses has loaded (or failed). */
async function preload(): Promise<void> {
  const layout = getActiveLayout();
  const files = analysisFor(layout).resolved.map((r) => spriteFor(r.stage)?.file);
  files.push(getCosmetic('floor', layout.shop.floor)?.file, getCosmetic('wall', layout.shop.wall)?.file);
  await Promise.all([...new Set(files.filter((f): f is string => !!f))].map(loadImage));
}

export async function exportPng(view: ViewKind, scale = 1.5): Promise<void> {
  await preload();
  const layout = getActiveLayout();
  const renderer = renderers[view];
  const b = renderer.worldBounds(analysisFor(layout).geometry);
  const max = 8192;
  const s = Math.min(scale, max / b.w, max / b.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.w * s);
  canvas.height = Math.ceil(b.h * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, -b.x * s, -b.y * s);
  ctx.imageSmoothingQuality = 'high';
  renderer.draw(ctx, buildScene({ selected: null, pickingDoor: false, showPath: false, zoom: s }));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the image');
  download(blob, `${safeName(layout.name)}-${view}.png`);
}

export function safeName(name: string): string {
  return name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'shop';
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
