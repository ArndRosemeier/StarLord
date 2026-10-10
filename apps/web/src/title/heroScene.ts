import { ART_SPOTS, SHIPS, TITLE_ART, type ShipKind } from "./titleData";

/**
 * The living title screen: one canvas over the painted key art with twinkling stars,
 * shooting stars, ships flying past (some of them chased by fighters), glowing engines
 * and a flaring sun anchored to the painting, plus a few toys for the player: click a
 * ship to blow it up, click empty space to warp one in, and the hyperspace jump that
 * leads into a new game. All motion stops for players who prefer reduced motion.
 */

export interface SceneHooks {
  onToast: (text: string) => void;
  onSound: (effect: "boom" | "zap" | "warp") => void;
}

interface Ship {
  kind: ShipKind;
  x: number;
  y: number;
  vx: number;
  /** -1 flies left (the way the sprites face), 1 flies right. */
  dir: number;
  /** 0 = far away (small, slow, faint), 1 = close. */
  depth: number;
  scale: number;
  age: number;
  bob: number;
  hp: number;
  /** Fighters chasing a raider fire at it. */
  target?: Ship;
  cooldown: number;
  /** Counts down from 1 while the ship drops out of warp. */
  warpIn: number;
  dead: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; drag: number }
interface Bolt { x: number; y: number; vx: number; vy: number; life: number; target?: Ship }
interface Ring { x: number; y: number; r: number; vr: number; life: number; max: number; color: string }
interface Streak { x: number; y: number; vx: number; vy: number; life: number; max: number; len: number }

