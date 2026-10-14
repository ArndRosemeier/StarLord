import * as THREE from "three";
import { RACES, raceShipStyle } from "@starlord/sim";
import { Stage } from "../three/stage";
import { createStarfield } from "../three/backdrop";
import { EffectsLayer } from "../three/effects";
import { glowSpriteMaterial } from "../three/materials";
import { ModelKit, disposeModel, type UnitModel } from "../three/models/kit";
import { buildShip, type ShipClass } from "../three/models/ships";
import { buildStation } from "../three/models/stations";
import { buildPlanet } from "../three/models/planet";
import { buildPlanetRings } from "../three/models/belt";
import { buildStar } from "../three/models/star";
import { buildMonster } from "../three/models/monster";
import { DOWNED, type FlyerRole } from "./titleData";

/**
 * The living title screen in 3D: the game's own ship models in every race's
 * design language fly real manoeuvres (banking passes, loops, barrel rolls,
 * dogfights, formations dropping out of warp) past a homeworld with its star
 * fortress, a ringed gas giant and a distant sun, all in front of the painted
 * nebula, which is the page behind this see-through canvas. The toys of the
 * old 2D title stay: click a ship to blow it up, click space to warp one in,
 * the Konami armada, and the hyperspace jump into a new game.
 */

export interface SceneHooks {
  onToast: (text: string) => void;
  onSound: (effect: "boom" | "zap" | "warp") => void;
}

interface Flyer {
  model: UnitModel;
  role: FlyerRole;
  scale: number;
  curve: THREE.CatmullRomCurve3;
  length: number;
  speed: number;
  /** Distance travelled along the curve. */
  s: number;
  /** Keeps flying the same way after the end, until out of sight. */
  done: boolean;
  /** Rolls freely through loops instead of drifting back upright. */
  aerobatic: boolean;
  /** Extra roll over the flight (barrel rolls), radians per world unit. */
  rollRate: number;
  roll: number;
  bank: number;
  up: THREE.Vector3;
  tangent: THREE.Vector3;
  /** Side and vertical offset from the curve, for wingmen. */
  offset: THREE.Vector2;
  /** Counts down from 1 while dropping out of warp. */
  warpIn: number;
  /** Fighters chasing a target fire at it. */
  target: Flyer | null;
  cooldown: number;
  hp: number;
  trailT: number;
  engineColor: THREE.Color;
  dead: boolean;
}

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FIRE = ["#ffffff", "#fff1a8", "#ffb347", "#ff6a2a", "#c2341a"];
const SHIP_SCALE = 4.5;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Where the camera sits and looks; ships fly around this space. */
const CAMERA = v3(0, 3, 42);
const LOOK = v3(0, 1, 0);
const PLANET_AT = v3(-40, -24, -26);
const PLANET_R = 24;

