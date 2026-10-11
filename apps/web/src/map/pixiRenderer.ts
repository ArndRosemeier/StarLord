import { Application, Assets, Circle, Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import type { MapInput, MapRenderer } from "./renderer";
import type { FleetLook, MapScene } from "./scene";
import { prefersReducedMotion } from "../ui/fx";

/** Pixels per galaxy unit at zoom 1. */
const UNIT = 48;
const DRAG_THRESHOLD = 4;

const hex = (c: string) => parseInt(c.replace("#", ""), 16);
const ROUTE_OK = 0x7dd3fc;
const ROUTE_BAD = 0xff6b6b;
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

/** A soft round glow, white so sprites can tint it any colour. Made once and shared. */
let glowTexture: Texture | null = null;
function glow(): Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = Texture.from(c);
  return glowTexture;
}

/** Four-pointed lens flare for bright stars. */
let flareTexture: Texture | null = null;
function flare(): Texture {
  if (flareTexture) return flareTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  for (const [w, h] of [[128, 6], [6, 128]] as const) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  flareTexture = Texture.from(c);
  return flareTexture;
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
interface Trail { x1: number; y1: number; x2: number; y2: number; color: number; selected: boolean }
const NEBULA_URL = "art/galaxy.webp";
/** How far the nebula moves relative to the map when panning, for a sense of depth. */
const PARALLAX = 0.06;

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
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private lastSize = "";
  private destroyed = false;
  /** Soft empire-coloured glow around owned systems, under everything else. */
  private territory = new Container();
  private trails = new Graphics();
  private pulses: Pulse[] = [];
  private spins: Spin[] = [];
  private trailList: Trail[] = [];
  private twinkle: { g: Graphics; phase: number }[] = [];
  private time = 0;
  private still = prefersReducedMotion();

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
    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.backdrop, this.territory, this.trails, this.world, this.hover);
    this.app.ticker.add(this.animate);
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
      if (e.button !== 0) return;
      this.drag = { x: e.global.x, y: e.global.y, camX: this.camera.x, camY: this.camera.y, moved: false };
    });
    this.app.stage.on("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.global.x - this.drag.x;
      const dy = e.global.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.drag.moved = true;
      if (this.drag.moved) {
        this.camera.x = this.drag.camX + dx;
        this.camera.y = this.drag.camY + dy;
      }
    });
    const endDrag = () => {
      this.drag = null;
    };
    this.app.stage.on("pointerup", (e) => {
      if (this.drag && !this.drag.moved && e.target === this.app.stage) this.input.onBackground();
      endDrag();
    });
    this.app.stage.on("pointerupoutside", endDrag);
    this.mounted = true;
    if (this.pending) this.render(this.pending);
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

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = this.camera.scale.x;
    const next = Math.min(4, Math.max(0.3, old * Math.exp(-e.deltaY * 0.0015)));
    // Zoom around the cursor.
    this.camera.x = mx - ((mx - this.camera.x) * next) / old;
    this.camera.y = my - ((my - this.camera.y) * next) / old;
    this.camera.scale.set(next);
  };

  focus(x: number, y: number): void {
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
    this.drawTrails(t * 22);
  };

  /** Fleet routes as dashes flowing toward the destination. */
  private drawTrails(offset: number): void {
    const g = this.trails.clear();
    for (const r of this.trailList) {
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
    for (const child of this.territory.removeChildren()) child.destroy();
    this.pulses = [];
    this.spins = [];
    this.trailList = [];
    const rand = (id: string) => {
      let h = 0;
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return (h % 1000) / 1000;
    };

    // Nebulae: soft violet clouds under the territory glow.
    for (const n of scene.nebulae) {
      const cloud = glowSprite(0x9b6bd6, n.r * UNIT * 2.6, 0.32);
      cloud.position.set(n.x * UNIT, n.y * UNIT);
      this.territory.addChild(cloud);
    }
    // Wormholes: a faint dashed link joining the pair.
    if (scene.wormholes.length > 0) {
      const links = new Graphics();
      for (const w of scene.wormholes) dashTo(links, w.x1 * UNIT, w.y1 * UNIT, w.x2 * UNIT, w.y2 * UNIT, 3, 6);
      links.stroke({ width: 1.5, color: 0x6ee7ff, alpha: 0.45 });
      this.territory.addChild(links);
    }

    for (const s of scene.stars) {
      if (s.owners.length === 0) continue;
      const t = glowSprite(hex(s.owners[0]!), UNIT * 5, 0.34);
      t.position.set(s.x * UNIT, s.y * UNIT);
      this.territory.addChild(t);
    }

    for (const f of scene.fleets) {
      if (!f.dest) continue;
      const selected = scene.selectedFleetIds.has(f.id);
      this.trailList.push({ x1: f.x * UNIT, y1: f.y * UNIT, x2: f.dest.x * UNIT, y2: f.dest.y * UNIT, color: hex(f.color), selected });
      if (selected && f.eta !== null) {
        const t = label(`arrives in ${turns(f.eta)}`, 0xffffff);
        t.position.set(f.dest.x * UNIT, f.dest.y * UNIT - 24);
        this.world.addChild(t);
      }
    }
    this.drawTrails(0);

    for (const s of scene.stars) {
      const node = new Container();
      node.position.set(s.x * UNIT, s.y * UNIT);
      const r = s.special === "orion" ? 9 : s.special === "raiderHome" ? 10 : 6;
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
        node.addChild(new Graphics().circle(0, 0, r).fill({ color, alpha: s.explored ? 1 : 0.55 }).circle(0, 0, r * 0.45).fill({ color: 0xffffff, alpha: s.explored ? 0.85 : 0.3 }));
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
        rings.circle(0, 0, r + 4 + i * 3).stroke({ width: 2, color: hex(c), alpha: 0.9 });
      });
      node.addChild(rings);
      if (s.guarded) {
        const skull = new Graphics().star(r + 8, -r - 6, 4, 4, 2).fill({ color: 0xff4d4d });
        node.addChild(skull);
        this.pulses.push({ obj: skull, base: 0.85, amp: 0.2, speed: 4, phase, prop: "alpha" });
      }
      if (s.id === scene.selectedStarId) {
        const sel = dashedRing(new Graphics(), r + 15, 16, 0.55).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
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
            fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fill: 0xd7def0,
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
        if (e.button !== 0) return;
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
      node.hitArea = new Circle(0, 0, Math.max(9, r + 2));
      node.on("pointertap", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.input.onFleet(f.id, e.shiftKey);
      });
      node.on("pointerdown", (e) => {
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
    let text = only && only.starId === star.id ? "stay here" : route.ok ? turns(route.turns) : "out of range";
    if (going.length > 1 && route.ok && inRange < going.length) text = `${inRange} of ${going.length} in range · ${text}`;
    const t = label(text, color, 13);
    t.position.set(star.x * UNIT, star.y * UNIT - 22);
    this.hover.addChild(t);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.mounted) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.placeNebula);
    this.app.ticker.remove(this.animate);
    this.app.destroy(true, { children: true });
    this.mounted = false;
  }
}
