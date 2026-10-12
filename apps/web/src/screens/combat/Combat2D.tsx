import { useEffect, useMemo, useRef, useState } from "react";
import { FIELD_HEIGHT, FIELD_WIDTH, WEAPONS_BY_ID, type CombatReport, type PlayerView } from "@starlord/sim";
import { STEP_MS, isProjectile, leftOwner, type CombatEvent, type Frames, type UnitInfo } from "./replayModel";
import { MONSTER_COLORS, monsterSpecies } from "../../game/monsters";

/**
 * The flat canvas battle view: the fallback when WebGL is unavailable. It can
 * be deleted together with its switch in CombatReplay once 3D is the only view.
 */

const backdrop = typeof Image === "undefined" ? null : Object.assign(new Image(), { src: "art/combat.webp" });

const CELL = 26;

/** The part of the battlefield the fight uses: every unit's start and move, with a margin, at least 32 x 18 squares. */
export function fieldWindow(report: CombatReport): { x0: number; y0: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of report.ships) { xs.push(s.x); ys.push(s.y); }
  for (const round of report.rounds) for (const e of round) if (e.kind === "move" && e.x !== undefined && e.y !== undefined) { xs.push(e.x); ys.push(e.y); }
  const fit = (lo: number, hi: number, min: number, max: number) => {
    let a = Math.floor(lo) - 3;
    let b = Math.ceil(hi) + 4;
    if (b - a < min) { const grow = min - (b - a); a -= Math.floor(grow / 2); b += Math.ceil(grow / 2); }
    if (a < 0) { b -= a; a = 0; }
    if (b > max) { a = Math.max(0, a - (b - max)); b = max; }
    return [a, b - a] as const;
  };
  const [x0, w] = xs.length ? fit(Math.min(...xs), Math.max(...xs), 32, FIELD_WIDTH) : [0, FIELD_WIDTH];
  const [y0, h] = ys.length ? fit(Math.min(...ys), Math.max(...ys), 18, FIELD_HEIGHT) : [0, FIELD_HEIGHT];
  return { x0, y0, w, h };
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Floater { x: number; y: number; text: string; life: number; color: string }
interface Shock { x: number; y: number; life: number; max: number; r: number }

export interface CombatViewProps {
  report: CombatReport;
  view: PlayerView;
  units: UnitInfo[];
  frames: Frames;
  event: CombatEvent | undefined;
  step: number;
  reduced: boolean;
  /** Changes on restart, so effects in flight are dropped. */
  resetKey: number;
}

