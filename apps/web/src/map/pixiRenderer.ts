import { Application, Assets, Circle, Container, Graphics, Sprite, Text, Texture, TilingSprite, type Ticker } from "pixi.js";
import type { MapFlash } from "./flashes";
import type { MapInput, MapRenderer } from "./renderer";
import type { FleetLook, MapScene } from "./scene";
import { rangeLayer } from "./rangeOverlay";
import { borderSegments, chainSegments, computeTerritory, TERRITORY_REACH, type Territory } from "./territory";
import { cloud, corona, farStars, flare, glow, starDisc, streak, vignette } from "./textures";
import { prefersReducedMotion } from "../ui/fx";
import { HOLD_MS, HOLD_SLOP, additive, buzz, isTouchDevice } from "../ui/touch";

/** Pixels per galaxy unit at zoom 1. */
const UNIT = 48;
const DRAG_THRESHOLD = 4;

const hex = (c: string) => parseInt(c.replace("#", ""), 16);
const ROUTE_OK = 0x7dd3fc;
const ROUTE_BAD = 0xff6b6b;
/** Range overlay colours; the map's toggle buttons use the same ones (see .map-overlays in lists.css). */
const FUEL_COLOR = 0x34d399;
const SCAN_COLOR = 0xfbbf24;
const turns = (n: number) => `${n} turn${n === 1 ? "" : "s"}`;

function label(text: string, color: number, size = 12): Text {
  const t = new Text({ text, style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: size, fill: color, fontWeight: "600" } });
  t.anchor.set(0.5, 1);
  t.resolution = 2;
  return t;
}

/** Pixi has no dashed strokes, so lay the segments out by hand; `offset` slides the dashes along the line. */
function dashTo(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash = 7, gap = 5, offset = 0): Graphics {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d === 0) return g;
  const ux = (x2 - x1) / d;
  const uy = (y2 - y1) / d;
  for (let t = (offset % (dash + gap)) - (dash + gap); t < d; t += dash + gap) {
    const b = Math.max(0, t);
    const e = Math.min(d, t + dash);
    if (e <= b) continue;
    g.moveTo(x1 + ux * b, y1 + uy * b).lineTo(x1 + ux * e, y1 + uy * e);
  }
  return g;
}

/** A dashed circle, drawn as separate arcs. */
function dashedRing(g: Graphics, r: number, segments: number, fill = 0.6): Graphics {
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a = i * step;
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r).arc(0, 0, r, a, a + step * fill);
  }
  return g;
}

function glowSprite(color: number, size: number, alpha: number): Sprite {
  const s = new Sprite(glow());
  s.anchor.set(0.5);
  s.tint = color;
  s.alpha = alpha;
  s.width = s.height = size;
  s.blendMode = "add";
  return s;
}

/**
 * Empire space as one picture, a pixel per grid point: each empire's colour, brightest just
 * inside its border and fading toward its heart, so the edge of a realm reads at a glance.
 */
