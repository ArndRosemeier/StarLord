import { Texture } from "pixi.js";

/**
 * Procedural textures for the galaxy map, drawn once on a canvas and shared.
 * All of them are white (or grey) so sprites can tint them any colour.
 */

const cache = new Map<string, Texture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = Texture.from(c);
  cache.set(key, t);
  return t;
}

/** A soft round glow. */
export const glow = () => make("glow", 128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
});

/** Four-pointed lens flare for bright stars. */
export const flare = () => make("flare", 128, 128, (ctx) => {
  for (const [w, h] of [[128, 6], [6, 128]] as const) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
});

/** A star's disc: bright, with a softly darkening rim (limb darkening) instead of a hard edge. */
export const starDisc = () => make("disc", 64, 64, (ctx) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.62, "rgba(235,235,235,1)");
  g.addColorStop(0.86, "rgba(170,170,170,0.95)");
  g.addColorStop(1, "rgba(120,120,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
});

/** A corona: a ring of faint streamers fading outward, for explored stars. */
export const corona = () => make("corona", 256, 256, (ctx) => {
  ctx.translate(128, 128);
  ctx.globalCompositeOperation = "lighter";
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const len = 50 + rand() * 72;
    const w = 1.5 + rand() * 4;
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,255,${0.12 + rand() * 0.16})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -w);
    ctx.quadraticCurveTo(len * 0.5, (rand() - 0.5) * 10, len, 0);
    ctx.quadraticCurveTo(len * 0.5, (rand() - 0.5) * 10, 0, w);
    ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,0.35)");
  g.addColorStop(0.3, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
});

/** Smooth value noise in [0, 1], tiling every `period` cells. */
function noise(seed: number, period: number) {
  const hash = (x: number, y: number) => {
    let h = (((x % period) + period) % period) * 374761393 + (((y % period) + period) % period) * 668265263 + seed * 2246822519;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * u;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

/** A wispy cloud for nebulae: warped, ridged noise fading to nothing at the edge. `variant` picks one of a few shapes. */
export const cloud = (variant: number) => make(`cloud${variant}`, 160, 160, (ctx) => {
  // Small, since it is drawn once per variant on the main thread; the wisps are soft anyway.
  const size = 160;
  const img = ctx.createImageData(size, size);
  const fbm = (seed: number) => {
    const octaves = [0, 1, 2, 3, 4].map((o) => ({ n: noise(seed * 13 + o + 1, 1 << (o + 2)), f: 1 << (o + 2), a: 0.5 ** o }));
    return (x: number, y: number, ridged = false) => {
      let v = 0;
      for (const o of octaves) {
        const n = o.n(x * o.f, y * o.f);
        v += (ridged ? 1 - Math.abs(n * 2 - 1) : n) * o.a;
      }
      return v / 1.9375;
    };
  };
  const warpX = fbm(variant * 3 + 1);
  const warpY = fbm(variant * 3 + 2);
  const shape = fbm(variant * 3 + 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Bend the pattern by another noise field, so it streams into filaments.
      const wu = u + (warpX(u, v) - 0.5) * 0.35;
      const wv = v + (warpY(u, v) - 0.5) * 0.35;
      const ridge = shape(wu, wv, true);
      const body = warpX(wv, wu);
      const fall = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2);
      const a = Math.max(0, ridge ** 3 * 1.6 + body * 0.35 - 0.3) * fall ** 1.3;
      const k = (y * size + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
});

/** A tapered streak, opaque at the right end, for engine trails. */
export const streak = () => make("streak", 128, 16, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.7, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0.9)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(128, 2);
  ctx.lineTo(128, 14);
  ctx.closePath();
  ctx.fill();
});

/** Darkened screen edges, to pull the eye to the middle. */
export const vignette = () => make("vignette", 256, 256, (ctx) => {
  const g = ctx.createRadialGradient(128, 128, 70, 128, 128, 182);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,6,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
});

/** A tile of faint far-away stars, repeated behind the map and moved slower than it for depth. */
export const farStars = () => make("farStars", 512, 512, (ctx) => {
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const tint = rand();
    const r = rand() ** 3 * 1.3 + 0.35;
    ctx.fillStyle = tint < 0.15 ? "#ffd9a0" : tint < 0.35 ? "#a9c8ff" : "#ffffff";
    ctx.globalAlpha = 0.12 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
});
