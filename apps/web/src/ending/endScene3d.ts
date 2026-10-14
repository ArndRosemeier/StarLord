import * as THREE from "three";
import { Stage } from "../three/stage";
import { createNebulaSky, createStarfield } from "../three/backdrop";
import { EffectsLayer } from "../three/effects";
import { accentColor, fresnelMaterial, glowSpriteMaterial } from "../three/materials";
import { ModelKit, disposeModel, type UnitModel } from "../three/models/kit";
import { buildShip, type ShipClass } from "../three/models/ships";
import { buildStation } from "../three/models/stations";
import { buildPlanet } from "../three/models/planet";
import { buildStar } from "../three/models/star";
import type { EmpireLook, EndingKind, EndingSpec } from "./endings";

/**
 * The end-of-game cinematics in 3D, one per way a game can end, built from the
 * game's own ship, station and planet models in the empires' own colours and
 * design languages:
 *
 * - conquest: the victor's grand fleet sweeps the last enemy wrecks from the
 *   sky of its homeworld, squadrons warp in to ring the planet, fireworks;
 * - council: envoys of every surviving empire warp in around the elected
 *   ruler's homeworld and salute it, and a golden crown of light forms above;
 * - raiders: the victor's fleet breaks the Vexari citadel at Vex Prime beside
 *   its black hole, and the dimensional portal collapses;
 * - score: the age ends at dawn over the leader's homeworld while its fleet
 *   passes in review;
 * - defeat: the conqueror's warships hang over the player's burning
 *   homeworld and the last defenders fall.
 *
 * The scripted part runs for `ENDING_SECONDS`; after that the camera keeps a
 * slow orbit and the scene stays alive (fireworks, bombardment) behind the
 * final score card.
 */

export interface EndSceneHooks {
  onSound: (effect: "boom" | "zap" | "warp" | "sparkle" | "fanfare") => void;
  /** The script has played to its end (in scene time, so a slow machine still sees all of it). */
  onFinished: () => void;
}

/** How long the scripted part runs before the score card shows, in seconds. */
export const ENDING_SECONDS = 12;

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FIRE = ["#ffffff", "#fff1a8", "#ffb347", "#ff6a2a", "#c2341a"];
const GOLD = ["#ffffff", "#fff4c2", "#ffe39a", "#ffc94d"];
const SHIP_SCALE = 3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** A seeded generator, so a replayed ending (debug preview) looks the same each time for one seed. */
function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Ship {
  model: UnitModel;
  scale: number;
  curve: THREE.CatmullRomCurve3;
  /** Scene time it warps in, and how long it takes to fly its curve. */
  start: number;
  dur: number;
  /** "settle": eases into the end of its curve and holds there; "pass": flies on at its last speed. */
  mode: "settle" | "pass";
  /** Where a holding ship turns its nose to. */
  face: THREE.Vector3 | null;
  tangent: THREE.Vector3;
  shown: boolean;
  dead: boolean;
  trailT: number;
  color: string;
}

interface Shot {
  at: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

interface Cue {
  at: number;
  run: () => void;
}

export class EndScene3D {
  private stage: Stage;
  private kit: ModelKit;
  private fx: EffectsLayer;
  private starfield: THREE.Points;
  private ships: Ship[] = [];
  private props: UnitModel[] = [];
  private spinners: { obj: THREE.Object3D; speed: number }[] = [];
  private cues: Cue[] = [];
  private shots: Shot[] = [];
  private camPath: THREE.CatmullRomCurve3 | null = null;
  private lookPath: THREE.CatmullRomCurve3 | null = null;
  private t = 0;
  private rand: () => number;
  private touch: boolean;
  /** Per-frame extras of a scene (a rising sun, a growing crown), and what keeps running after the script. */
  private extras: ((t: number, dt: number) => void)[] = [];
  private ambient: ((dt: number) => void) | null = null;
  private ambientT = 0;
  private cleanup: (() => void)[] = [];
  /** Quiet while fast-forwarding a skipped script. */
  private muted = false;
  /** Runs every frame after the script (used by the review to come round again). */
  private ambientExtra: (() => void) | null = null;

  constructor(container: HTMLElement, private spec: EndingSpec, private hooks: EndSceneHooks, private reduced: boolean, seed = Date.now()) {
    this.rand = rng(seed);
    this.touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.stage = new Stage(container, { fov: 42, near: 0.5, far: 5000, maxPixelRatio: this.touch ? 1.25 : 1.75 });
    this.stage.controls.enabled = false;
    this.kit = this.stage.own(new ModelKit(this.stage.textures));
    this.fx = this.stage.own(new EffectsLayer(this.kit.glow, { particleCapacity: this.touch ? 1600 : 3600 }));
    this.stage.scene.add(this.fx.group);
    this.starfield = createStarfield(this.touch ? 700 : 1400, 1600, 5 + Math.floor(this.rand() * 50));
    this.stage.scene.add(this.starfield);
    this.stage.useStudioEnvironment(0.4);
    const scaleFx = () => this.fx.setParticleScale(this.stage.viewportHeight, this.stage.camera.fov);
    scaleFx();
    this.cleanup.push(this.stage.onResize(scaleFx));

    const build: Record<EndingKind, () => void> = {
      conquest: () => this.conquest(),
      council: () => this.council(),
      raiders: () => this.raiders(),
      score: () => this.score(),
      defeat: () => this.defeat(),
    };
    build[spec.kind]();
    this.cues.sort((a, b) => a.at - b.at);
    if (this.shots.length > 1) {
      this.camPath = new THREE.CatmullRomCurve3(this.shots.map((s) => s.pos), false, "centripetal");
      this.lookPath = new THREE.CatmullRomCurve3(this.shots.map((s) => s.look), false, "centripetal");
    }

    if (reduced) {
      // One composed still: the end of the script, everyone in place and the fallen gone.
      this.fastForward();
      void this.stage.textures.ready().then(() => this.stage.renderOnce());
      this.cleanup.push(this.stage.onResize(() => this.stage.renderOnce()));
    } else {
      this.placeCamera();
      this.stage.onFrame((dt) => this.frame(dt));
    }
  }