export class TitleScene3D {
  private stage: Stage;
  private kit: ModelKit;
  private fx: EffectsLayer;
  private starfield: THREE.Points;
  private flyers: Flyer[] = [];
  private props: UnitModel[] = [];
  private station: UnitModel;
  private moon: UnitModel;
  private t = 0;
  private nextSpawn = 0.6;
  private pointer = new THREE.Vector2();
  private smoothPointer = new THREE.Vector2();
  private warp: { start: number; done: () => void; fired: boolean } | null = null;
  private downed = 0;
  private maxShips: number;
  private touch: boolean;
  private raycaster = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, private art: HTMLElement | null, private hooks: SceneHooks, private reduced: boolean) {
    this.touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.maxShips = this.touch ? 10 : 18;
    this.stage = new Stage(container, { fov: 45, near: 0.5, far: 4000, transparent: true, maxPixelRatio: this.touch ? 1.25 : 1.75 });
    this.stage.controls.enabled = false;
    const { scene, textures } = this.stage;
    this.kit = this.stage.own(new ModelKit(textures));
    this.fx = this.stage.own(new EffectsLayer(this.kit.glow, { particleCapacity: this.touch ? 700 : 1800 }));
    scene.add(this.fx.group);

    // Stars in front of the painted nebula give depth when the camera drifts.
    this.starfield = createStarfield(this.touch ? 500 : 1000, 700, 11);
    scene.add(this.starfield);

    // The sun far away in the upper left lights everything, like the painted planets.
    const sunAt = v3(-400, 175, -560);
    const sun = buildStar(this.kit, 0xffd28a, 22);
    sun.root.position.copy(sunAt);
    this.addProp(sun);
    // A wide corona so the far-off sun reads as a sun, not a ball.
    for (const [size, opacity, color] of [[150, 0.9, 0xffe2b0], [420, 0.4, 0xffb070], [900, 0.16, 0xff8a50]] as const) {
      const glow = new THREE.Sprite(glowSpriteMaterial(this.kit.glow, color, opacity));
      glow.scale.setScalar(size);
      glow.position.copy(sunAt);
      scene.add(glow);
    }
    scene.add(new THREE.HemisphereLight(0x8fa4d0, 0x120a1c, 0.55));
    const light = new THREE.DirectionalLight(0xfff1e0, 2.8);
    light.position.copy(sunAt);
    scene.add(light);
    const rim = new THREE.DirectionalLight(0x7a5cff, 0.6);
    rim.position.set(120, -40, -200);
    scene.add(rim);

    // A homeworld low on the left with its moon and star fortress, and a ringed gas giant far to the right.
    const home = buildPlanet(this.kit, "terran", PLANET_R, null);
    home.root.position.copy(PLANET_AT);
    this.addProp(home);
    this.moon = buildPlanet(this.kit, "barren", 2.6, null);
    this.addProp(this.moon);
    const giant = buildPlanet(this.kit, "gasGiant", 26, null);
    giant.root.position.set(215, 20, -360);
    const rings = buildPlanetRings(this.kit, 26, 0xd8b890, 5);
    rings.rotation.set(-Math.PI / 2 + 0.35, 0.2, 0.3);
    giant.root.add(rings);
    this.addProp(giant);
    this.station = buildStation(this.kit, "starFortress", "#4a8cff");
    this.station.root.scale.setScalar(3.2);
    this.station.root.rotation.set(0.35, 0, -0.25);
    this.addProp(this.station);
    const outpost = buildStation(this.kit, "starBase", "#d9b44a");
    outpost.root.scale.setScalar(5);
    outpost.root.position.set(120, -22, -230);
    outpost.root.rotation.set(0.5, 0, 0.3);
    this.addProp(outpost);

    this.stage.useStudioEnvironment(0.45);
    this.stage.camera.position.copy(CAMERA);
    this.stage.camera.lookAt(LOOK);
    this.stage.controls.target.copy(LOOK);
    const scaleFx = () => this.fx.setParticleScale(this.stage.viewportHeight, this.stage.camera.fov);
    scaleFx();
    this.cleanup.push(this.stage.onResize(scaleFx));

    const onMove = (e: PointerEvent) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);
    this.cleanup.push(() => window.removeEventListener("pointermove", onMove));

    this.placeOrbiters(0);
    if (reduced) {
      // One still, composed frame: a few ships caught mid-flight.
      for (let i = 0; i < 4; i++) {
        const f = this.spawnPass();
        f.s = f.length * rand(0.3, 0.5);
        this.updateFlyer(f, 0);
      }
      void textures.ready().then(() => this.stage.renderOnce());
      this.cleanup.push(this.stage.onResize(() => this.stage.renderOnce()));
    } else {
      // A formation is already crossing when the title appears.
      this.spawnFormation(false);
      this.stage.onFrame((dt) => this.frame(dt));
    }
  }

  /** Resolves once the planet and hull textures are in, so the canvas can fade in complete. */
  ready(): Promise<void> {
    return this.stage.textures.ready();
  }

  start(): void {
    if (!this.reduced) this.stage.start();
  }

  destroy(): void {
    for (const c of this.cleanup) c();
    for (const f of this.flyers) disposeModel(f.model);
    for (const p of this.props) disposeModel(p);
    this.flyers = [];
    this.props = [];
    this.stage.dispose();
  }

  /** Into hyperspace: the camera surges forward and the view stretches, then `done` runs. */
  jump(done: () => void): void {
    if (this.reduced) return done();
    if (this.warp) return;
    this.warp = { start: this.t, done, fired: false };
    this.hooks.onSound("warp");
  }

  /** Easter egg: the Grand Armada drops out of warp behind the camera and sails into the scene. */
  armada(): void {
    if (this.reduced) return;
    const race = pick(RACES);
    const style = raceShipStyle(race.id);
    const curve = new THREE.CatmullRomCurve3([v3(0, 6, 70), v3(0, 3, 20), v3(4, 2, -60), v3(10, 4, -220), v3(16, 8, -420)]);
    const lead = this.addFlyer(buildShip(this.kit, "doomStar", race.color, style), "capital", curve, 14, { scale: SHIP_SCALE * 1.3 });
    lead.warpIn = 1;
    const ranks: ShipClass[] = ["titan", "battleship", "cruiser", "destroyer", "frigate"];
    ranks.forEach((cls, i) => {
      for (const side of [-1, 1]) {
        const f = this.addFlyer(buildShip(this.kit, cls, race.color, style), "cruiser", curve, 14, {
          offset: new THREE.Vector2(side * (i + 1) * 7, -(i + 1) * 1.6),
        });
        f.s = -(i + 1) * 6;
        f.warpIn = 1 + (i + 1) * 0.15;
      }
    });
    this.hooks.onToast(`The Grand Armada of the ${race.plural} salutes you, StarLord!`);
    this.hooks.onSound("warp");
  }

  /** Clicks: shoot a ship down, or warp a new one in where there is none. */
  click(clientX: number, clientY: number): void {
    if (this.reduced || this.warp) return;
    const el = this.stage.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const ray = this.raycaster.ray;
    let hit: Flyer | null = null;
    let best = Infinity;
    for (const f of this.flyers) {
      if (f.dead || f.warpIn > 0.5) continue;
      const p = f.model.root.position;
      // Generous targets: small ships far away are hard to click.
      const dist = p.distanceTo(this.stage.camera.position);
      const r = Math.max(f.model.radius * f.scale * 1.1, dist * 0.035);
      if (ray.distanceSqToPoint(p) < r * r && dist < best) {
        best = dist;
        hit = f;
      }
    }
    if (hit) {
      this.explode(hit, true);
      return;
    }
    if (this.liveShips() >= this.maxShips + 4) return;
    // Warp a ship in about 30 units in front of the camera, where the player clicked, flying across the view.
    const at = ray.at(30, new THREE.Vector3());
    const dir = ndc.x < 0 ? 1 : -1;
    const curve = new THREE.CatmullRomCurve3([
      at.clone(),
      at.clone().add(v3(dir * 30, rand(-3, 3), rand(-30, -10))),
      at.clone().add(v3(dir * 70, rand(-6, 8), rand(-90, -40))),
      at.clone().add(v3(dir * 120, rand(-6, 14), rand(-200, -120))),
    ]);
    const f = this.addFlyer(this.randomShip(pick<ShipClass>(["frigate", "destroyer", "cruiser"])), "fighter", curve, rand(12, 18));
    f.warpIn = 1;
    this.fx.flash(at, 4, 0xbfe0ff, 0.5);
    this.fx.burst(at, { count: this.count(30), colors: ["#ffffff", "#bfe0ff", "#7ab0ff"], speed: 6, life: [0.3, 0.7], size: [0.15, 0.35], drag: 0.1 });
    this.hooks.onSound("zap");
  }

  // ---------------------------------------------------------------- building

  private addProp(m: UnitModel): void {
    this.stage.scene.add(m.root);
    this.props.push(m);
  }

  private count(n: number): number {
    return Math.max(1, Math.round(this.touch ? n * 0.5 : n));
  }

  private liveShips(): number {
    return this.flyers.filter((f) => !f.dead).length;
  }

  private randomShip(cls: ShipClass, raceIndex = Math.floor(Math.random() * RACES.length)): UnitModel {
    const race = RACES[raceIndex % RACES.length]!;
    return buildShip(this.kit, cls, race.color, raceShipStyle(race.id));
  }

  private addFlyer(
    model: UnitModel, role: FlyerRole, curve: THREE.CatmullRomCurve3, speed: number,
    o: { scale?: number; aerobatic?: boolean; rollRate?: number; offset?: THREE.Vector2; engine?: THREE.ColorRepresentation } = {},
  ): Flyer {
    const scale = o.scale ?? SHIP_SCALE;
    model.root.scale.setScalar(scale);
    this.stage.scene.add(model.root);
    const engineColor = new THREE.Color(o.engine ?? ((model.engines[0]?.material as THREE.SpriteMaterial | undefined)?.color ?? 0x9ad0ff));
    const f: Flyer = {
      model, role, scale, curve, length: curve.getLength(), speed, s: 0, done: false,
      aerobatic: o.aerobatic ?? false, rollRate: o.rollRate ?? 0, roll: 0, bank: 0,
      up: UP.clone(), tangent: curve.getTangentAt(0), offset: o.offset ?? new THREE.Vector2(),
      warpIn: 0, target: null, cooldown: rand(0.4, 1.2), hp: role === "raider" ? 3 : 1, trailT: 0, engineColor, dead: false,
    };
    this.flyers.push(f);
    this.updateFlyer(f, 0);
    return f;
  }

  // ---------------------------------------------------------------- manoeuvres

  /** Where a pass can start or end: well off to one side, at some depth. */
  private side(dir: number, depth: number): THREE.Vector3 {
    return v3(dir * rand(80, 120), rand(-10, 22), depth);
  }

  /** A sweeping, banking pass across the view, now and then right past the camera. */
  private spawnPass(): Flyer {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const close = Math.random() < 0.35;
    const a = this.side(-dir, rand(-90, -30));
    const b = v3(dir * rand(-25, -5), rand(-6, 12), close ? rand(8, 22) : rand(-25, 0));
    const c = close ? v3(dir * rand(20, 40), rand(-4, 10), rand(40, 70)) : v3(dir * rand(30, 50), rand(-4, 16), rand(-35, -5));
    const d = close ? v3(dir * rand(30, 60), rand(0, 14), 120) : this.side(dir, rand(-120, -50));
    const cls = pick<ShipClass>(["frigate", "destroyer", "destroyer", "cruiser", "battleship"]);
    const f = this.addFlyer(this.randomShip(cls), cls === "frigate" || cls === "destroyer" ? "fighter" : "cruiser",
      new THREE.CatmullRomCurve3([a, b, c, d]), rand(14, 22));
    if (Math.random() < 0.3 && (cls === "frigate" || cls === "destroyer")) f.rollRate = (Math.random() < 0.5 ? -1 : 1) * TAU / rand(25, 40);
    return f;
  }

  /** Climb into a full vertical loop, then fly on. */
  private spawnLoop(): void {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const x0 = dir * rand(-15, 5);
    const z = rand(-35, -15);
    const y = rand(-2, 6);
    const r = rand(8, 11);
    const pts = [v3(x0 - dir * 110, y, z - 20), v3(x0 - dir * 30, y, z)];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * TAU;
      // A loop drifting sideways a little, so the exit does not cross the entry.
      pts.push(v3(x0 + dir * Math.sin(a) * r + dir * i * 1.2, y + r - Math.cos(a) * r, z + i * 0.6));
    }
    pts.push(v3(x0 + dir * 40, y, z + 8), v3(x0 + dir * 130, y + 6, z - 30));
    this.addFlyer(this.randomShip(pick<ShipClass>(["frigate", "destroyer"])), "fighter", new THREE.CatmullRomCurve3(pts), rand(18, 22), { aerobatic: true });
  }

  /** A pirate raider weaving away from a pair of interceptors that shoot at it. */
  private spawnDogfight(): void {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const z = rand(-30, 0);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      pts.push(v3(dir * (-120 + k * 240), Math.sin(k * 7) * 7 + rand(-2, 2) + 4, z + Math.cos(k * 5) * 12));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const raider = this.addFlyer(buildShip(this.kit, "destroyer", "#a8322a", "fang"), "raider", curve, 20, { engine: 0xff9a50 });
    const race = Math.floor(Math.random() * RACES.length);
    for (let i = 1; i <= 2; i++) {
      const f = this.addFlyer(this.randomShip("frigate", race), "fighter", curve, 20, { offset: new THREE.Vector2((i === 1 ? -1 : 1) * 3.5, (i - 1.5) * 3) });
      f.s = -8 - i * 6;
      f.target = raider;
    }
  }

  /** A wing of one race drops out of warp and cruises past in formation. */
  private spawnFormation(warp = true): void {
    const race = Math.floor(Math.random() * RACES.length);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const z = rand(-55, -25);
    const a = v3(-dir * rand(40, 60), rand(4, 16), z + rand(-20, 20));
    const curve = new THREE.CatmullRomCurve3([a, a.clone().add(v3(dir * 50, rand(-4, 4), 15)), a.clone().add(v3(dir * 110, rand(-6, 6), 10)), a.clone().add(v3(dir * 190, rand(0, 10), -30))]);
    const lead = this.addFlyer(this.randomShip(pick<ShipClass>(["battleship", "titan"]), race), "cruiser", curve, 9);
    lead.warpIn = warp ? 1 : 0;
    if (!warp) lead.s = 10;
    const n = this.touch ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const rank = Math.floor(i / 2) + 1;
      const side = i % 2 === 0 ? -1 : 1;
      const f = this.addFlyer(this.randomShip(pick<ShipClass>(["destroyer", "cruiser"]), race), "cruiser", curve, 9, {
        offset: new THREE.Vector2(side * rank * 7, rank * 1.2),
      });
      f.s = lead.s - rank * 7;
      f.warpIn = warp ? 1 + rank * 0.25 : 0;
    }
    if (warp) this.hooks.onSound("warp");
  }

  /** Something big and slow far off: a doom star, or a space creature. */
  private spawnGiant(): void {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const z = rand(-260, -180);
    const y = rand(10, 40);
    const curve = new THREE.CatmullRomCurve3([v3(-dir * 230, y, z), v3(0, y + rand(-8, 8), z + 30), v3(dir * 230, y, z)]);
    if (Math.random() < 0.4) {
      const m = buildMonster(this.kit, 1, Math.floor(rand(0, 1000)), pick(["ionEel", "starWyrm", "voidAmoeba", "starHydra"] as const));
      this.addFlyer(m, "monster", curve, 6, { scale: 9, engine: 0xb070ff });
    } else {
      this.addFlyer(this.randomShip(pick<ShipClass>(["titan", "doomStar"])), "capital", curve, 7, { scale: 11 });
    }
  }

  /** A patrol craft circling the star fortress. */
  private spawnPatrol(): void {
    const c = this.station.root.position;
    const r = rand(9, 13);
    const pts: THREE.Vector3[] = [];
    const turns = 1.5;
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * TAU * turns;
      pts.push(v3(c.x + Math.cos(a) * r, c.y + Math.sin(a * 0.5) * 2 + 1, c.z + Math.sin(a) * r));
    }
    pts.push(v3(c.x + 60, c.y + 10, c.z - 60), v3(c.x + 160, c.y + 20, c.z - 160));
    this.addFlyer(this.randomShip("frigate"), "fighter", new THREE.CatmullRomCurve3(pts), 10);
  }

  private schedule(dt: number): void {
    this.nextSpawn -= dt;
    if (this.nextSpawn > 0) return;
    this.nextSpawn = rand(1.2, 2.6);
    if (this.liveShips() >= this.maxShips) return;
    const roll = Math.random();
    if (roll < 0.34) this.spawnPass();
    else if (roll < 0.48) this.spawnLoop();
    else if (roll < 0.64) this.spawnDogfight();
    else if (roll < 0.77) this.spawnFormation();
    else if (roll < 0.87) this.spawnPatrol();
    else if (!this.flyers.some((f) => f.role === "capital" || f.role === "monster")) this.spawnGiant();
    else this.spawnPass();
  }

  // ---------------------------------------------------------------- per frame

  private frame(dt: number): void {
    this.t += dt;
    if (!this.warp) this.schedule(dt);
    this.placeOrbiters(this.t);
    for (const p of this.props) p.animate(this.t, false);
    (this.starfield.material as THREE.ShaderMaterial).uniforms.uTime!.value = this.t;

    for (const f of this.flyers) {
      if (f.dead) continue;
      this.updateFlyer(f, dt);
      this.shoot(f, dt);
      this.trail(f, dt);
    }
    for (const f of this.flyers) {
      if (!f.dead && f.done && this.offscreen(f)) {
        f.dead = true;
        disposeModel(f.model);
      }
    }
    this.flyers = this.flyers.filter((f) => !f.dead);
    this.fx.update(dt);
    this.moveCamera(dt);

    if (this.warp && !this.warp.fired && this.t - this.warp.start > 1.35) {
      this.warp.fired = true;
      this.warp.done();
    }
  }

  private placeOrbiters(t: number): void {
    const a = t * 0.05 + 0.6;
    this.station.root.position.set(PLANET_AT.x - 4 + Math.cos(a) * 30, PLANET_AT.y + 16 + Math.sin(a) * 4, PLANET_AT.z + Math.sin(a) * 30);
    const m = t * 0.02 + 2.2;
    this.moon.root.position.set(PLANET_AT.x + Math.cos(m) * 52, PLANET_AT.y + 26, PLANET_AT.z + Math.sin(m) * 40 - 20);
  }

  private updateFlyer(f: Flyer, dt: number): void {
    const root = f.model.root;
    f.s += f.speed * dt * (f.warpIn > 0 ? 0.25 : 1);
    if (f.warpIn > 0) f.warpIn = Math.max(0, f.warpIn - dt * 1.6);
    const prev = f.tangent.clone();
    const pos = this.tmp;
    if (f.s < 0) {
      // Wingmen waiting their turn sit behind the start of the curve.
      f.tangent.copy(f.curve.getTangentAt(0));
      pos.copy(f.curve.getPointAt(0)).addScaledVector(f.tangent, f.s);
    } else if (f.s <= f.length) {
      const u = f.s / f.length;
      pos.copy(f.curve.getPointAt(u));
      f.tangent.copy(f.curve.getTangentAt(u));
    } else {
      f.done = true;
      f.tangent.copy(f.curve.getTangentAt(1));
      pos.copy(f.curve.getPointAt(1)).addScaledVector(f.tangent, f.s - f.length);
    }
    const t = f.tangent;
    // Carry the up vector along the path (no flips in loops), drifting back upright unless it is an aerobatic flight.
    f.up.addScaledVector(t, -f.up.dot(t)).normalize();
    if (!f.aerobatic && Math.abs(t.y) < 0.9) {
      const upright = UP.clone().addScaledVector(t, -t.y).normalize();
      f.up.lerp(upright, Math.min(1, dt * 2)).normalize();
    }
    // Bank into turns: the left wing (-Z) dips in a left turn.
    if (dt > 0) {
      const turn = new THREE.Vector3().crossVectors(prev, t).dot(f.up) / dt;
      const want = THREE.MathUtils.clamp(-turn * 0.9, -1.1, 1.1);
      f.bank += (want - f.bank) * Math.min(1, dt * 3);
      f.roll += f.rollRate * f.speed * dt;
    }
    const up = f.up.clone().applyAxisAngle(t, f.bank + f.roll);
    const side = new THREE.Vector3().crossVectors(t, up);
    pos.addScaledVector(side, f.offset.x).addScaledVector(up, f.offset.y);
    root.position.copy(pos);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, up, side));
    // Dropping out of warp: stretched along the flight path and glowing.
    const w = f.warpIn > 1 ? 0 : f.warpIn;
    root.visible = f.warpIn <= 1;
    root.scale.set(f.scale * (1 + w * 6), f.scale * (1 - w * 0.6), f.scale * (1 - w * 0.6));
    if (dt > 0 && f.warpIn < 1 && f.warpIn + dt * 1.6 >= 1) {
      this.fx.flash(pos, f.model.radius * f.scale * 3, 0xcfe6ff, 0.45);
      this.fx.burst(pos, { count: this.count(18), colors: ["#ffffff", "#bfe0ff"], speed: 5, life: [0.2, 0.5], size: [0.15, 0.3] });
    }
    for (const e of f.model.engines) (e.material as THREE.SpriteMaterial).opacity = 0.75 + Math.random() * 0.25;
    f.model.animate(this.t, false);
  }

  /** Engine exhaust: short-lived glowing motes left behind each engine. */
  private trail(f: Flyer, dt: number): void {
    if (f.role === "monster" || f.warpIn > 0 || f.s < 0) return;
    f.trailT -= dt;
    if (f.trailT > 0) return;
    f.trailT = this.touch ? 0.06 : 0.035;
    const color = `#${f.engineColor.getHexString()}`;
    for (const e of f.model.engines.slice(0, 3)) {
      const at = e.getWorldPosition(new THREE.Vector3());
      this.fx.burst(at, { count: 1, colors: [color, "#ffffff"], speed: 0.4, life: [0.35, 0.7], size: [0.12 * f.scale, 0.2 * f.scale], drag: 0.5 });
    }
  }

  private shoot(f: Flyer, dt: number): void {
    const target = f.target;
    if (!target) return;
    if (target.dead) {
      f.target = null;
      return;
    }
    f.cooldown -= dt;
    if (f.cooldown > 0 || f.s < 0) return;
    const from = f.model.root.position;
    const to = target.model.root.position;
    // Only fire at what is ahead of the nose.
    if (this.tmp.subVectors(to, from).normalize().dot(f.tangent) < 0.6) return;
    f.cooldown = rand(0.5, 1.1);
    const hits = Math.random() < 0.6;
    const aim = to.clone().add(hits ? new THREE.Vector3() : new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)));
    this.fx.beam(from.clone().addScaledVector(f.tangent, 1.5), aim, 0x6ad0ff, 0.12, 0.18);
    if (!hits) return;
    this.fx.burst(aim, { count: this.count(8), colors: ["#ffffff", "#9ad0ff"], speed: 3, life: [0.15, 0.4], size: [0.15, 0.3] });
    // The raider survives most of the chase, then usually goes down in the middle of the screen.
    const centre = Math.abs(to.x) < 35 && target.s > target.length * 0.4;
    if (centre && Math.random() < 0.35 && --target.hp <= 0) this.explode(target, false);
  }

  private explode(f: Flyer, byPlayer: boolean): void {
    if (f.dead) return;
    f.dead = true;
    const at = f.model.root.position.clone();
    const r = f.model.radius * f.scale;
    this.fx.burst(at, { count: this.count(30), colors: FIRE, speed: 1 + r * 0.5, life: [0.6, 1.3], size: [0.8 + r * 0.4, 1.6 + r * 0.6], drag: 0.3 });
    this.fx.burst(at, { count: this.count(90), colors: FIRE, speed: 5 + r * 2, life: [0.4, 1.3], size: [0.25, 0.6], drag: 0.2 });
    this.fx.burst(at, { count: this.count(30), colors: ["#ffffff", "#fff4c2"], speed: 9, life: [0.15, 0.4], size: [0.15, 0.3] });
    this.fx.flash(at, r * 6, 0xffd9a0, 0.5);
    this.fx.lightFlash(at, 30);
    this.fx.scatter(at, this.touch ? 4 : 10, 0.25 * f.scale, 4 + r);
    disposeModel(f.model);
    this.hooks.onSound("boom");
    if (byPlayer) {
      this.downed++;
      const lines = DOWNED[f.role];
      this.hooks.onToast(this.downed === 10 ? "Ten kills! The Admiralty would like a word about your recruitment papers." : pick(lines));
    }
  }

  /** Past the end of its path and out of the camera's view. */
  private offscreen(f: Flyer): boolean {
    const p = f.model.root.position;
    if (f.s > f.length + 400) return true;
    const v = p.clone().project(this.stage.camera);
    return v.z > 1 || Math.abs(v.x) > 1.4 || Math.abs(v.y) > 1.4;
  }

  /** A slow drift with the pointer, and the surge forward into hyperspace. */
  private moveCamera(dt: number): void {
    const cam = this.stage.camera;
    this.smoothPointer.lerp(this.pointer, Math.min(1, dt * 2));
    const sway = v3(Math.sin(this.t * 0.07) * 2 + this.smoothPointer.x * 3, Math.sin(this.t * 0.05) * 1 - this.smoothPointer.y * 2, 0);
    let surge = 0;
    let fov = 45;
    if (this.warp) {
      const e = Math.min(1, (this.t - this.warp.start) / 1.35);
      surge = e * e * e * 160;
      fov = 45 + e * e * 65;
    }
    cam.position.copy(CAMERA).add(sway).add(v3(0, 0, -surge));
    const look = LOOK.clone().addScaledVector(sway, 0.4).add(v3(0, 0, -surge));
    this.stage.controls.target.copy(look);
    cam.lookAt(look);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // The painted nebula behind moves a little against the scene, and rushes at the viewer in the jump.
    if (this.art) {
      const k = this.warp ? 1 + Math.pow(Math.min(1, (this.t - this.warp.start) / 1.35), 3) * 0.8 : 1;
      this.art.style.transform = `translate(${(-sway.x * 2.5).toFixed(1)}px, ${(sway.y * 2.5).toFixed(1)}px) scale(${k.toFixed(3)})`;
    }
  }
}
