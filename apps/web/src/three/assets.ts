import * as THREE from "three";

/**
 * Textures for 3D scenes. Paths are relative to the public folder ("textures/hull.webp")
 * and resolve against the page, so the build works under any base path, offline too.
 * A cache hands out shared textures and frees them when it is disposed.
 */

export function assetUrl(path: string): string {
  return path.replace(/^\/+/, "");
}

export interface TextureOptions {
  /** Colour data (sRGB) rather than masks or normals. Default true. */
  color?: boolean;
  /** Repeat the texture this many times across U and V. */
  repeat?: [number, number];
  /** Called when the image fails to load, e.g. to swap in a fallback. */
  onError?: () => void;
}

export class TextureCache {
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();
  private disposed = false;

  constructor(private maxAnisotropy = 4) {}

  /** A texture that fills in once the image arrives; the same path and options share one texture. */
  get(path: string, opts: TextureOptions = {}): THREE.Texture {
    const key = `${path}|${opts.color ?? true}|${opts.repeat?.join("x") ?? ""}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const tex = this.loader.load(assetUrl(path), undefined, undefined, () => {
      if (!this.disposed) opts.onError?.();
    });
    tex.colorSpace = opts.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    if (opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    this.textures.set(key, tex);
    return tex;
  }

  /** Keeps a texture made elsewhere (e.g. drawn on a canvas) so it is freed with the rest. */
  adopt<T extends THREE.Texture>(key: string, make: () => T): T {
    const hit = this.textures.get(key);
    if (hit) return hit as T;
    const tex = make();
    this.textures.set(key, tex);
    return tex;
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}

/** A soft round glow, white in the middle and fading to nothing, for sprites and particles. */
export function glowTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(0.6, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