  /** Resolves once planet and hull textures are in, so the view can fade in complete. */
  ready(): Promise<void> {
    return this.stage.textures.ready();
  }

  start(): void {
    if (!this.reduced) this.stage.start();
  }

  /** Jumps to the end of the script (the player skipped it): every cue fires quietly, ships take their places. */
  skip(): void {
    if (this.t >= ENDING_SECONDS) return;
    this.fastForward();
  }

  private fastForward(): void {
    this.muted = true;
    while (this.t < ENDING_SECONDS) this.frame(0.05, true);
    this.fx.clear();
    this.muted = false;
  }

  destroy(): void {
    for (const c of this.cleanup) c();
    for (const s of this.ships) if (!s.dead) disposeModel(s.model);
    for (const p of this.props) disposeModel(p);
    this.ships = [];
    this.props = [];
    this.stage.dispose();
  }

  // ---------------------------------------------------------------- building blocks

  private sound(effect: Parameters<EndSceneHooks["onSound"]>[0]): void {
    if (!this.muted) this.hooks.onSound(effect);
  }

  private r(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]!;
  }

  private count(n: number): number {
    return Math.max(1, Math.round(this.touch ? n * 0.5 : n));
  }

  private addProp<T extends UnitModel>(m: T, at: THREE.Vector3): T {
    m.root.position.copy(at);
    this.stage.scene.add(m.root);
    this.props.push(m);
    return m;
  }

  private sky(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation): void {
    this.stage.scene.add(createNebulaSky(2400, [a, b], 3 + Math.floor(this.rand() * 90)));
  }

  /** A distant sun with its corona, which also lights the scene. */
  private sun(at: THREE.Vector3, color: number, radius: number, power = 2.6): { model: UnitModel; glows: THREE.Sprite[]; light: THREE.DirectionalLight } {
    const model = this.addProp(buildStar(this.kit, color, radius), at);
    const glows: THREE.Sprite[] = [];
    const corona = new THREE.Color(color);
    for (const [size, opacity, mix] of [[radius * 7, 0.85, 0.6], [radius * 20, 0.35, 0.2], [radius * 44, 0.14, 0]] as const) {
      const glow = new THREE.Sprite(glowSpriteMaterial(this.kit.glow, corona.clone().lerp(new THREE.Color(0xffffff), mix), opacity));
      glow.scale.setScalar(size);
      glow.position.copy(at);
      this.stage.scene.add(glow);
      glows.push(glow);
    }
    const light = new THREE.DirectionalLight(corona.clone().lerp(new THREE.Color(0xffffff), 0.6), power);
    light.position.copy(at);
    this.stage.scene.add(light);
    return { model, glows, light };
  }

  private lights(sky: number, ground: number, rim: number, rimAt: THREE.Vector3): void {
    this.stage.scene.add(new THREE.HemisphereLight(sky, ground, 0.5));
    const light = new THREE.DirectionalLight(rim, 0.7);
    light.position.copy(rimAt);
    this.stage.scene.add(light);
  }

  private homeworld(look: EmpireLook, radius: number, at = new THREE.Vector3()): UnitModel {
    const planet = buildPlanet(this.kit, look.planet, radius, null);
    planet.root.rotation.set(0.15, this.r(0, TAU), -0.1);
    return this.addProp(planet, at);
  }

  private ship(cls: ShipClass, look: { color: string; style: string }, path: THREE.Vector3[], start: number, dur: number,
    o: { mode?: Ship["mode"]; face?: THREE.Vector3; scale?: number } = {}): Ship {
    const model = buildShip(this.kit, cls, look.color, look.style);
    const scale = o.scale ?? SHIP_SCALE;
    model.root.scale.setScalar(scale);
    model.root.visible = false;
    this.stage.scene.add(model.root);
    const curve = new THREE.CatmullRomCurve3(path);
    const s: Ship = {
      model, scale, curve, start, dur, mode: o.mode ?? "settle", face: o.face ?? null,
      tangent: curve.getTangentAt(0), shown: false, dead: false, trailT: 0, color: look.color,
    };
    this.ships.push(s);
    return s;
  }

  private at(at: number, run: () => void): void {
    this.cues.push({ at, run });
  }

  private shot(at: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    this.shots.push({ at, pos, look });
  }

  /** Where a ship is now. */
  private pos(s: Ship): THREE.Vector3 {
    return s.model.root.position;
  }

  private nose(s: Ship): THREE.Vector3 {
    return this.pos(s).clone().addScaledVector(s.tangent, s.model.radius * s.scale * 0.6);
  }