const MAX_SHIPS = 16;
const MAX_PARTICLES = 700;
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export class HeroScene {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private images = new Map<ShipKind, HTMLImageElement>();

  private stars = new Float32Array(0); // x, y, size, depth, phase, speed, brightness per star
  private starCount = 0;
  private dust: Particle[] = [];
  private ships: Ship[] = [];
  private particles: Particle[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private streaks: Streak[] = [];

  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private nextFlyby = 2;
  private nextStreak = 3;
  private nextChase = 14;
  private nextSkirmish = 6;
  private warp: { start: number; done: () => void; fired: boolean } | null = null;
  private downed = 0;
  private raidersDowned = 0;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private art: HTMLElement | null,
    private hooks: SceneHooks,
    private reduced: boolean,
  ) {
    this.ctx = canvas.getContext("2d")!;
    for (const [kind, sprite] of Object.entries(SHIPS) as [ShipKind, (typeof SHIPS)[ShipKind]][]) {
      const img = new Image();
      img.src = sprite.src;
      this.images.set(kind, img);
    }
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    const onMove = (e: PointerEvent) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onVisibility = () => (document.hidden ? this.pause() : this.start());
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanup.push(() => window.removeEventListener("pointermove", onMove));
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVisibility));
    this.resize();
  }

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    if (this.reduced) this.draw();
    else this.raf = requestAnimationFrame(frame);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.pause();
    for (const fn of this.cleanup) fn();
  }

  /** The jump to hyperspace that leads into the new-game screen. */
  jump(done: () => void): void {
    if (this.reduced || !this.running) return done();
    if (this.warp) return;
    this.warp = { start: this.t, done, fired: false };
    this.hooks.onSound("warp");
  }

  /** Easter egg: the Grand Armada sweeps across the screen. */
  armada(): void {
    if (this.reduced) return;
    const depth = 0.8;
    const lead = this.spawn("cruiser", -1, depth, this.w + 160, this.h * 0.42);
    lead.vx *= 0.8;
    for (let i = 1; i <= 5; i++) {
      for (const side of [-1, 1]) {
        const kind: ShipKind = i % 2 === 0 ? "cruiser" : "fighter";
        const s = this.spawn(kind, -1, depth - i * 0.06, this.w + 160 + i * 120, this.h * 0.42 + side * i * this.h * 0.06);
        s.vx = lead.vx;
      }
    }
    this.hooks.onToast("The Grand Armada salutes you, StarLord!");
    this.hooks.onSound("warp");
  }

  /** Clicks on the canvas: shoot ships, or warp a new one in where there are none. */
  click(clientX: number, clientY: number): void {
    if (this.reduced || this.warp) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const hit = [...this.ships].sort((a, b) => b.depth - a.depth).find((s) => !s.dead && this.hitTest(s, x, y));
    if (hit) {
      this.explode(hit, true);
      return;
    }
    if (this.ships.length >= MAX_SHIPS) return;
    const kind = pick<ShipKind>(["fighter", "fighter", "cruiser", "organic", "freighter"]);
    const s = this.spawn(kind, x < this.w / 2 ? 1 : -1, rand(0.45, 0.85), x, y);
    s.warpIn = 1;
    this.rings.push({ x, y, r: 4, vr: 380, life: 0.6, max: 0.6, color: "170,210,255" });
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 260);
      this.particle(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), rand(1, 2.5), "200,230,255", 2.5);
    }
    this.hooks.onSound("zap");
  }

  // ---------------------------------------------------------------- setup

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.seedStars();
    if (this.reduced) this.draw();
  }

  private seedStars(): void {
    this.starCount = Math.min(520, Math.round((this.w * this.h) / 2600));
    this.stars = new Float32Array(this.starCount * 7);
    for (let i = 0; i < this.starCount; i++) {
      const o = i * 7;
      const depth = pick([0.25, 0.25, 0.5, 1]);
      this.stars[o] = Math.random() * this.w;
      this.stars[o + 1] = Math.random() * this.h;
      this.stars[o + 2] = depth === 1 ? rand(1, 1.9) : rand(0.5, 1.2);
      this.stars[o + 3] = depth;
      this.stars[o + 4] = rand(0, TAU);
      this.stars[o + 5] = rand(0.6, 3);
      this.stars[o + 6] = Math.random() < 0.03 ? 1 : rand(0.35, 0.85);
    }
    this.dust = Array.from({ length: Math.round(this.w / 45) }, () => ({
      x: Math.random() * this.w, y: Math.random() * this.h, vx: rand(-6, -2), vy: rand(-2, 2),
      life: rand(0, TAU), max: 1, size: rand(0.8, 2.6), color: Math.random() < 0.5 ? "190,170,255" : "150,230,255", drag: rand(0.1, 0.3),
    }));
  }

  private spawn(kind: ShipKind, dir: number, depth: number, x?: number, y?: number): Ship {
    const sprite = SHIPS[kind];
    const unit = Math.min(1.4, Math.max(0.55, this.w / 1500));
    const scale = lerp(0.13, 0.5, depth) * sprite.size * unit;
    const speed = lerp(28, 210, depth) * unit * rand(0.85, 1.15) * (kind === "fighter" ? 1.5 : kind === "freighter" ? 0.7 : 1);
    const ship: Ship = {
      kind, dir, depth, scale,
      x: x ?? (dir < 0 ? this.w + 340 * scale * 2 : -340 * scale * 2),
      y: y ?? rand(0.14, 0.86) * this.h,
      vx: speed * dir, age: 0, bob: rand(0, TAU), hp: kind === "raider" ? 4 : 1, cooldown: rand(0.4, 1.2), warpIn: 0, dead: false,
    };
    this.ships.push(ship);
    return ship;
  }

  private particle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag = 1): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life, max: life, size, color, drag });
  }

  private size(s: Ship): [number, number] {
    const img = this.images.get(s.kind)!;
    return [(img.naturalWidth || 400) * s.scale, (img.naturalHeight || 150) * s.scale];
  }

  private hitTest(s: Ship, x: number, y: number): boolean {
    const [w, h] = this.size(s);
    return Math.abs(x - s.x) < w * 0.45 + 6 && Math.abs(y - s.y) < h * 0.42 + 6;
  }

  private engineAt(s: Ship, [u, v]: [number, number]): [number, number] {
    const [w, h] = this.size(s);
    const fx = s.dir < 0 ? u : 1 - u;
    return [s.x - w / 2 + fx * w, s.y - h / 2 + v * h];
  }

  private explode(s: Ship, byPlayer: boolean): void {
    s.dead = true;
    const [w] = this.size(s);
    const big = Math.max(0.6, w / 120);
    this.rings.push({ x: s.x, y: s.y, r: 6, vr: 260 * big, life: 0.7, max: 0.7, color: "255,210,150" });
    for (let i = 0; i < 46 * Math.min(2, big); i++) {
      const a = rand(0, TAU);
      const v = rand(30, 280) * big;
      this.particle(s.x + rand(-w / 4, w / 4), s.y, Math.cos(a) * v + s.vx * 0.3, Math.sin(a) * v, rand(0.4, 1.3), rand(1, 3.2) * Math.sqrt(big),
        pick(["255,240,190", "255,180,80", "255,110,50", "255,210,120"]), 1.8);
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const v = rand(10, 70) * big;
      this.particle(s.x, s.y, Math.cos(a) * v + s.vx * 0.2, Math.sin(a) * v, rand(1.2, 2.4), rand(5, 12) * Math.sqrt(big), "120,100,150", 0.8);
    }
    this.hooks.onSound("boom");
    if (!byPlayer) return;
    this.downed++;
    let text = pick(SHIPS[s.kind].downed);
    if (s.kind === "raider") {
      this.raidersDowned++;
      if (this.raidersDowned === 10) text = "Ten raiders down! The Admiralty awards you the Starburst Medal.";
      else if (this.raidersDowned > 1) text += ` Raiders downed: ${this.raidersDowned}.`;
    } else if (this.downed === 25) {
      text = "Twenty-five ships destroyed. The galaxy is starting to worry about you.";
    }
    this.hooks.onToast(text);
  }

  // ---------------------------------------------------------------- simulation

  private step(dt: number): void {
    this.t += dt;
    const p = this.pointer;
    p.sx += (p.x - p.sx) * Math.min(1, dt * 2.5);
    p.sy += (p.y - p.sy) * Math.min(1, dt * 2.5);

    if (!this.warp) this.schedule(dt);

    for (const s of this.ships) {
      s.age += dt;
      if (s.warpIn > 0) s.warpIn = Math.max(0, s.warpIn - dt * 2.2);
      const warpBoost = s.warpIn > 0 ? 0.15 : 1;
      s.x += s.vx * dt * warpBoost;
      s.y += Math.sin(s.age * 0.9 + s.bob) * 6 * s.depth * dt;
      // Engine exhaust.
      if (Math.random() < 0.5 + s.depth * 0.5) {
        const sprite = SHIPS[s.kind];
        const eng = pick(sprite.engines);
        const [ex, ey] = this.engineAt(s, eng);
        this.particle(ex, ey + rand(-1, 1) * s.scale * 6, -s.vx * rand(0.1, 0.3) + rand(-8, 8), rand(-6, 6), rand(0.25, 0.7) * (0.5 + s.depth),
          rand(0.8, 2) * (0.4 + s.depth), sprite.engineColor, 1.5);
      }
      if (s.target) {
        s.cooldown -= dt;
        if (s.target.dead) s.target = undefined;
        else if (s.cooldown <= 0 && Math.abs(s.x - s.target.x) < this.w * 0.6) {
          s.cooldown = rand(0.35, 0.9);
          const [nx, ny] = this.engineAt(s, [0.05, 0.55]);
          const dx = s.target.x - nx;
          const dy = s.target.y - ny + rand(-10, 10);
          const d = Math.hypot(dx, dy) || 1;
          const v = 700 * (0.4 + s.depth);
          this.bolts.push({ x: nx, y: ny, vx: (dx / d) * v + s.target.vx, vy: (dy / d) * v, life: 1.2, target: s.target });
        }
      }
      const [w] = this.size(s);
      if ((s.dir < 0 && s.x < -w) || (s.dir > 0 && s.x > this.w + w)) s.dead = true;
    }

    for (const b of this.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const t = b.target;
      if (t && !t.dead && this.hitTest(t, b.x, b.y)) {
        b.life = 0;
        t.hp--;
        for (let i = 0; i < 10; i++) this.particle(b.x, b.y, rand(-90, 90) + t.vx, rand(-90, 90), rand(0.2, 0.5), rand(1, 2), "255,200,120", 2);
        if (t.hp <= 0) this.explode(t, false);
      }
    }

    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const k = Math.max(0, 1 - q.drag * dt);
      q.vx *= k;
      q.vy *= k;
      q.life -= dt;
    }
    for (const r of this.rings) {
      r.r += r.vr * dt;
      r.vr *= Math.max(0, 1 - 2.5 * dt);
      r.life -= dt;
    }
    for (const s of this.streaks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt * d.drag;
      if (d.x < -20) d.x += this.w + 40;
      if (d.y < -20) d.y += this.h + 40;
      if (d.y > this.h + 20) d.y -= this.h + 40;
    }

    this.ships = this.ships.filter((s) => !s.dead);
    this.particles = this.particles.filter((q) => q.life > 0);
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.rings = this.rings.filter((r) => r.life > 0);
    this.streaks = this.streaks.filter((s) => s.life > 0);

    if (this.warp && !this.warp.fired && this.t - this.warp.start > 1.35) {
      this.warp.fired = true;
      this.warp.done();
    }
    this.moveArt();
  }

  private schedule(dt: number): void {
    this.nextFlyby -= dt;
    this.nextStreak -= dt;
    this.nextChase -= dt;
    this.nextSkirmish -= dt;
    if (this.nextFlyby <= 0) {
      this.nextFlyby = rand(3, 8);
      if (this.ships.length < MAX_SHIPS - 3) {
        const kind = pick<ShipKind>(["fighter", "fighter", "cruiser", "freighter", "freighter", "organic", "raider"]);
        this.spawn(kind, Math.random() < 0.7 ? -1 : 1, Math.pow(Math.random(), 1.6) * 0.95);
      }
    }
    if (this.nextChase <= 0) {
      this.nextChase = rand(16, 30);
      if (this.ships.length < MAX_SHIPS - 3) {
        const dir = Math.random() < 0.6 ? -1 : 1;
        const depth = rand(0.35, 0.75);
        const prey = this.spawn("raider", dir, depth);
        prey.vx *= 1.1;
        for (let i = 1; i <= 2; i++) {
          const hunter = this.spawn("fighter", dir, depth - 0.02 * i, prey.x - dir * (140 + 90 * i) * (0.5 + depth), prey.y + (i === 1 ? -1 : 1) * 30 * (0.5 + depth));
          hunter.vx = prey.vx * 1.02;
          hunter.target = prey;
        }
      }
    }
    if (this.nextStreak <= 0) {
      this.nextStreak = rand(2.5, 7);
      const life = rand(0.7, 1.3);
      const v = rand(500, 900);
      const a = Math.PI * rand(0.62, 0.8);
      this.streaks.push({ x: rand(0.3, 1.1) * this.w, y: rand(-0.05, 0.4) * this.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, len: rand(90, 220) });
    }
    if (this.nextSkirmish <= 0) {
      // A far-off battle in the dark heart of the nebula: tiny bolts and pops.
      this.nextSkirmish = rand(5, 11);
      const [cx, cy] = this.artPoint(rand(0.42, 0.66), rand(0.12, 0.32));
      const ax = cx - rand(30, 70), bx = cx + rand(30, 70), ay = cy + rand(-20, 20), by = cy + rand(-20, 20);
      for (let i = 0; i < 5; i++) {
        const fromA = Math.random() < 0.5;
        const [x0, y0, x1, y1] = fromA ? [ax, ay, bx, by] : [bx, by, ax, ay];
        const d = Math.hypot(x1 - x0, y1 - y0);
        this.bolts.push({ x: x0 - ((x1 - x0) / d) * i * 25, y: y0 - ((y1 - y0) / d) * i * 25, vx: ((x1 - x0) / d) * 160, vy: ((y1 - y0) / d) * 160, life: d / 160 });
      }
      this.rings.push({ x: bx, y: by, r: 1, vr: 40, life: 0.5, max: 0.5, color: "255,190,120" });
    }
  }

  /** Map a point on the key art (fractions of the image) to canvas pixels, following the art's drift. */
  private artTransform(): { k: number; tx: number; ty: number } {
    if (this.reduced) return { k: 1, tx: 0, ty: 0 };
    const t = this.t;
    let k = 1.035 + 0.03 * Math.sin((t / 55) * TAU);
    let tx = -this.pointer.sx * 14 + 10 * Math.sin((t / 41) * TAU);
    let ty = -this.pointer.sy * 9 + 6 * Math.sin((t / 33) * TAU);
    if (this.warp) {
      const e = Math.min(1, (this.t - this.warp.start) / 1.35);
      k += e * e * 0.35;
      tx *= 1 - e;
      ty *= 1 - e;
    }
    return { k, tx, ty };
  }

  private artPoint(u: number, v: number): [number, number] {
    const bw = this.w * 1.06, bh = this.h * 1.06;
    const s = Math.max(bw / TITLE_ART.width, bh / TITLE_ART.height);
    const iw = TITLE_ART.width * s, ih = TITLE_ART.height * s;
    const x0 = (this.w - iw) / 2 + u * iw;
    const y0 = (this.h - ih) / 2 + v * ih;
    const { k, tx, ty } = this.artTransform();
    return [this.w / 2 + k * (x0 - this.w / 2) + tx, this.h / 2 + k * (y0 - this.h / 2) + ty];
  }

  private moveArt(): void {
    if (!this.art) return;
    const { k, tx, ty } = this.artTransform();
    this.art.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(4)})`;
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";
    const warpE = this.warp ? Math.min(1, (this.t - this.warp.start) / 1.35) : 0;

    this.drawStars(warpE);
    if (!this.reduced) {
      this.drawArtGlows();
      this.drawStreaks();
    }

    ctx.globalCompositeOperation = "source-over";
    for (const s of [...this.ships].sort((a, b) => a.depth - b.depth)) this.drawShip(s);

    ctx.globalCompositeOperation = "lighter";
    this.drawEffects();
    this.drawDust();

    if (warpE > 0) {
      ctx.globalCompositeOperation = "source-over";
      const fade = Math.max(0, (warpE - 0.55) / 0.45);
      ctx.fillStyle = `rgba(7,9,18,${(fade * fade).toFixed(3)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawStars(warpE: number): void {
    const ctx = this.ctx;
    const { stars, t } = this;
    const px = this.pointer.sx * 18, py = this.pointer.sy * 12;
    const cx = this.w / 2, cy = this.h / 2;
    for (let i = 0; i < this.starCount; i++) {
      const o = i * 7;
      const depth = stars[o + 3]!;
      let x = stars[o]! - px * depth;
      let y = stars[o + 1]! - py * depth;
      const bright = stars[o + 6]!;
      const tw = this.reduced ? 1 : 0.55 + 0.45 * Math.sin(t * stars[o + 5]! + stars[o + 4]!);
      const a = bright * tw;
      const size = stars[o + 2]!;
      if (warpE > 0) {
        // Stars stretch into streaks as the jump to hyperspace builds.
        const e = warpE * warpE * warpE;
        const dx = x - cx, dy = y - cy;
        const push = 1 + e * 2.5 * depth;
        x = cx + dx * push;
        y = cy + dy * push;
        const len = e * 0.9 * depth;
        ctx.strokeStyle = `rgba(200,225,255,${Math.min(1, a + warpE).toFixed(3)})`;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * len, y - dy * len);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = `rgba(225,235,255,${a.toFixed(3)})`;
      if (bright === 1 && !this.reduced) {
        // The odd bright star gets a four-pointed glint.
        const r = size * 4 * tw;
        ctx.fillRect(x - r, y - 0.5, r * 2, 1);
        ctx.fillRect(x - 0.5, y - r, 1, r * 2);
      }
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  private glow(x: number, y: number, r: number, color: string, alpha: number): void {
    if (r <= 0.5 || alpha <= 0) return;
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(${color},${(alpha * 0.35).toFixed(3)})`);
    g.addColorStop(1, `rgba(${color},0)`);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private drawArtGlows(): void {
    const ctx = this.ctx;
    const t = this.t;
    const unit = Math.max(this.w, this.h * 1.79) / 1920;

    // The sun breathes and its rays slowly turn.
    const [sx, sy] = this.artPoint(...ART_SPOTS.sun);
    const pulse = 1 + 0.08 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 3.1);
    this.glow(sx, sy, 230 * unit * pulse, "255,200,120", 0.32);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.04);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      const len = (i % 2 ? 260 : 420) * unit * pulse;
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, "rgba(255,225,170,0.22)");
      g.addColorStop(1, "rgba(255,225,170,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -4 * unit);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, 4 * unit);
      ctx.fill();
    }
    ctx.restore();

    // Painted engines flicker.
    ART_SPOTS.engines.forEach(([u, v, size], i) => {
      const [x, y] = this.artPoint(u, v);
      const f = 0.75 + 0.25 * Math.sin(t * 17 + i * 2.1) * Math.sin(t * 7.3 + i);
      this.glow(x, y, 26 * unit * size * f, "255,170,90", 0.55 * f);
    });

    // Station beacons blink in turn.
    ART_SPOTS.beacons.forEach(([u, v, color], i) => {
      const phase = (t * 0.7 + i / 3) % 1;
      if (phase > 0.18) return;
      const [x, y] = this.artPoint(u, v);
      const a = Math.sin((phase / 0.18) * Math.PI);
      this.glow(x, y, 14 * unit, color, a);
    });
  }

  private drawStreaks(): void {
    const ctx = this.ctx;
    for (const s of this.streaks) {
      const k = s.life / s.max;
      const a = Math.sin(k * Math.PI);
      const v = Math.hypot(s.vx, s.vy);
      const tx = s.x - (s.vx / v) * s.len, ty = s.y - (s.vy / v) * s.len;
      const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(160,200,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      this.glow(s.x, s.y, 6, "220,235,255", a * 0.8);
    }
  }

  private drawShip(s: Ship): void {
    const ctx = this.ctx;
    const img = this.images.get(s.kind)!;
    if (!img.complete || !img.naturalWidth) return;
    const [w, h] = this.size(s);
    const sprite = SHIPS[s.kind];
    ctx.save();
    ctx.globalAlpha = lerp(0.55, 1, s.depth) * (1 - s.warpIn * 0.6);
    ctx.translate(s.x, s.y);
    if (s.warpIn > 0) ctx.scale(1 + s.warpIn * 3, 1 - s.warpIn * 0.85);
    if (s.dir > 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const f = 0.8 + 0.2 * Math.sin(this.t * 23 + s.bob);
    for (const e of sprite.engines) {
      const [x, y] = this.engineAt(s, e);
      this.glow(x, y, h * 0.22 * f + 3, sprite.engineColor, 0.75 * lerp(0.6, 1, s.depth));
    }
    if (s.warpIn > 0) this.glow(s.x, s.y, w * (0.4 + s.warpIn), "200,230,255", s.warpIn);
    ctx.restore();
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const q of this.particles) {
      const k = q.life / q.max;
      ctx.fillStyle = `rgba(${q.color},${(k * 0.9).toFixed(3)})`;
      const r = q.size * (0.6 + 0.4 * k);
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    ctx.lineCap = "round";
    for (const b of this.bolts) {
      const v = Math.hypot(b.vx, b.vy) || 1;
      const len = b.target ? 22 : 5;
      ctx.strokeStyle = b.target ? "rgba(120,255,200,0.95)" : "rgba(255,140,120,0.8)";
      ctx.lineWidth = b.target ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / v) * len, b.y - (b.vy / v) * len);
      ctx.stroke();
    }
    for (const r of this.rings) {
      const k = r.life / r.max;
      this.glow(r.x, r.y, r.r * 0.8, r.color, k * 0.6);
      ctx.strokeStyle = `rgba(${r.color},${(k * 0.8).toFixed(3)})`;
      ctx.lineWidth = 2 * k + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
  }

  private drawDust(): void {
    if (this.reduced) return;
    const ctx = this.ctx;
    const px = this.pointer.sx * 40, py = this.pointer.sy * 26;
    for (const d of this.dust) {
      const a = 0.12 + 0.12 * Math.sin(d.life * 3);
      ctx.fillStyle = `rgba(${d.color},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x - px, d.y - py, d.size, 0, TAU);
      ctx.fill();
    }
  }
}
