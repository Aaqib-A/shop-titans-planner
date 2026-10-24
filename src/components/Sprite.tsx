import type { FurnitureDef } from '../data/schema';
import { spriteFor } from '../data/catalog';
import { assetUrl } from '../render/spriteCache';

export function Sprite({ def, size = 56, mirror = false }: { def: FurnitureDef; size?: number; mirror?: boolean }) {
  const sprite = spriteFor(def);
  if (!sprite) return <div className="sprite sprite-missing" style={{ width: size, height: size }} />;
  return (
    <img
      className="sprite"
      src={assetUrl(sprite.file)}
      alt=""
      loading="lazy"
      draggable={false}
      width={size}
      height={size}
      style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
    />
  );
}