export function Combat2D({ report, view, units, frames, event, step, reduced, resetKey }: CombatViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const win = useMemo(() => fieldWindow(report), [report]);
  const W = win.w * CELL;
  const H = win.h * CELL;
  // Everything the animation loop reads lives in a ref so the loop itself never restarts.
  const live = useRef({ frames, event, stepAt: 0, reduced, view, report, units });
  const fx = useRef({ particles: [] as Particle[], floaters: [] as Floater[], shocks: [] as Shock[], shake: 0 });
  const [, setBackdropReady] = useState(backdrop?.complete ?? true);

  useEffect(() => {
    if (backdrop && !backdrop.complete) backdrop.onload = () => setBackdropReady(true);
  }, []);

  useEffect(() => {
    fx.current = { particles: [], floaters: [], shocks: [], shake: 0 };
  }, [resetKey]);

  // Each new step spawns its effects: sparks and a number on a hit, a fireball when a ship dies.
  useEffect(() => {
    live.current = { frames, event, stepAt: performance.now(), reduced, view, report, units };
    if (!event || reduced) return;
    const f = fx.current;
    const pos = (key?: string) => {
      const s = key ? frames.now.get(key) : undefined;
      return s ? { x: (s.x + 0.5) * CELL, y: (s.y + 0.5) * CELL } : null;
    };
    if (event.kind === "fire" && event.hit && event.target) {
      const p = pos(event.target);
      if (p) {
        // Missiles land a little later than beams, so delay their sparks by giving them a negative head start.
        const delay = isProjectile(event.weapon) ? -6 : 0;
        burst(f.particles, p.x, p.y, 10, ["#ffe7a3", "#ffb347", "#ffffff"], 1.6, delay);
        f.floaters.push({ x: p.x, y: p.y - 10, text: `-${event.damage ?? 0}`, life: 50 - delay, color: "#ffd0a0" });
      }
    }
    if (event.kind === "destroyed") {
      const p = pos(event.ship);
      if (p) {
        burst(f.particles, p.x, p.y, 46, ["#fff4c2", "#ffb347", "#ff6a3d", "#ff3d3d", "#9aa3b5"], 3.2, 0);
        f.shocks.push({ x: p.x, y: p.y, life: 0, max: 34, r: CELL * 2.4 });
        f.shake = 10;
      }
    }
  }, [step, frames, event, reduced, view, report, units]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ox = -win.x0 * CELL;
    const oy = -win.y0 * CELL;
    el.width = W * dpr;
    el.height = H * dpr;
    // A fixed sky of faint stars, laid out once.
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 160 }, () => ({ x: rand() * W, y: rand() * H, r: rand() * 1.2 + 0.2, a: rand() * 0.6 + 0.1, p: rand() * 6 }));
    let raf = 0;
    let lastT = performance.now();

    const draw = (t: number) => {
      const dt = Math.min(50, t - lastT) / 16.7;
      lastT = t;
      const { frames, event, stepAt, reduced, view, report, units } = live.current;
      const f = fx.current;
      const k = reduced ? 1 : Math.min(1, (t - stepAt) / STEP_MS);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (f.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * f.shake, (Math.random() - 0.5) * f.shake);
        f.shake *= Math.pow(0.86, dt);
      }

      ctx.fillStyle = "#04050b";
      ctx.fillRect(-20, -20, W + 40, H + 40);
      if (backdrop?.complete && backdrop.naturalWidth) {
        const s = Math.max(W / backdrop.naturalWidth, H / backdrop.naturalHeight) * 1.08;
        const drift = reduced ? 0 : Math.sin(t / 9000) * 10;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(backdrop, (W - backdrop.naturalWidth * s) / 2 + drift, (H - backdrop.naturalHeight * s) / 2, backdrop.naturalWidth * s, backdrop.naturalHeight * s);
        ctx.globalAlpha = 1;
      }
      for (const s of stars) {
        ctx.globalAlpha = s.a * (reduced ? 1 : 0.6 + 0.4 * Math.sin(t / 700 + s.p));
        ctx.fillStyle = "#fff";
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // Everything below is drawn in battlefield coordinates, shifted to the window the fight uses.
      ctx.translate(ox, oy);
      ctx.strokeStyle = "rgba(90,130,220,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= FIELD_WIDTH; x++) { ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, FIELD_HEIGHT * CELL); }
      for (let y = 0; y <= FIELD_HEIGHT; y++) { ctx.moveTo(0, y * CELL); ctx.lineTo(FIELD_WIDTH * CELL, y * CELL); }
      ctx.stroke();

      const at = (key: string) => {
        const a = frames.prev.get(key)!;
        const b = frames.now.get(key)!;
        const e = ease(k);
        const moving = event?.kind === "move" && event.ship === key;
        const x = moving ? a.x + (b.x - a.x) * e : b.x;
        const y = moving ? a.y + (b.y - a.y) * e : b.y;
        return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
      };

      // Ships, stations and planets.
      for (const u of units) {
        const s = u.snap;
        const st = frames.now.get(s.key)!;
        if (st.gone && !(event?.kind === "retreat" && event.ship === s.key)) continue;
        const color = view.players[s.ownerId]?.color ?? "#999";
        const p = at(s.key);
        const fading = event?.kind === "retreat" && event.ship === s.key ? 1 - k : 1;
        if (!st.alive) {
          if (event?.kind === "destroyed" && event.ship === s.key && k < 1) {
            ctx.globalAlpha = 1 - k;
          } else {
            // A drifting, dark wreck.
            ctx.globalAlpha = 0.22;
          }
        } else ctx.globalAlpha = fading;
        if (u.kind === "planet") drawPlanet(ctx, p.x, p.y, color);
        else if (u.kind === "station") drawStation(ctx, p.x, p.y, CELL * (0.45 + u.size * 0.3), color);
        else if (u.kind === "monster") drawMonster(ctx, p.x, p.y, CELL * 0.55, t, reduced, MONSTER_COLORS[monsterSpecies(s.designId) ?? "generic"]);
        else {
          const dir = s.ownerId === leftOwner(report) ? 1 : -1;
          const size = 0.32 + Math.min(0.32, Math.log10(Math.max(1, s.maxHits)) * 0.12);
          const flicker = reduced ? 1 : 0.75 + 0.25 * Math.sin(t / 60 + s.x * 3 + s.y);
          drawShip(ctx, p.x, p.y, dir, size * CELL, color, st.alive ? flicker : 0, event?.kind === "fire" && event.ship === s.key && k < 0.6);
        }
        ctx.globalAlpha = 1;
        if (st.alive && !st.gone) {
          const w = CELL * 0.9;
          const frac = Math.max(0, st.hits / s.maxHits);
          ctx.fillStyle = "rgba(40,0,0,0.8)";
          ctx.fillRect(p.x - w / 2, p.y + CELL * 0.5, w, 3);
          ctx.fillStyle = frac > 0.6 ? "#4fd18b" : frac > 0.3 ? "#ffc857" : "#ff6b6b";
          ctx.fillRect(p.x - w / 2, p.y + CELL * 0.5, w * frac, 3);
        }
      }

      // The shot of the current step.
      if (event?.kind === "fire" && event.target && frames.now.has(event.ship) && frames.now.has(event.target)) {
        const a = at(event.ship);
        const b = at(event.target);
        const kind = event.weapon ? WEAPONS_BY_ID[event.weapon]?.kind : undefined;
        if (isProjectile(event.weapon)) {
          const e = ease(k);
          const x = a.x + (b.x - a.x) * e;
          const y = a.y + (b.y - a.y) * e;
          const glow = kind === "torpedo" ? "#7ad7ff" : "#ffd32a";
          const tail = ctx.createLinearGradient(x, y, x - (b.x - a.x) * 0.25, y - (b.y - a.y) * 0.25);
          tail.addColorStop(0, glow);
          tail.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = tail;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (b.x - a.x) * 0.25, y - (b.y - a.y) * 0.25);
          ctx.stroke();
          dot(ctx, x, y, kind === "torpedo" ? 5 : 3, glow);
        } else {
          // Beams flash at once and fade, with a bright core inside a coloured glow.
          const fade = 1 - k * 0.8;
          const miss = !event.hit;
          const end = miss ? { x: b.x + (b.y - a.y) * 0.08, y: b.y - (b.x - a.x) * 0.08 } : b;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = fade * (miss ? 0.45 : 1);
          ctx.strokeStyle = kind === "spores" ? "#7dff7a" : "#ff4a5a";
          ctx.lineWidth = 6;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }

      // Shockwaves, sparks and damage numbers.
      ctx.globalCompositeOperation = "lighter";
      for (let i = f.shocks.length - 1; i >= 0; i--) {
        const s = f.shocks[i]!;
        s.life += dt;
        const q = s.life / s.max;
        if (q >= 1) { f.shocks.splice(i, 1); continue; }
        ctx.globalAlpha = (1 - q) * 0.8;
        ctx.strokeStyle = "#ffcf8a";
        ctx.lineWidth = 3 * (1 - q) + 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * ease(q), 0, Math.PI * 2);
        ctx.stroke();
        const flash = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 0.8);
        flash.addColorStop(0, `rgba(255,240,200,${0.9 * (1 - q) * (1 - q)})`);
        flash.addColorStop(1, "rgba(255,120,40,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = flash;
        ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      }
      for (let i = f.particles.length - 1; i >= 0; i--) {
        const p = f.particles[i]!;
        p.life += dt;
        if (p.life < 0) continue;
        if (p.life >= p.max) { f.particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.95, dt);
        p.vy *= Math.pow(0.95, dt);
        ctx.globalAlpha = 1 - p.life / p.max;
        dot(ctx, p.x, p.y, p.size * (1 - p.life / p.max * 0.5), p.color);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (let i = f.floaters.length - 1; i >= 0; i--) {
        const fl = f.floaters[i]!;
        fl.life -= dt;
        if (fl.life <= 0) { f.floaters.splice(i, 1); continue; }
        if (fl.life > 50) continue;
        fl.y -= 0.5 * dt;
        ctx.globalAlpha = Math.min(1, fl.life / 20);
        ctx.fillStyle = "#000";
        ctx.fillText(fl.text, fl.x + 1, fl.y + 1);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Soft vignette.
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = v;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [W, H, win.x0, win.y0]);

  return <canvas ref={canvas} style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block" }} />;
}