function territorySprite(t: Territory): Sprite {
  const c = document.createElement("canvas");
  c.width = t.cols;
  c.height = t.rows;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(t.cols, t.rows);
  const rgb = t.empires.map((e) => hex(e));
  for (let k = 0; k < t.owner.length; k++) {
    const e = t.owner[k]!;
    if (e < 0) continue;
    const m = t.margin[e]![k]!;
    const edge = Math.max(0, 1 - m / 0.3);
    const a = Math.min(1, m / 0.02) * (0.07 + 0.17 * edge * edge);
    const col = rgb[e]!;
    img.data[k * 4] = (col >> 16) & 0xff;
    img.data[k * 4 + 1] = (col >> 8) & 0xff;
    img.data[k * 4 + 2] = col & 0xff;
    img.data[k * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const s = new Sprite(Texture.from(c));
  // Pixel centres sit on the grid points.
  s.position.set((-TERRITORY_REACH - t.cell / 2) * UNIT, (-TERRITORY_REACH - t.cell / 2) * UNIT);
  s.width = t.cols * t.cell * UNIT;
  s.height = t.rows * t.cell * UNIT;
  return s;
}

const OUTLINE = { width: 1, color: 0x000000, alpha: 0.7 };
const SHINE = { color: 0xffffff, alpha: 0.28 };
/** Warship silhouettes grow with the hull; points are mirrored below the axis, nose toward +x. */
const WARSHIP_HALF: Record<Exclude<FleetLook["hull"], "doomStar">, number[]> = {
  frigate: [7, 0, -5, -4.5, -2, 0],
  destroyer: [9, 0, -1, -3, -6, -6.5, -4, 0],
  cruiser: [11, 0, 3, -3, -1, -7, -7, -7, -5, -3, -7, 0],
  battleship: [13, 0, 5, -4, 0, -9, -8, -9, -5, -4, -9, -2, -9, 0],
  titan: [15, 0, 7, -4, 3, -11, -9, -11, -11, -7, -6, -4, -11, -2, -11, 0],
};
const mirror = (half: number[]): number[] => {
  const pts = [...half];
  for (let i = half.length - 4; i >= 2; i -= 2) pts.push(half[i]!, -half[i + 1]!);
  return pts;
};

/** A distinct vector icon per ship role and warship hull, nose toward +x; `tail` is where the engine glow sits, `r` its rough radius. */
function shipIcon(look: FleetLook, color: number): { g: Graphics; tail: number; r: number } {
  const g = new Graphics();
  switch (look.role) {
    case "scout":
      g.poly([7, 0, 0, -2.5, -5, -4.5, -3, 0, -5, 4.5, 0, 2.5]).fill({ color }).stroke(OUTLINE).circle(1, 0, 1.4).fill({ color: 0xffffff, alpha: 0.85 });
      return { g, tail: -4, r: 7 };
    case "colony":
      g.ellipse(0, 0, 7.5, 4.5).fill({ color }).stroke(OUTLINE).circle(1.5, 0, 2.6).fill({ color: 0xbfffd0, alpha: 0.9 });
      return { g, tail: -7, r: 8 };
    case "outpost":
      g.rect(-5, -4.5, 9, 9).fill({ color }).stroke(OUTLINE).rect(-2.5, -2, 4, 4).fill({ color: 0xffffff, alpha: 0.6 })
        .moveTo(4, 0).lineTo(8, 0).stroke({ width: 1.5, color }).circle(8, 0, 1.3).fill({ color: 0xffffff });
      return { g, tail: -5, r: 8 };
    case "transport":
      g.roundRect(-7, -3.5, 14, 7, 2).fill({ color }).stroke(OUTLINE);
      for (const x of [-3.5, 0, 3.5]) g.circle(x, 0, 1.1).fill({ color: 0xffffff, alpha: 0.85 });
      return { g, tail: -7, r: 8 };
    case "warship": {
      if (look.hull === "doomStar") {
        g.poly([17, 0, 9, -3, 9, 3]).fill({ color }).stroke(OUTLINE).circle(0, 0, 10).fill({ color }).stroke(OUTLINE)
          .circle(4, -3, 3.2).fill({ color: 0x000000, alpha: 0.45 }).arc(0, 0, 10, Math.PI, Math.PI * 1.5).lineTo(0, 0).fill(SHINE);
        return { g, tail: -10, r: 12 };
      }
      const half = WARSHIP_HALF[look.hull];
      g.poly(mirror(half)).fill({ color }).stroke(OUTLINE).poly(half).fill(SHINE);
      const xs = half.filter((_, i) => i % 2 === 0);
      const back = Math.min(...xs);
      return { g, tail: back + 2, r: Math.max(half[0]!, -back, ...half.filter((_, i) => i % 2 === 1).map((y) => -y)) };
    }
  }
}

/** Things the ticker keeps moving between renders. */
interface Pulse { obj: Container; base: number; amp: number; speed: number; phase: number; prop: "scale" | "alpha" }
interface Spin { obj: Container; speed: number }
/** A ring that keeps swelling and fading from a point, `period` seconds per wave. */
interface Ripple { g: Graphics; color: number; period: number; phase: number; reach: number }
/** One wave of a ripple, `p` from 0 (just started) to 1 (gone). */
function drawRipple(r: Ripple, p: number): void {
  r.g.clear().circle(0, 0, 6 + r.reach * p).stroke({ width: 1.5, color: r.color, alpha: 0.6 * (1 - p) ** 1.5 });
}
/** A flash in progress; `t` counts seconds since it started (negative while it waits its turn). */
interface LiveFlash {
  f: MapFlash; calm: boolean; t: number; node: Container;
  core: Sprite; spark: Sprite; rays: Sprite; rings: Graphics; text: Text;
}
/** How long a flash bursts, and how long its label stays, in seconds. */
const FLASH_BURST = 1.4;
const FLASH_LABEL = 3.2;
interface Trail { x1: number; y1: number; x2: number; y2: number; color: number; selected: boolean }
const NEBULA_URL = "art/galaxy.webp";
/** How far the nebula moves relative to the map when panning, for a sense of depth. */
const PARALLAX = 0.06;
/** The repeated far star field moves at this fraction of the map's speed. */
const FAR_PARALLAX = 0.3;
/** Relative star sizes by colour: hot blue giants big, brown dwarfs small. */
const STAR_SIZE: Record<string, number> = { blue: 1.2, white: 1.06, yellow: 1, orange: 0.94, red: 0.86, brown: 0.78 };
/** Empire borders: line and glow widths in screen pixels, kept constant while zooming. */
const BORDER_LINE = 1.6;
const BORDER_GLOW = 7;

/** Mix a colour toward white, for owner-tinted names that stay easy to read. */
function lighten(c: number, k: number): number {
  const ch = (shift: number) => {
    const v = (c >> shift) & 0xff;
    return Math.round(v + (255 - v) * k) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

export class PixiMapRenderer implements MapRenderer {
  private app = new Application();
  private camera = new Container();
  private nebula: Sprite | null = null;
  private backdrop = new Container();
  private world = new Container();
  /** The route preview under the cursor, redrawn on hover without rebuilding the map. */
  private hover = new Container();
  private hoverStarId: string | null = null;
  private scene: MapScene | null = null;
  private input!: MapInput;
  private container!: HTMLElement;
  private mounted = false;
  private pending: MapScene | null = null;
  private pendingFocus: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  /** Fingers on the map, for pinch zoom; screen positions by pointer id. */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; scale: number; cx: number; cy: number; camX: number; camY: number } | null = null;
  /** Set by a pinch or a hold until every finger is lifted, so lifting does not also tap. */
  private gestured = false;
  private hold: { timer: number; x: number; y: number; id: number } | null = null;
  private lastSize = "";
  /** Zoom that shows the whole map; big maps may need to zoom out further than the usual limit. */
  private fitScale = 1;
  private destroyed = false;
  /** Soft empire-coloured glow around owned systems, under everything else. */
  private territory = new Container();
  /** Empire space: a soft fill and glowing border lines, rebuilt only when colonies change hands. */
  private borders = new Container();
  private borderLines: { color: number; lines: number[][] }[] = [];
  private borderGfx = new Graphics();
  private borderScale = 0;
  private territoryKey = "";
  private territoryFill: Sprite | null = null;
  private far: TilingSprite | null = null;
  private shade: Sprite | null = null;
  private ripples: Ripple[] = [];
  private trails = new Graphics();
  /** Turn-start flashes, drawn above everything at a constant size on screen. */
  private fx = new Container();
  private flashes: LiveFlash[] = [];
  private pendingFlashes: { flashes: MapFlash[]; calm: boolean } | null = null;
  private pulses: Pulse[] = [];
  private spins: Spin[] = [];
  private trailList: Trail[] = [];
  private twinkle: { g: Graphics; phase: number }[] = [];
  private time = 0;
  private still = prefersReducedMotion();
  private coarse = isTouchDevice();

  async mount(container: HTMLElement, input: MapInput): Promise<void> {
    this.container = container;
    this.input = input;
    await this.app.init({
      background: "#04050b",
      resizeTo: container,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    container.appendChild(this.app.canvas);
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.canvas.style.touchAction = "none";
    this.app.canvas.addEventListener("pointerdown", this.onTouchDown);
    window.addEventListener("pointermove", this.onTouchMove);
    window.addEventListener("pointerup", this.onTouchUp);
    window.addEventListener("pointercancel", this.onTouchUp);
    this.far = new TilingSprite({ texture: farStars(), width: this.app.screen.width, height: this.app.screen.height });
    this.far.alpha = 0.8;
    this.shade = new Sprite(vignette());
    this.shade.eventMode = "none";
    this.app.stage.addChild(this.far, this.camera, this.shade);
    this.borders.addChild(this.borderGfx);
    this.camera.addChild(this.backdrop, this.territory, this.borders, this.trails, this.world, this.hover, this.fx);
    this.app.ticker.add(this.placeSky);
    this.fx.eventMode = "none";
    this.app.ticker.add(this.animate);
    this.app.ticker.add(this.animateFlashes);
    void Assets.load<Texture>(NEBULA_URL).then((texture) => {
      if (this.destroyed) return;
      this.nebula = new Sprite(texture);
      this.nebula.anchor.set(0.5);
      this.nebula.alpha = 0.6;
      this.app.stage.addChildAt(this.nebula, 0);
      this.app.ticker.add(this.placeNebula);
    }).catch(() => {});
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => {
      if (e.button !== 0 || this.pinch) return;
      this.drag = { x: e.global.x, y: e.global.y, camX: this.camera.x, camY: this.camera.y, moved: false };
    });
    this.app.stage.on("pointermove", (e) => {
      if (!this.drag || this.pinch) return;
      const dx = e.global.x - this.drag.x;
      const dy = e.global.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > (e.pointerType === "mouse" ? DRAG_THRESHOLD : HOLD_SLOP)) this.drag.moved = true;
      if (this.drag.moved) {
        this.camera.x = this.drag.camX + dx;
        this.camera.y = this.drag.camY + dy;
      }
    });
    const endDrag = () => {
      this.drag = null;
    };
    this.app.stage.on("pointerup", (e) => {
      if (this.drag && !this.drag.moved && !this.gestured && e.target === this.app.stage) this.input.onBackground();
      endDrag();
    });
    this.app.stage.on("pointerupoutside", endDrag);
    this.mounted = true;
    if (this.pending) this.render(this.pending);
    if (this.pendingFocus) this.focus(this.pendingFocus.x, this.pendingFocus.y);
    this.pendingFocus = null;
    if (this.pendingFlashes) this.flash(this.pendingFlashes.flashes, this.pendingFlashes.calm);
    this.pendingFlashes = null;
  }

  flash(flashes: MapFlash[], calm: boolean): void {
    if (!this.mounted) {
      this.pendingFlashes = { flashes, calm };
      return;
    }
    for (const f of flashes) {
      const node = new Container();
      node.position.set(f.x * UNIT, f.y * UNIT);
      node.visible = false;
      const rays = new Sprite(flare());
      rays.anchor.set(0.5);
      rays.tint = f.color;
      rays.blendMode = "add";
      const core = glowSprite(f.color, 10, 0);
      const spark = glowSprite(0xffffff, 10, 0);
      const rings = new Graphics();
      rings.blendMode = "add";
      const text = new Text({
        text: f.label,
        style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, fill: f.color, fontWeight: "700", stroke: { color: 0x000000, width: 3 } },
      });
      text.anchor.set(0.5, 1);
      text.resolution = 2;
      text.alpha = 0;
      node.addChild(core, rays, rings, spark, text);
      this.fx.addChild(node);
      this.flashes.push({ f, calm, t: -f.delay, node, core, spark, rays, rings, text });
    }
  }

  /** Keep the nebula covering the screen, drifting slightly with the camera. */
  private placeNebula = () => {
    const n = this.nebula;
    if (!n) return;
    const { width, height } = this.app.screen;
    const cover = Math.max(width / n.texture.width, height / n.texture.height) * 1.15;
    n.scale.set(cover);
    const maxX = (n.width - width) / 2;
    const maxY = (n.height - height) / 2;
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    // A very slow drift keeps the sky alive even when the camera is still.
    const drift = this.still ? 0 : this.time;
    n.position.set(
      width / 2 + clamp((this.camera.x - width / 2) * PARALLAX + Math.sin(drift * 0.03) * maxX * 0.5, maxX),
      height / 2 + clamp((this.camera.y - height / 2) * PARALLAX + Math.cos(drift * 0.023) * maxY * 0.5, maxY),
    );
  };

  /**
   * Every frame, motion or not: the far star field follows the camera slowly, the vignette
   * covers the screen, and border lines are redrawn when the zoom has changed enough that
   * their on-screen width would drift.
   */
  private placeSky = () => {
    const { width, height } = this.app.screen;
    const s = this.camera.scale.x;
    if (this.far) {
      this.far.width = width;
      this.far.height = height;
      this.far.tilePosition.set(this.camera.x * FAR_PARALLAX, this.camera.y * FAR_PARALLAX);
    }
    if (this.shade) {
      this.shade.width = width;
      this.shade.height = height;
    }
    if (this.borderLines.length > 0 && Math.abs(Math.log(s / this.borderScale)) > 0.12) this.drawBorders();
  };

  /** Empire border lines at the current zoom: a wide faint glow under a thin bright line. */
  private drawBorders(): void {
    const s = this.camera.scale.x;
    this.borderScale = s;
    const g = this.borderGfx.clear();
    for (const pass of [{ w: BORDER_GLOW, a: 0.16 }, { w: BORDER_LINE, a: 0.85 }]) {
      for (const { color, lines } of this.borderLines) {
        for (const l of lines) {
          g.moveTo(l[0]! * UNIT, l[1]! * UNIT);
          for (let k = 2; k < l.length; k += 2) g.lineTo(l[k]! * UNIT, l[k + 1]! * UNIT);
        }
        g.stroke({ width: pass.w / s, color: pass.w === BORDER_LINE ? lighten(color, 0.25) : color, alpha: pass.a, cap: "round", join: "round" });
      }
    }
  }

  /** Recompute empire space when any colony changed hands (not on every selection click). */
  private drawTerritory(scene: MapScene): void {
    const stars = scene.stars.filter((s) => s.owners.length > 0);
    const key = `${scene.width}x${scene.height}|${stars.map((s) => `${s.id}:${s.owners.join("+")}`).join(",")}`;
    if (key === this.territoryKey) return;
    this.territoryKey = key;
    if (this.territoryFill) {
      this.territoryFill.destroy({ texture: true, textureSource: true });
      this.territoryFill = null;
    }
    const t = computeTerritory(stars, scene.width, scene.height);
    this.borderLines = t.empires.map((c, e) => ({ color: hex(c), lines: chainSegments(borderSegments(t, e)) }));
    this.borderScale = 0;
    if (this.borderLines.length === 0) {
      this.borderGfx.clear();
      return;
    }
    this.drawBorders();
    this.territoryFill = territorySprite(t);
    this.borders.addChildAt(this.territoryFill, 0);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this.zoomAt(mx, my, this.camera.scale.x * Math.exp(-e.deltaY * 0.0015));
  };

  /** Zoom to `scale`, keeping the galaxy point under screen position (x, y) in place. */
  private zoomAt(x: number, y: number, scale: number): void {
    const old = this.camera.scale.x;
    const next = Math.min(4, Math.max(Math.min(0.3, this.fitScale), scale));
    this.camera.x = x - ((x - this.camera.x) * next) / old;
    this.camera.y = y - ((y - this.camera.y) * next) / old;
    this.camera.scale.set(next);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Two fingers pinch to zoom and drag to pan; one finger pans through the stage's own drag.
  private onTouchDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    this.touches.set(e.pointerId, this.local(e));
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: this.camera.scale.x,
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, camX: this.camera.x, camY: this.camera.y,
      };
      this.drag = null;
      this.gestured = true;
      this.cancelHold();
    }
  };

  private onTouchMove = (e: PointerEvent) => {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, this.local(e));
    if (this.hold && e.pointerId === this.hold.id && Math.hypot(e.clientX - this.hold.x, e.clientY - this.hold.y) > HOLD_SLOP) this.cancelHold();
    const p = this.pinch;
    if (!p || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    // Pan with the fingers' midpoint, then zoom around it.
    this.camera.x = p.camX + (cx - p.cx);
    this.camera.y = p.camY + (cy - p.cy);
    this.camera.scale.set(p.scale);
    this.zoomAt(cx, cy, p.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist));
  };

  private onTouchUp = (e: PointerEvent) => {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.hold?.id === e.pointerId) this.cancelHold();
    if (this.touches.size < 2) this.pinch = null;
    // Let the tap events of this lift see the flag, then clear it.
    if (this.touches.size === 0) setTimeout(() => { if (this.touches.size === 0) this.gestured = false; }, 0);
  };

  /** A finger resting on a fleet adds it to the selection, like Shift-click. */
  private startHold(e: { pointerType: string; pointerId: number; clientX: number; clientY: number }, fire: () => void): void {
    if (e.pointerType === "mouse") return;
    this.cancelHold();
    const timer = window.setTimeout(() => {
      this.hold = null;
      if (this.pinch) return;
      this.gestured = true;
      this.drag = null;
      buzz();
      fire();
    }, HOLD_MS);
    this.hold = { timer, x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  private cancelHold(): void {
    if (this.hold) clearTimeout(this.hold.timer);
    this.hold = null;
  }

  focus(x: number, y: number): void {
    // A focus asked for while Pixi is still starting up (e.g. "show on map" from another screen) waits for the first render.
    if (!this.mounted) {
      this.pendingFocus = { x, y };
      return;
    }
    const s = this.camera.scale.x;
    this.camera.x = this.app.screen.width / 2 - x * UNIT * s;
    this.camera.y = this.app.screen.height / 2 - y * UNIT * s;
  }

  private fit(scene: MapScene): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const size = `${scene.width}x${scene.height}:${w}x${h}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
    const s = Math.min(w / ((scene.width + 2) * UNIT), h / ((scene.height + 2) * UNIT));
    this.fitScale = s;
    this.camera.scale.set(s);
    this.focus(scene.width / 2, scene.height / 2);
    this.drawBackdrop(scene);
  }

  private drawBackdrop(scene: MapScene): void {
    for (const child of this.backdrop.removeChildren()) child.destroy();
    this.twinkle = [];
    // Faint distant stars in a fixed pattern, split into a few layers that twinkle out of step.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = (scene.width + 20) * UNIT;
    const h = (scene.height + 20) * UNIT;
    const layers = Array.from({ length: 4 }, (_, i) => ({ g: new Graphics(), phase: i * 1.7 }));
    for (let i = 0; i < 1100; i++) {
      const tint = rand();
      const color = tint < 0.12 ? 0xffd9a0 : tint < 0.3 ? 0xa9c8ff : 0xffffff;
      layers[i % 4]!.g.circle(rand() * w - 10 * UNIT, rand() * h - 10 * UNIT, rand() * 1.4 + 0.3).fill({ color, alpha: 0.1 + rand() * 0.3 });
    }
    for (const l of layers) this.backdrop.addChild(l.g);
    this.twinkle = layers;
  }

  /** Per-frame motion: pulsing stars, spinning rings, flowing fleet routes and twinkling sky. */
  private animate = (ticker: Ticker) => {
    if (this.still) return;
    this.time += ticker.deltaMS / 1000;
    const t = this.time;
    for (const p of this.pulses) {
      const v = p.base * (1 + p.amp * Math.sin(t * p.speed + p.phase));
      if (p.prop === "scale") p.obj.scale.set(v);
      else p.obj.alpha = v;
    }
    for (const s of this.spins) s.obj.rotation += s.speed * ticker.deltaMS / 1000;
    for (const l of this.twinkle) l.g.alpha = 0.65 + 0.35 * Math.sin(t * 0.9 + l.phase);
    for (const r of this.ripples) drawRipple(r, ((t + r.phase) % r.period) / r.period);
    this.borders.alpha = 0.88 + 0.12 * Math.sin(t * 0.7);
    this.drawTrails(t * 22);
  };

  /**
   * Turn-start flashes: a white-hot spark, a coloured glow and two shock rings
   * bursting outward, then a label that lingers. In calm mode only the glow
   * swells and fades in place. Runs even when the rest of the map holds still.
   */
  private animateFlashes = (ticker: Ticker) => {
    if (this.flashes.length === 0) return;
    const dt = ticker.deltaMS / 1000;
    const inv = 1 / this.camera.scale.x;
    const out = (p: number) => 1 - (1 - p) ** 3;
    this.flashes = this.flashes.filter((l) => {
      l.t += dt;
      if (l.t < 0) return true;
      if (l.t > FLASH_LABEL) {
        l.node.destroy({ children: true });
        return false;
      }
      const { node, core, spark, rays, rings, text, f } = l;
      node.visible = true;
      node.scale.set(inv);
      const s = f.strength;
      const p = Math.min(1, l.t / FLASH_BURST);
      if (l.calm) {
        core.width = core.height = 90 * s;
        core.alpha = Math.sin(Math.PI * p) * 0.9;
        spark.alpha = rays.alpha = 0;
      } else {
        core.width = core.height = (30 + 130 * out(p)) * s;
        core.alpha = (1 - p) ** 1.4;
        spark.width = spark.height = (24 + 40 * out(p)) * s;
        spark.alpha = Math.max(0, 1 - l.t / 0.35);
        rays.width = rays.height = (60 + 140 * out(p)) * s;
        rays.rotation = p * 0.6;
        rays.alpha = (1 - p) ** 2;
        rings.clear();
        for (const [lag, reach, width] of [[0, 90, 3.5], [0.22, 60, 2]] as const) {
          const q = Math.min(1, Math.max(0, (l.t - lag) / FLASH_BURST));
          if (q <= 0 || q >= 1) continue;
          rings.circle(0, 0, 6 + reach * s * out(q)).stroke({ width: width * (1 - q) + 0.5, color: f.color, alpha: (1 - q) * 0.95 });
        }
      }
      text.y = -18 - 10 * s;
      text.alpha = Math.min(1, l.t / 0.25, (FLASH_LABEL - l.t) / 0.8);
      return true;
    });
  };

  /** Fleet routes as dashes flowing toward the destination. */
  private drawTrails(offset: number): void {
    const g = this.trails.clear();
    for (const r of this.trailList) {
      g.moveTo(r.x1, r.y1).lineTo(r.x2, r.y2).stroke({ width: r.selected ? 7 : 4, color: r.color, alpha: r.selected ? 0.16 : 0.08 });
      dashTo(g, r.x1, r.y1, r.x2, r.y2, r.selected ? 9 : 6, r.selected ? 6 : 6, offset);
      g.stroke({ width: r.selected ? 2.5 : 1.5, color: r.color, alpha: r.selected ? 0.95 : 0.5 });
    }
  }

  render(scene: MapScene): void {
    if (!this.mounted) {
      this.pending = scene;
      return;
    }
    this.scene = scene;
    this.fit(scene);
    for (const child of this.world.removeChildren()) child.destroy({ children: true });
    for (const child of this.territory.removeChildren()) child.destroy({ children: true });
    this.pulses = [];
    this.spins = [];
    this.ripples = [];
    this.trailList = [];
    const rand = (id: string) => {
      let h = 0;
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return (h % 1000) / 1000;
    };

    // Nebulae: a soft violet glow under two wispy cloud layers that turn slowly against each other.
    scene.nebulae.forEach((n, i) => {
      const base = glowSprite(0x7c4dbd, n.r * UNIT * 2.4, 0.22);
      base.position.set(n.x * UNIT, n.y * UNIT);
      this.territory.addChild(base);
      for (const [layer, tint, alpha, size] of [[0, 0xb48cff, 0.85, 2.6], [1, 0xff8ad8, 0.5, 2.2]] as const) {
        const c = new Sprite(cloud((i * 2 + layer) % 3));
        c.anchor.set(0.5);
        c.tint = tint;
        c.alpha = alpha;
        c.blendMode = "add";
        c.width = c.height = n.r * UNIT * size;
        c.position.set(n.x * UNIT, n.y * UNIT);
        c.rotation = rand(`${i}:${layer}`) * Math.PI * 2;
        this.territory.addChild(c);
        this.spins.push({ obj: c, speed: layer === 0 ? 0.012 : -0.018 });
      }
    });
    // Wormholes: a faint dashed link joining the pair.
    if (scene.wormholes.length > 0) {
      const links = new Graphics();
      for (const w of scene.wormholes) dashTo(links, w.x1 * UNIT, w.y1 * UNIT, w.x2 * UNIT, w.y2 * UNIT, 3, 6);
      links.stroke({ width: 1.5, color: 0x6ee7ff, alpha: 0.45 });
      this.territory.addChild(links);
    }
    // Empire-wide range displays, switched on from the map's overlay buttons.
    if (scene.scanRange.length > 0) this.territory.addChild(rangeLayer(scene.scanRange, UNIT, SCAN_COLOR, { fill: 0.08, dashed: true }));
    if (scene.fuelRange.length > 0) this.territory.addChild(rangeLayer(scene.fuelRange, UNIT, FUEL_COLOR, { fill: 0.1 }));

    // Empire space with its borders, plus a warm glow around each colonised star.
    this.drawTerritory(scene);
    for (const s of scene.stars) {
      if (s.owners.length === 0) continue;
      const t = glowSprite(hex(s.owners[0]!), UNIT * 3.2, 0.22);
      t.position.set(s.x * UNIT, s.y * UNIT);
      this.territory.addChild(t);
    }

    const ripplesAt = new Map<string, Ripple>();
    for (const f of scene.fleets) {
      if (!f.dest) continue;
      const selected = scene.selectedFleetIds.has(f.id);
      this.trailList.push({ x1: f.x * UNIT, y1: f.y * UNIT, x2: f.dest.x * UNIT, y2: f.dest.y * UNIT, color: hex(f.color), selected });
      // A slow ripple marks where the fleet will arrive (one per destination and colour).
      const rippleKey = `${f.dest.x},${f.dest.y},${f.color}`;
      if (!ripplesAt.has(rippleKey) || selected) {
        ripplesAt.get(rippleKey)?.g.destroy();
        const g = new Graphics();
        g.position.set(f.dest.x * UNIT, f.dest.y * UNIT);
        this.territory.addChild(g);
        const ripple = { g, color: hex(f.color), period: 2.6, phase: rand(f.id) * 2.6, reach: selected ? 30 : 22 };
        ripplesAt.set(rippleKey, ripple);
        drawRipple(ripple, 0.6);
      }
      if (selected && f.eta !== null) {
        const t = f.held ? label("held by hyperspace flux", 0xff8a8a) : label(`arrives in ${turns(f.eta)}`, 0xffffff);
        t.position.set(f.dest.x * UNIT, f.dest.y * UNIT - 24);
        this.world.addChild(t);
      }
    }
    this.ripples = [...ripplesAt.values()];
    this.drawTrails(0);

    for (const s of scene.stars) {
      const node = new Container();
      node.position.set(s.x * UNIT, s.y * UNIT);
      const r = s.special === "orion" ? 9 : s.special === "raiderHome" ? 10 : 6 * (STAR_SIZE[s.starColor] ?? 1);
      const color = hex(s.color);
      const phase = rand(s.id) * Math.PI * 2;
      if (scene.reachable.has(s.id)) {
        const reach = new Graphics().circle(0, 0, r + 12).fill({ color: 0x3b82f6, alpha: 0.16 }).stroke({ width: 1.5, color: 0x60a5fa, alpha: 0.75 });
        node.addChild(reach);
        this.pulses.push({ obj: reach, base: 0.8, amp: 0.25, speed: 3, phase, prop: "alpha" });
      }
      if (s.blackHole) {
        // A dark core inside a slowly turning purple accretion disc.
        const disc = glowSprite(color, r * 9, 0.9);
        node.addChild(disc);
        const swirl = new Graphics();
        for (let i = 0; i < 3; i++) dashedRing(swirl, r + 3 + i * 4, 7 + i * 2, 0.45).stroke({ width: 2 - i * 0.4, color: i === 1 ? 0xff7ad9 : 0xa98bff, alpha: 0.8 - i * 0.2 });
        node.addChild(swirl);
        this.spins.push({ obj: swirl, speed: 0.8 });
        node.addChild(new Graphics().circle(0, 0, r * 0.9).fill({ color: 0x000000 }).stroke({ width: 1.5, color: 0xd6c2ff, alpha: 0.9 }));
      } else {
        const halo = glowSprite(color, r * (s.explored ? 10 : 6), s.explored ? 0.9 : 0.45);
        node.addChild(halo);
        if (s.explored) {
          const crown = new Sprite(corona());
          crown.anchor.set(0.5);
          crown.tint = color;
          crown.blendMode = "add";
          crown.width = crown.height = r * 7;
          crown.alpha = 0.75;
          crown.rotation = phase;
          node.addChild(crown);
          this.spins.push({ obj: crown, speed: 0.025 + rand(s.id + "c") * 0.03 });
        }
        this.pulses.push({ obj: halo, base: halo.scale.x, amp: 0.08, speed: 1.2 + rand(s.id + "s"), phase, prop: "scale" });
        if (s.explored || s.special) {
          const spikes = new Sprite(flare());
          spikes.anchor.set(0.5);
          spikes.tint = color;
          spikes.blendMode = "add";
          spikes.width = spikes.height = r * (s.special ? 9 : 6);
          spikes.alpha = 0.55;
          spikes.rotation = rand(s.id + "r") * 0.6;
          node.addChild(spikes);
          this.spins.push({ obj: spikes, speed: 0.04 + rand(s.id + "v") * 0.05 });
        }
        const disc = new Sprite(starDisc());
        disc.anchor.set(0.5);
        disc.tint = color;
        disc.width = disc.height = r * 2.1;
        disc.alpha = s.explored ? 1 : 0.6;
        const heart = glowSprite(0xffffff, r * 2.2, s.explored ? 0.95 : 0.35);
        node.addChild(disc, heart);
      }
      if (s.special === "orion") {
        const ring = dashedRing(new Graphics(), r + 9, 12).stroke({ width: 1.5, color: 0xffd36b, alpha: 0.85 });
        node.addChild(ring);
        this.spins.push({ obj: ring, speed: 0.35 });
      }
      if (s.special === "raiderHome") {
        const ring = dashedRing(new Graphics(), r + 10, 6, 0.4).stroke({ width: 2, color: 0xff4d6d, alpha: 0.85 });
        node.addChild(ring);
        this.spins.push({ obj: ring, speed: -0.6 });
      }
      const rings = new Graphics();
      s.owners.forEach((c, i) => {
        rings.circle(0, 0, r + 4 + i * 3).stroke({ width: 4, color: hex(c), alpha: 0.22 });
        rings.circle(0, 0, r + 4 + i * 3).stroke({ width: 1.6, color: lighten(hex(c), 0.2), alpha: 0.95 });
      });
      node.addChild(rings);
      if (s.guarded) {
        const skull = new Graphics().star(r + 8, -r - 6, 4, 4, 2).fill({ color: 0xff4d4d });
        node.addChild(skull);
        this.pulses.push({ obj: skull, base: 0.85, amp: 0.2, speed: 4, phase, prop: "alpha" });
      }
      if (s.id === scene.selectedStarId) {
        // Four corner brackets turning slowly around a pulsing ring.
        const sel = new Graphics();
        const R = r + 17;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + Math.PI / 4;
          sel.moveTo(Math.cos(a - 0.32) * R, Math.sin(a - 0.32) * R).arc(0, 0, R, a - 0.32, a + 0.32);
        }
        sel.stroke({ width: 6, color: 0x9fd0ff, alpha: 0.25 }).stroke({ width: 2.2, color: 0xffffff, alpha: 0.95 });
        node.addChild(sel);
        this.spins.push({ obj: sel, speed: 0.6 });
        const ping = new Graphics().circle(0, 0, r + 15).stroke({ width: 1, color: 0x9fd0ff, alpha: 0.6 });
        node.addChild(ping);
        this.pulses.push({ obj: ping, base: 1, amp: 0.12, speed: 2.4, phase: 0, prop: "scale" });
      }
      // Unexplored systems carry no name on the map.
      if (s.explored) {
        const label = new Text({
          text: s.name,
          style: {
            fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fill: s.owners.length ? lighten(hex(s.owners[0]!), 0.55) : 0xc4cce0,
            fontWeight: s.owners.length ? "600" : "400",
            dropShadow: { color: 0x000000, alpha: 0.9, blur: 3, distance: 0, angle: 0 },
          },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, r + 6);
        label.resolution = 2;
        node.addChild(label);
      }
      node.eventMode = "static";
      const route = scene.routes.get(s.id);
      node.cursor = route && !route.ok ? "not-allowed" : "pointer";
      node.hitArea = new Circle(0, 0, r + 14);
      node.on("pointerover", () => {
        this.hoverStarId = s.id;
        if (!this.still) node.scale.set(1.15);
        this.drawHover();
      });
      node.on("pointerout", () => {
        node.scale.set(1);
        if (this.hoverStarId !== s.id) return;
        this.hoverStarId = null;
        this.drawHover();
      });
      node.on("pointertap", (e) => {
        if (e.button !== 0 || this.gestured) return;
        e.stopPropagation();
        this.input.onStar(s.id, "select");
      });
      node.on("pointerdown", (e) => {
        if (e.button !== 2) return;
        e.stopPropagation();
        this.input.onStar(s.id, "order");
      });
      this.world.addChild(node);
    }

    // Idle fleets orbiting a star are stacked to its right; fleets with orders to leave are stacked
    // on the left, nose toward their destination; fleets in transit sit on their path.
    // Each row of a stack is packed by icon size, so big hulls don't cover their neighbours.
    const stacks = new Map<string, { i: number; dx: number }>();
    for (const f of scene.fleets) {
      const icon = f.kind === "empire" ? shipIcon(f.look, hex(f.color)) : null;
      // Big hulls are drawn bigger, but shrunk a little so stacks around a star stay readable.
      const shrink = icon && icon.r > 9 ? 0.8 : 1;
      const r = icon ? icon.r * shrink : 7;
      let x = f.x * UNIT;
      let y = f.y * UNIT;
      if (f.starId) {
        const leaving = !!f.dest;
        const key = `${f.starId}:${leaving}`;
        const stack = stacks.get(key) ?? { i: 0, dx: 0 };
        if (stack.i % 3 === 0) stack.dx = 10;
        const dx = stack.dx + r;
        stack.dx = dx + r + 3;
        y += -12 + Math.floor(stack.i / 3) * 18;
        stack.i++;
        stacks.set(key, stack);
        x += leaving ? -dx : dx;
      }
      const node = new Container();
      node.position.set(x, y);
      const color = hex(f.color);
      const body = new Container();
      if (f.dest) body.rotation = Math.atan2(f.dest.y * UNIT - y, f.dest.x * UNIT - x);
      if (icon) {
        icon.g.scale.set(shrink);
        const engine = glowSprite(color, (f.dest ? 18 : 12) * Math.max(1, r / 8), 0.9);
        engine.x = icon.tail * shrink;
        if (f.dest && !f.starId) {
          // Under way: a tapered exhaust streak behind the ship.
          const trail = new Sprite(streak());
          trail.anchor.set(1, 0.5);
          trail.tint = color;
          trail.blendMode = "add";
          trail.width = 30 * Math.max(1, r / 8);
          trail.height = 5 * Math.max(1, r / 8);
          trail.x = icon.tail * shrink + 2;
          trail.alpha = 0.8;
          body.addChild(trail);
        }
        body.addChild(engine);
        if (f.dest) this.pulses.push({ obj: engine, base: engine.scale.x, amp: 0.25, speed: 14, phase: rand(f.id) * 6, prop: "scale" });
        body.addChild(icon.g);
      } else {
        const c = f.kind === "monsters" ? 0xff4d4d : 0xb04dff;
        const aura = glowSprite(c, 26, 0.7);
        body.addChild(aura);
        this.pulses.push({ obj: aura, base: aura.scale.x, amp: 0.2, speed: 2.5, phase: rand(f.id) * 6, prop: "scale" });
        body.addChild(new Graphics().poly([0, -6, 6, 0, 0, 6, -6, 0]).fill({ color: c }).stroke({ width: 1, color: 0x000000, alpha: 0.6 }));
      }
      node.addChild(body);
      if (f.starId) this.pulses.push({ obj: body, base: 1, amp: 0.06, speed: 2, phase: rand(f.id) * 6, prop: "scale" });
      if (f.ships > 1) {
        const badge = new Text({
          text: String(f.ships),
          style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 9, fill: 0xffffff, fontWeight: "700", stroke: { color: 0x000000, width: 3 } },
        });
        badge.anchor.set(0, 1);
        badge.resolution = 2;
        badge.position.set(r * 0.55, -r * 0.45);
        node.addChild(badge);
      }
      if (scene.selectedFleetIds.has(f.id)) {
        const sel = dashedRing(new Graphics(), r + 3, 8, 0.6).stroke({ width: 1.5, color: 0xffffff });
        node.addChild(sel);
        this.spins.push({ obj: sel, speed: 1.4 });
      }
      node.eventMode = "static";
      node.cursor = "pointer";
      // Fingers get a bigger target than the mouse.
      node.hitArea = new Circle(0, 0, Math.max(this.coarse ? 14 : 9, r + 2));
      node.on("pointertap", (e) => {
        if (e.button !== 0 || this.gestured) return;
        e.stopPropagation();
        this.input.onFleet(f.id, additive(e));
      });
      node.on("pointerdown", (e) => {
        if (e.button === 0) this.startHold(e, () => this.input.onFleet(f.id, true));
        if (e.button !== 2 || !f.starId) return;
        e.stopPropagation();
        this.input.onStar(f.starId, "order");
      });
      this.world.addChild(node);
    }
    this.drawHover();
  }

  /** While your fleets are selected, show each one's route to the star under the cursor. */
  private drawHover(): void {
    for (const child of this.hover.removeChildren()) child.destroy({ children: true });
    const scene = this.scene;
    const route = scene && this.hoverStarId ? scene.routes.get(this.hoverStarId) : undefined;
    if (!scene || !route) return;
    const star = scene.stars.find((s) => s.id === this.hoverStarId);
    if (!star) return;
    const fleets = scene.fleets.filter((f) => scene.fleetRoutes.has(f.id));
    // Fleets idle at this star stay put, and a current destination already carries its own arrival label.
    const going = fleets.filter((f) => !(f.starId === star.id && !f.dest) && !(f.dest && f.dest.x === star.x && f.dest.y === star.y));
    if (going.length === 0) return;
    let inRange = 0;
    for (const f of going) {
      const r = scene.fleetRoutes.get(f.id)!.get(star.id);
      if (r?.ok) inRange++;
      const g = dashTo(new Graphics(), f.x * UNIT, f.y * UNIT, star.x * UNIT, star.y * UNIT);
      g.stroke({ width: 2, color: r?.ok ? ROUTE_OK : ROUTE_BAD, alpha: 0.9 });
      this.hover.addChild(g);
    }
    const color = route.ok ? ROUTE_OK : ROUTE_BAD;
    const only = going.length === 1 ? going[0]! : null;
    let text = only && only.starId === star.id ? "stay here" : route.ok ? (route.held ? `held by hyperspace flux, then ${turns(route.turns)}` : turns(route.turns)) : "out of range";
    if (going.length > 1 && route.ok && inRange < going.length) text = `${inRange} of ${going.length} in range · ${text}`;
    const t = label(text, color, 13);
    t.position.set(star.x * UNIT, star.y * UNIT - 22);
    this.hover.addChild(t);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.mounted) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("pointerdown", this.onTouchDown);
    window.removeEventListener("pointermove", this.onTouchMove);
    window.removeEventListener("pointerup", this.onTouchUp);
    window.removeEventListener("pointercancel", this.onTouchUp);
    this.cancelHold();
    this.app.ticker.remove(this.placeNebula);
    this.app.ticker.remove(this.placeSky);
    this.app.ticker.remove(this.animate);
    this.app.ticker.remove(this.animateFlashes);
    this.app.destroy(true, { children: true });
    this.mounted = false;
  }
}