  private beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.25): void {
    this.fx.beam(from, to, color, width, 0.3);
    this.fx.burst(to, { count: this.count(10), colors: ["#ffffff", new THREE.Color(color).getStyle()], speed: 4, life: [0.2, 0.5], size: [0.3, 0.7] });
    this.fx.flash(to, 3, color, 0.25);
  }

  private explode(at: THREE.Vector3, r: number, sound = true): void {
    this.fx.burst(at, { count: this.count(30), colors: FIRE, speed: 1 + r * 0.6, life: [0.7, 1.5], size: [1 + r * 0.5, 2 + r * 0.8], drag: 0.3 });
    this.fx.burst(at, { count: this.count(90), colors: FIRE, speed: 6 + r * 2.5, life: [0.5, 1.4], size: [0.3, 0.8], drag: 0.2 });
    this.fx.burst(at, { count: this.count(30), colors: ["#ffffff", "#fff4c2"], speed: 10, life: [0.15, 0.4], size: [0.2, 0.4] });
    this.fx.flash(at, r * 7, 0xffd9a0, 0.5);
    this.fx.lightFlash(at, 40);
    this.fx.scatter(at, this.touch ? 4 : 9, 0.35 * r, 4 + r * 1.5);
    if (sound) this.sound("boom");
  }

  private kill(s: Ship): void {
    if (s.dead) return;
    this.explode(this.pos(s).clone(), s.model.radius * s.scale);
    s.dead = true;
    disposeModel(s.model);
  }

  /** A firework shell bursting at `at` into a sphere of sparks. */
  private firework(at: THREE.Vector3, colors: THREE.ColorRepresentation[], size = 1): void {
    const main = colors.map((c) => new THREE.Color(c).getStyle());
    this.fx.burst(at, { count: this.count(160), colors: [...main, "#ffffff"], speed: 16 * size, life: [1.3, 2.2], size: [0.6 * size, 1.1 * size], drag: 0.45, drift: v3(0, -1.5, 0) });
    this.fx.burst(at, { count: this.count(50), colors: ["#ffffff", "#fff4c2"], speed: 6 * size, life: [0.4, 0.9], size: [0.5 * size, 0.8 * size], drag: 0.4 });
    this.fx.flash(at, 16 * size, main[0]!, 0.5);
  }

  private salvo(from: Ship[], targets: () => THREE.Vector3 | null, color: THREE.ColorRepresentation, start: number, end: number, every: number): void {
    for (let t = start; t < end; t += every) {
      this.at(t, () => {
        const live = from.filter((s) => s.shown && !s.dead);
        const to = targets();
        if (live.length === 0 || !to) return;
        const s = this.pick(live);
        this.beam(this.nose(s), to.clone().add(v3(this.r(-0.8, 0.8), this.r(-0.8, 0.8), this.r(-0.8, 0.8))), color);
        if (this.rand() < 0.4) this.sound("zap");
      });
    }
  }

  // ---------------------------------------------------------------- the scenes

  /** The victor's armada sweeps the last enemies from its homeworld's sky, rings the planet, and the fireworks begin. */
  private conquest(): void {
    const hero = this.spec.hero;
    const accent = accentColor(hero.color).getStyle();
    this.sky(new THREE.Color(hero.color).multiplyScalar(0.5), 0x203a6a);
    this.lights(0x8fa4d0, 0x120a1c, 0xbfd0ff, v3(-200, 60, -150));
    this.sun(v3(420, 160, -900), 0xffe2a0, 30);
    const R = 26;
    this.homeworld(hero, R, v3(0, -8, 0));
    const station = this.addProp(buildStation(this.kit, "starFortress", hero.color), v3(R + 9, 6, 10));
    station.root.scale.setScalar(3.2);
    station.root.rotation.set(0.3, 0, 0.2);

    // The last enemy ships, burning in orbit, in the colours of the empires that fell.
    const foes = this.spec.others.length > 0 ? this.spec.others : [{ color: "#8a8f99", style: "standard", planet: "barren" }];
    const wrecks: Ship[] = [];
    for (let i = 0; i < 5; i++) {
      const foe = foes[i % foes.length]!;
      const p = v3(this.r(-30, 30), this.r(18, 34), this.r(30, 60));
      const w = this.ship(this.pick<ShipClass>(["destroyer", "cruiser", "battleship"]), foe, [p, p.clone().add(v3(this.r(-6, 6), this.r(-2, 2), this.r(-6, 6)))], 0, 20, {});
      w.face = p.clone().add(v3(this.r(-10, 10), this.r(-5, 5), this.r(-10, 10)));
      wrecks.push(w);
    }

    // The grand fleet comes over the camera's shoulder.
    const fleet: Ship[] = [];
    const lane = (dx: number, dy: number) => [v3(dx, 30 + dy, 150), v3(dx * 0.9, 26 + dy, 90), v3(dx * 0.7, 24 + dy, 40), v3(dx * 0.5, 22 + dy, -10)];
    fleet.push(this.ship("doomStar", hero, lane(0, 0), 0.2, 7, { scale: SHIP_SCALE * 1.4, face: v3(0, 0, -200) }));
    const ranks: [ShipClass, number][] = [["titan", 1], ["battleship", 2], ["cruiser", 3], ["destroyer", 4]];
    for (const [cls, rank] of ranks) {
      for (const side of [-1, 1]) fleet.push(this.ship(cls, hero, lane(side * rank * 9, -rank * 1.5), 0.2 + rank * 0.25, 7, { face: v3(side * rank * 6, 0, -200) }));
    }
    let next = 0;
    const target = () => {
      const live = wrecks.filter((w) => !w.dead);
      return live.length ? this.pos(live[next % live.length]!) : null;
    };
    this.salvo(fleet, target, accent, 1.6, 5.4, 0.18);
    wrecks.forEach((w, i) => this.at(2.4 + i * 0.7, () => { this.kill(w); next++; }));

    // Squadrons warp in and take station in a ring around the world.
    const ring: Ship[] = [];
    const n = this.touch ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3;
      const end = v3(Math.cos(a) * (R + 20), 10 + Math.sin(a * 2) * 3, Math.sin(a) * (R + 20));
      const from = end.clone().add(v3(Math.cos(a + 1.2) * 40, 8, Math.sin(a + 1.2) * 40));
      ring.push(this.ship(this.pick<ShipClass>(["cruiser", "battleship", "destroyer"]), hero, [from, end], 5.5 + i * 0.18, 2.2,
        { face: end.clone().add(v3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(10)) }));
    }
    this.at(5.4, () => this.sound("warp"));
    this.at(7.6, () => this.sound("fanfare"));
    for (let t = 7.8; t < ENDING_SECONDS + 0.5; t += 0.45) this.at(t, () => this.celebrate(R, hero));
    this.ambient = () => this.celebrate(R, hero);

    this.shot(0, v3(4, 30, 170), v3(0, 26, 100));
    this.shot(2.5, v3(-18, 34, 110), v3(0, 26, 40));
    this.shot(5.5, v3(-60, 40, 95), v3(0, 10, 0));
    this.shot(8.5, v3(-30, 26, 120), v3(0, 6, 0));
    this.shot(ENDING_SECONDS, v3(10, 22, 125), v3(0, 8, 0));
  }

  /** Fireworks over a homeworld in the empire's colours and gold. */
  private celebrate(R: number, look: EmpireLook): void {
    const a = this.r(0, TAU);
    const at = v3(Math.cos(a) * this.r(0, R * 1.3), R * 0.5 + this.r(8, 30), Math.sin(a) * this.r(0, R) + 10);
    const colors = this.rand() < 0.5 ? [look.color, accentColor(look.color).getStyle()] : [this.pick(GOLD), "#ffb347"];
    this.firework(at, colors, this.r(0.9, 1.5));
    if (this.rand() < 0.25) this.sound("sparkle");
  }

  /** Envoys of every empire arrive, salute, and a golden crown of light forms over the ruler's homeworld. */
  private council(): void {
    const hero = this.spec.hero;
    this.sky(0x5a3a10, 0x1a2a5a);
    this.lights(0xc0b090, 0x140c1c, 0xffe2a0, v3(150, 80, -120));
    this.sun(v3(-500, 120, -900), 0xfff0c0, 32, 2.8);
    const R = 24;
    this.homeworld(hero, R, v3(0, -6, 0));
    const crownAt = v3(0, R + 14, 0);

    // The crown: three golden rings and a glow, growing in once the envoys have saluted.
    const crown = new THREE.Group();
    crown.position.copy(crownAt);
    const ringGeo = new THREE.TorusGeometry(1, 0.035, 8, 96);
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(ringGeo, gold);
      ring.scale.setScalar(6 + i * 2.5);
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.35, (i - 1) * 0.5, 0);
      crown.add(ring);
      this.spinners.push({ obj: ring, speed: (i % 2 ? -1 : 1) * (0.3 + i * 0.12) });
    }
    const halo = new THREE.Sprite(glowSpriteMaterial(this.kit.glow, 0xffe39a, 0));
    halo.scale.setScalar(26);
    crown.add(halo);
    // A pillar of light from the world up through the crown.
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 70, 24, 1, true), pillarMat);
    pillar.position.set(0, R + 20, 0);
    this.stage.scene.add(crown, pillar);
    this.cleanup.push(() => { ringGeo.dispose(); gold.dispose(); pillar.geometry.dispose(); pillarMat.dispose(); });
    this.extras.push((t) => {
      const k = smooth(clamp01((t - 6.6) / 1.6));
      gold.opacity = k * 0.9;
      (halo.material as THREE.SpriteMaterial).opacity = k * (0.55 + Math.sin(t * 2) * 0.1);
      crown.scale.setScalar(0.3 + k * 0.7);
      pillarMat.opacity = k * 0.22 * (0.85 + Math.sin(t * 3) * 0.15);
    });

    // One envoy per empire (the ruler's own flagship first), each from its own direction.
    const envoys: Ship[] = [];
    const delegates = [hero, ...this.spec.others];
    const n = delegates.length;
    delegates.forEach((d, i) => {
      const a = (i / n) * TAU + Math.PI / 2;
      const end = v3(Math.cos(a) * (R + 16), R * 0.55 + (i % 2) * 3, Math.sin(a) * (R + 16));
      const from = end.clone().add(v3(Math.cos(a) * 60, 20, Math.sin(a) * 60));
      envoys.push(this.ship(i === 0 ? "titan" : "battleship", d, [from, end.clone().add(v3(Math.cos(a) * 12, 4, Math.sin(a) * 12)), end], 0.6 + i * 0.55, 2.6,
        { face: crownAt, scale: SHIP_SCALE * (i === 0 ? 1.25 : 1) }));
    });
    for (let i = 0; i < n; i++) this.at(0.6 + i * 0.55, () => this.sound("warp"));
    // The salute: every envoy fires a golden beam into the crown.
    envoys.forEach((e, i) => this.at(5.4 + i * 0.12, () => {
      if (!e.dead) this.beam(this.nose(e), crownAt, 0xffd36a, 0.3);
    }));
    this.at(6.6, () => {
      this.fx.flash(crownAt, 40, 0xfff0c0, 0.9);
      this.fx.shockwave(crownAt, 40, 0xffd36a, 1.4);
      this.fx.burst(crownAt, { count: this.count(260), colors: GOLD, speed: 12, life: [1.2, 2.4], size: [0.3, 0.7], drag: 0.5, drift: v3(0, -2, 0) });
      this.sound("fanfare");
    });
    // Golden confetti keeps drifting down over the world.
    const sparkle = () => {
      const a = this.r(0, TAU);
      this.fx.burst(crownAt.clone().add(v3(Math.cos(a) * this.r(4, 30), this.r(-6, 10), Math.sin(a) * this.r(4, 30))),
        { count: this.count(14), colors: GOLD, speed: 1.5, life: [1.4, 2.6], size: [0.25, 0.5], drag: 0.3, drift: v3(0, -2.5, 0) });
    };
    for (let t = 7.2; t < ENDING_SECONDS + 0.5; t += 0.2) this.at(t, sparkle);
    this.ambient = sparkle;

    this.shot(0, v3(0, 70, 150), v3(0, 10, 0));
    this.shot(3.5, v3(70, 40, 90), v3(0, 14, 0));
    this.shot(6.5, v3(40, 30, 85), crownAt);
    this.shot(9, v3(-20, 26, 92), v3(0, R * 0.7, 0));
    this.shot(ENDING_SECONDS, v3(-45, 22, 88), v3(0, R * 0.6, 0));
  }

  /** The citadel of Vex Prime falls to the victor's fleet, and the portal of the Vexari dimension collapses. */
  private raiders(): void {
    const hero = this.spec.hero;
    const accent = accentColor(hero.color).getStyle();
    const vex = { color: this.spec.raiders, style: "shard" };
    this.sky(0x4a1060, 0x10204a);
    this.lights(0x9070c0, 0x10061a, 0xff70d0, v3(100, -40, -200));
    // The black hole Vex Prime circles, and the portal back to the galaxy.
    const hole = this.addProp(buildStar(this.kit, 0x7a4dff, 26, true), v3(-60, 20, -220));
    hole.root.rotation.set(0.2, 0, 0.15);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0xe060ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const portalGeo = new THREE.TorusGeometry(14, 0.9, 12, 96);
    const portal = new THREE.Mesh(portalGeo, portalMat);
    const portalAt = v3(70, 22, -60);
    portal.position.copy(portalAt);
    portal.rotation.set(0, -0.9, 0);
    const portalGlow = new THREE.Sprite(glowSpriteMaterial(this.kit.glow, 0xc040ff, 0.6));
    portalGlow.scale.setScalar(60);
    portalGlow.position.copy(portalAt);
    this.stage.scene.add(portal, portalGlow);
    this.cleanup.push(() => { portalGeo.dispose(); portalMat.dispose(); });
    this.spinners.push({ obj: portal, speed: 0 });
    const light = new THREE.PointLight(0xffb0ff, 0, 400, 1.2);
    this.stage.scene.add(light);

    const planet = this.addProp(buildPlanet(this.kit, "radiated", 20, null), v3(0, -14, -40));
    const citadelAt = v3(0, 12, -10);
    const citadel = this.addProp(buildStation(this.kit, "starFortress", vex.color), citadelAt);
    citadel.root.scale.setScalar(6.5);
    citadel.root.rotation.set(0.35, 0, 0.1);
    let citadelUp = true;

    // The Vexari guard, and the victor's fleet coming through the portal.
    const guard: Ship[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const p = citadelAt.clone().add(v3(Math.cos(a) * 16, this.r(-3, 5), Math.sin(a) * 12 + 14));
      guard.push(this.ship(i === 0 ? "titan" : "cruiser", vex, [p, p.clone().add(v3(this.r(-2, 2), 0, 4))], 0, 6, { face: v3(30, 10, 60) }));
    }
    const fleet: Ship[] = [];
    for (let i = 0; i < 7; i++) {
      const lane = v3((i - 3) * 6, (i % 2) * 3 - 1, 0);
      const end = v3(22, 14, 40).add(lane);
      fleet.push(this.ship(i === 3 ? "doomStar" : this.pick<ShipClass>(["battleship", "titan", "cruiser"]), hero,
        [portalAt.clone().add(lane.clone().multiplyScalar(0.5)), portalAt.clone().add(v3(-10, -2, 30)).add(lane), end], 0.3 + i * 0.15, 3, { face: citadelAt, scale: SHIP_SCALE * (i === 3 ? 1.4 : 1.1) }));
    }
    this.at(0.3, () => this.sound("warp"));
    let g = 0;
    const target = () => {
      const live = guard.filter((s) => !s.dead);
      if (live.length) return this.pos(live[g % live.length]!);
      return citadelUp ? citadelAt.clone().add(v3(this.r(-6, 6), this.r(-3, 3), this.r(-4, 6))) : null;
    };
    this.salvo(fleet, target, accent, 2.2, 8.2, 0.12);
    // The guard fires back.
    for (let t = 2.4; t < 5; t += 0.35) {
      this.at(t, () => {
        const shooters = guard.filter((s) => !s.dead);
        const live = fleet.filter((s) => s.shown);
        if (!shooters.length || !live.length) return;
        this.beam(this.nose(this.pick(shooters)), this.pos(this.pick(live)).clone(), 0xff40c0, 0.22);
        this.fx.shield(this.pos(this.pick(live)), 3, 0.8);
      });
    }
    guard.forEach((s, i) => this.at(3.3 + i * 0.6, () => { this.kill(s); g++; }));
    // The citadel breaks apart: a chain of blasts, then the core goes up.
    for (let i = 0; i < 6; i++) {
      this.at(5.6 + i * 0.32, () => this.explode(citadelAt.clone().add(v3(this.r(-7, 7), this.r(-4, 4), this.r(-5, 5))), 2.5));
    }
    this.at(7.8, () => {
      citadelUp = false;
      citadel.root.visible = false;
      this.explode(citadelAt, 9);
      this.fx.flash(citadelAt, 120, 0xffe0ff, 1.1);
      this.fx.shockwave(citadelAt, 90, 0xff80e0, 1.6);
      this.fx.shockwave(citadelAt, 60, 0xffffff, 1.1, 0.15);
      this.fx.burst(citadelAt, { count: this.count(400), colors: ["#ffffff", "#ffb0ff", "#e060ff", ...FIRE], speed: 22, life: [1, 2.4], size: [0.4, 1.1], drag: 0.35 });
      light.position.copy(citadelAt);
      light.intensity = 900;
      this.stage.shake(2.2);
    });
    // The portal, its anchor gone, shrinks to a point and flashes out.
    this.extras.push((t, dt) => {
      light.intensity *= Math.pow(0.08, dt);
      const k = smooth(clamp01((t - 8.8) / 1.4));
      portal.scale.setScalar(Math.max(0.001, 1 - k));
      portalMat.opacity = 0.8 * (1 - k) + (k > 0 && k < 1 ? Math.sin(t * 40) * 0.2 : 0);
      (portalGlow.material as THREE.SpriteMaterial).opacity = 0.6 * (1 - k) + Math.sin(k * Math.PI) * 0.6;
      portal.rotation.z += dt * (0.5 + k * 8);
      planet.root.rotation.y += dt * 0.02;
    });
    this.at(10.2, () => {
      this.fx.flash(portalAt, 70, 0xffffff, 0.8);
      this.fx.burst(portalAt, { count: this.count(200), colors: ["#ffffff", "#ffb0ff", "#c040ff"], speed: 14, life: [0.6, 1.4], size: [0.3, 0.7], drag: 0.3 });
      this.sound("fanfare");
    });
    for (let t = 10.6; t < ENDING_SECONDS + 0.5; t += 0.5) this.at(t, () => this.victoryShell(citadelAt, hero));
    this.ambient = () => this.victoryShell(citadelAt, hero);

    this.shot(0, v3(95, 30, 40), portalAt);
    this.shot(3, v3(60, 26, 95), v3(10, 12, 10));
    this.shot(6.5, v3(30, 20, 80), citadelAt);
    this.shot(9.2, v3(80, 36, 70), v3(30, 14, -20));
    this.shot(ENDING_SECONDS, v3(55, 30, 100), v3(10, 8, -10));
  }

  /** Fireworks in the victor's colours over the ruins. */
  private victoryShell(near: THREE.Vector3, look: EmpireLook): void {
    const at = near.clone().add(v3(this.r(-30, 40), this.r(6, 30), this.r(-10, 30)));
    this.firework(at, [look.color, accentColor(look.color).getStyle(), this.pick(GOLD)], this.r(1, 1.6));
    if (this.rand() < 0.25) this.sound("sparkle");
  }

  /** The age ends at dawn: the sun climbs over the leader's homeworld while its fleet passes in review. */
  private score(): void {
    const hero = this.spec.hero;
    this.sky(0x3a1a40, 0x102040);
    this.lights(0x7080b0, 0x100810, 0xffc080, v3(0, 50, -300));
    const R = 40;
    this.homeworld(hero, R, v3(0, -R - 6, 0));
    const sun = this.sun(v3(0, -60, -900), 0xffc070, 34, 3);
    const from = v3(0, -90, -900);
    const to = v3(30, 120, -900);
    this.extras.push((t) => {
      const k = smooth(clamp01(t / 9));
      const p = from.clone().lerp(to, k);
      sun.model.root.position.copy(p);
      for (const g of sun.glows) g.position.copy(p);
      sun.light.position.copy(p);
      sun.light.intensity = 0.6 + k * 2.6;
    });
    // The fleet in review: three lines crossing the dawn.
    const review: Ship[] = [];
    for (let i = 0; i < 9; i++) {
      const row = i % 3;
      const y = 8 + row * 6;
      const z = -20 - row * 22;
      const startX = -120 - Math.floor(i / 3) * 14;
      review.push(this.ship(row === 1 && i < 3 ? "titan" : this.pick<ShipClass>(["battleship", "cruiser", "destroyer"]), hero,
        [v3(startX, y, z), v3(startX + 120, y + 2, z + 6), v3(startX + 260, y, z)], 2.4 + Math.floor(i / 3) * 0.4 + row * 0.2, 16, { mode: "pass" }));
    }
    this.at(2.4, () => this.sound("warp"));
    this.at(8.5, () => this.sound("fanfare"));
    const shell = () => {
      const at = v3(this.r(-50, 50), this.r(20, 50), this.r(-80, -20));
      this.firework(at, [hero.color, this.pick(GOLD)], this.r(1.2, 1.8));
      if (this.rand() < 0.2) this.sound("sparkle");
    };
    for (let t = 9; t < ENDING_SECONDS + 0.5; t += 0.6) this.at(t, shell);
    this.ambient = shell;
    // The review comes round again behind the card.
    this.ambientExtra = () => {
      if (!review.every((s) => this.t - s.start > s.dur * 1.1)) return;
      for (const s of review) {
        s.start = this.t + this.r(0, 2);
        s.shown = false;
      }
    };

    this.shot(0, v3(0, 2, 40), v3(0, 6, -200));
    this.shot(4, v3(-20, 6, 55), v3(0, 14, -100));
    this.shot(8, v3(10, 10, 70), v3(0, 20, -120));
    this.shot(ENDING_SECONDS, v3(30, 14, 80), v3(0, 22, -120));
  }

  /** The conqueror's fleet over the player's burning homeworld; the last defenders fall. */
  private defeat(): void {
    const mine = this.spec.hero;
    const foe = this.spec.foe ?? { color: "#a8322a", style: "fang", planet: "barren" };
    const foeAccent = accentColor(foe.color).getStyle();
    this.sky(0x3a0a08, 0x1a0a20);
    this.lights(0x806060, 0x200808, 0xff6a3a, v3(-100, -30, -200));
    this.sun(v3(-500, 60, -900), 0xff8a5a, 26, 1.6);
    const R = 26;
    const planetAt = v3(0, -10, 0);
    const world = this.homeworld(mine, R, planetAt);
    // The world scorches as the bombardment goes on: the surface darkens and glows, a red haze rises.
    const ground = world.materials.find((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial);
    const haze = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 24), fresnelMaterial(0xff5a20, 2.2, 0));
    haze.position.copy(planetAt);
    this.stage.scene.add(haze);
    this.extras.push((t) => {
      const k = smooth(clamp01((t - 5) / 7));
      if (ground) {
        ground.color.set(0xffffff).lerp(new THREE.Color(0xa07060), k);
        ground.emissive.set(0x000000).lerp(new THREE.Color(0x260800), k);
      }
      (haze.material as THREE.ShaderMaterial).uniforms.uIntensity!.value = k * 0.8;
    });
    const stationAt = v3(-R - 8, 8, 14);
    const station = this.addProp(buildStation(this.kit, "battlestation", mine.color), stationAt);
    station.root.scale.setScalar(3.6);
    station.root.rotation.set(0.3, 0, -0.2);
    let stationUp = true;

    const guards: Ship[] = [];
    for (let i = 0; i < 3; i++) {
      const p = stationAt.clone().add(v3(this.r(4, 14), this.r(-4, 6), this.r(8, 18)));
      guards.push(this.ship(this.pick<ShipClass>(["destroyer", "cruiser"]), mine, [p, p.clone().add(v3(1, 0, 2))], 0, 8, { face: v3(30, 30, 40) }));
    }
    const fleet: Ship[] = [];
    for (let i = 0; i < 8; i++) {
      const end = v3(this.r(-10, 40), this.r(22, 38), this.r(10, 40));
      const from = end.clone().add(v3(70, 30, 60));
      fleet.push(this.ship(i === 0 ? "doomStar" : this.pick<ShipClass>(["titan", "battleship", "cruiser", "destroyer"]), foe, [from, end],
        0.4 + i * 0.3, 3, { face: v3(planetAt.x, end.y - 8, planetAt.z), scale: SHIP_SCALE * (i === 0 ? 1.5 : 1) }));
    }
    this.at(0.4, () => this.sound("warp"));
    // A point on the near side of the world for the bombardment to strike.
    const surface = () => {
      const d = v3(this.r(-0.8, 0.6), this.r(0.1, 0.9), this.r(0.3, 1)).normalize();
      return planetAt.clone().addScaledVector(d, R * 1.01);
    };
    let k = 0;
    const target = () => {
      const live = guards.filter((s) => !s.dead);
      if (live.length) return this.pos(live[k % live.length]!);
      if (stationUp) return stationAt.clone().add(v3(this.r(-3, 3), this.r(-2, 2), this.r(-3, 3)));
      return surface();
    };
    this.salvo(fleet, target, foeAccent, 2, ENDING_SECONDS, 0.16);
    guards.forEach((s, i) => this.at(2.6 + i * 0.7, () => { this.kill(s); k++; }));
    for (let i = 0; i < 4; i++) this.at(4.8 + i * 0.3, () => this.explode(stationAt.clone().add(v3(this.r(-4, 4), this.r(-2, 2), this.r(-4, 4))), 1.6));
    this.at(6.2, () => {
      stationUp = false;
      station.root.visible = false;
      this.explode(stationAt, 6);
      this.fx.shockwave(stationAt, 30, 0xff9a50, 1.2);
      this.stage.shake(1.2);
    });
    // Fires break out across the surface; embers rise.
    const burn = () => {
      const at = surface();
      this.fx.burst(at, { count: this.count(26), colors: FIRE, speed: 3, life: [0.9, 1.8], size: [1, 2.2], drag: 0.5 });
      this.fx.flash(at, 10, 0xff7a3d, 0.6);
    };
    for (let t = 6.5; t < ENDING_SECONDS + 0.5; t += 0.3) this.at(t, burn);
    const embers = () => {
      this.fx.burst(v3(this.r(-60, 60), this.r(-20, 10), this.r(0, 70)),
        { count: this.count(4), colors: ["#ff7a3d", "#ffb347", "#8a8f99"], speed: 0.6, life: [2.5, 4], size: [0.25, 0.5], drag: 0.2, drift: v3(0.3, 2.2, 0) });
    };
    for (let t = 1; t < ENDING_SECONDS + 0.5; t += 0.15) this.at(t, embers);
    this.ambient = () => {
      burn();
      embers();
      const live = fleet.filter((s) => s.shown && !s.dead);
      if (live.length && this.rand() < 0.5) this.beam(this.nose(this.pick(live)), surface(), foeAccent);
    };

    this.shot(0, v3(30, 30, 120), v3(0, 6, 0));
    this.shot(3, v3(-10, 26, 95), stationAt);
    this.shot(6.5, v3(-50, 18, 80), v3(-10, 10, 10));
    this.shot(9, v3(10, 50, 100), v3(10, 20, 10));
    this.shot(ENDING_SECONDS, v3(40, 44, 100), v3(5, 14, 0));
  }

  // ---------------------------------------------------------------- per frame

  private frame(dt: number, skipping = false): void {
    const before = this.t;
    this.t += dt;
    if (before < ENDING_SECONDS && this.t >= ENDING_SECONDS && !skipping) this.hooks.onFinished();
    while (this.cues.length && this.cues[0]!.at <= this.t) this.cues.shift()!.run();
    if (this.t > ENDING_SECONDS && !skipping) {
      this.ambientT -= dt;
      if (this.ambientT <= 0 && this.ambient) {
        this.ambientT = this.spec.kind === "defeat" ? 0.25 : 0.55;
        this.ambient(dt);
      }
      this.ambientExtra?.();
    }
    for (const x of this.extras) x(this.t, dt);
    for (const s of this.spinners) s.obj.rotation.z += s.speed * dt;
    for (const p of this.props) p.animate(this.t, false);
    for (const s of this.ships) if (!s.dead) this.place(s, dt);
    (this.starfield.material as THREE.ShaderMaterial).uniforms.uTime!.value = this.t;
    this.fx.update(dt);
    this.placeCamera();
  }

  private place(s: Ship, dt: number): void {
    const root = s.model.root;
    const local = this.t - s.start;
    if (local < 0) {
      root.visible = false;
      s.shown = false;
      return;
    }
    const k = local / s.dur;
    const pos = new THREE.Vector3();
    if (s.mode === "settle") {
      const u = 1 - Math.pow(1 - clamp01(k), 3);
      pos.copy(s.curve.getPointAt(u));
      const tangent = s.curve.getTangentAt(Math.min(0.999, u));
      if (s.face && u > 0.6) {
        const want = s.face.clone().sub(pos).normalize();
        tangent.lerp(want, smooth((u - 0.6) / 0.4)).normalize();
      }
      s.tangent.copy(tangent);
      // A holding ship rides a gentle swell.
      pos.y += Math.sin(this.t * 0.8 + s.start * 3) * 0.3 * smooth(clamp01(k));
    } else if (k <= 1) {
      pos.copy(s.curve.getPointAt(k));
      s.tangent.copy(s.curve.getTangentAt(k));
    } else {
      s.tangent.copy(s.curve.getTangentAt(1));
      pos.copy(s.curve.getPointAt(1)).addScaledVector(s.tangent, (k - 1) * s.curve.getLength());
    }
    root.position.copy(pos);
    const t = s.tangent;
    const up = UP.clone().addScaledVector(t, -t.dot(UP));
    if (up.lengthSq() < 1e-4) up.set(1, 0, 0);
    up.normalize();
    const side = new THREE.Vector3().crossVectors(t, up);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, up, side));
    // Dropping out of warp: stretched along the flight path for the first moments.
    const w = clamp01(1 - local / 0.45);
    root.scale.set(s.scale * (1 + w * 6), s.scale * (1 - w * 0.6), s.scale * (1 - w * 0.6));
    root.visible = true;
    if (!s.shown) {
      s.shown = true;
      if (dt > 0) {
        this.fx.flash(pos, s.model.radius * s.scale * 4, 0xcfe6ff, 0.45);
        this.fx.burst(pos, { count: this.count(16), colors: ["#ffffff", "#bfe0ff"], speed: 5, life: [0.2, 0.5], size: [0.2, 0.4] });
      }
    }
    for (const e of s.model.engines) (e.material as THREE.SpriteMaterial).opacity = 0.75 + Math.random() * 0.25;
    s.model.animate(this.t, false);
    // Engine exhaust while under way.
    const moving = s.mode === "pass" || k < 1;
    if (!moving || dt === 0) return;
    s.trailT -= dt;
    if (s.trailT > 0) return;
    s.trailT = this.touch ? 0.07 : 0.04;
    const color = `#${new THREE.Color(s.color).lerp(new THREE.Color(0xffffff), 0.5).getHexString()}`;
    for (const e of s.model.engines.slice(0, 2)) {
      this.fx.burst(e.getWorldPosition(new THREE.Vector3()), { count: 1, colors: [color, "#ffffff"], speed: 0.4, life: [0.3, 0.6], size: [0.1 * s.scale, 0.18 * s.scale], drag: 0.5 });
    }
  }

  private placeCamera(): void {
    const cam = this.stage.camera;
    const shots = this.shots;
    if (!this.camPath || !this.lookPath || shots.length < 2) return;
    const last = shots[shots.length - 1]!;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.t >= last.at) {
      // After the script: a slow orbit around where the last shot looks.
      const a = (this.t - last.at) * 0.035;
      const off = last.pos.clone().sub(last.look).applyAxisAngle(UP, a);
      pos = last.look.clone().add(off);
      look = last.look.clone();
    } else {
      let i = 0;
      while (i < shots.length - 2 && shots[i + 1]!.at <= this.t) i++;
      const a = shots[i]!;
      const b = shots[i + 1]!;
      const local = clamp01((this.t - a.at) / (b.at - a.at));
      // Ease in at the start and out at the end only, so the camera never stops mid-flight.
      const first = i === 0;
      const lastSeg = i === shots.length - 2;
      const l = local;
      const e = first && lastSeg ? smooth(l) : first ? l * l * (2 - l) : lastSeg ? l + l * l - l * l * l : l;
      const u = (i + e) / (shots.length - 1);
      pos = this.camPath.getPoint(u);
      look = this.lookPath.getPoint(u);
    }
    cam.position.copy(pos);
    this.stage.controls.target.copy(look);
    cam.lookAt(look);
  }
}