const ease = (k: number) => 1 - Math.pow(1 - k, 3);

function burst(list: Particle[], x: number, y: number, n: number, colors: string[], speed: number, delay: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random());
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: delay, max: 24 + Math.random() * 30, size: 1 + Math.random() * 2.2, color: colors[i % colors.length]! });
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.3, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
}

function drawPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const r = CELL * 0.9;
  const atmo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.5);
  atmo.addColorStop(0, `${color}88`);
  atmo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = atmo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.25, color);
  body.addColorStop(1, "#05060c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** An orbital station: a hub inside a ring in the owner's colour. */
function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#c8d0dc";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
}

/** A space creature: a pulsing core in a writhing ring of tendrils, in its kind's colours. */
function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, still: boolean, c: { body: number; glow: number; light: number }): void {
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const rgba = (n: number, a: number) => `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  const beat = still ? 1 : 1 + 0.08 * Math.sin(t / 220);
  const aura = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2 * beat);
  aura.addColorStop(0, rgba(c.glow, 0.55));
  aura.addColorStop(1, rgba(c.body, 0));
  ctx.fillStyle = aura;
  ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
  ctx.strokeStyle = hex(c.glow);
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (still ? 0 : t / 1800);
    const wob = still ? 0 : Math.sin(t / 300 + i) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    ctx.quadraticCurveTo(x + Math.cos(a + wob) * r * 1.2, y + Math.sin(a + wob) * r * 1.2, x + Math.cos(a + wob * 2) * r * 1.6, y + Math.sin(a + wob * 2) * r * 1.6);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 0.8 * beat);
  core.addColorStop(0, hex(c.light));
  core.addColorStop(0.35, hex(c.glow));
  core.addColorStop(1, hex(c.body));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8 * beat, 0, Math.PI * 2);
  ctx.fill();
}

/** A sleek hull pointing toward the enemy, with a flickering engine and a muzzle flash while firing. */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, s: number, color: string, engine: number, firing: boolean): void {
  if (engine > 0) {
    const ex = x - dir * s * 0.9;
    const g = ctx.createRadialGradient(ex, y, 0, ex, y, s * 0.9 * engine);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.3, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(ex - s, y - s, s * 2, s * 2);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * 1.25, 0);
  ctx.lineTo(-s * 0.7, -s * 0.85);
  ctx.lineTo(-s * 0.35, 0);
  ctx.lineTo(-s * 0.7, s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(s * 1.25, 0);
  ctx.lineTo(-s * 0.7, -s * 0.85);
  ctx.lineTo(-s * 0.35, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (firing) dot(ctx, s * 1.3, 0, s * 0.35, "#fff2b0");
  ctx.restore();
}
