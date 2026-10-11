import * as THREE from "three";
import { FIELD_HEIGHT, FIELD_WIDTH, type CombatReport, type PlayerView } from "@starlord/sim";
import { Stage } from "../../three/stage";
import { createBackdropPlane, createNebulaSky, createStarfield } from "../../three/backdrop";
import { EffectsLayer } from "../../three/effects";
import { HealthBar, healthColor } from "../../three/billboards";
import { Overlay } from "../../three/overlay";
import { ModelKit, disposeModel, type UnitModel } from "../../three/models/kit";
import { buildShip } from "../../three/models/ships";
import { buildStation, STATION_RADIUS } from "../../three/models/stations";
import { buildMonster } from "../../three/models/monster";
import { buildPlanet } from "../../three/models/planet";
import {
  STEP_MS, starPlanetType, systemName, weaponLook,
  type CombatEvent, type Frames, type UnitInfo, type UnitState,
} from "./replayModel";

/**
 * The 3D battle: the battlefield grid as a plane in space, every unit as a
 * model, and the current event's shots and explosions. React feeds it the
 * replay position with `show`; it animates the rest on its own.
 */

const PLANET_RADIUS = 3.2;
const SHIP_Y = 0.45;

/** Beam colours by weapon, so tech levels and monsters read differently. */
const BEAM_COLORS: Record<string, number> = {
  laserCannon: 0xff4a5a, massDriver: 0xffd27a, fusionBeam: 0xff8a3d, ionPulseCannon: 0x7ad7ff,
  neutronBlaster: 0x7dffb0, gravitonBeam: 0xc08aff, gaussCannon: 0xd8e4ff, phasor: 0x5ab0ff,
  plasmaCannon: 0x4dffea, disruptorCannon: 0xff5ae0, deathRay: 0xff2a2a, stellarConverter: 0xffffff,
  monsterAcid: 0x9aff3d, monsterRay: 0xc77dff, monsterFire: 0xff9a3d,
};

const SPARK = ["#ffe7a3", "#ffb347", "#ffffff"];
const FIRE = ["#fff4c2", "#ffb347", "#ff6a3d", "#ff3d3d", "#ffd27a"];

export interface BattleSceneInput {
  report: CombatReport;
  view: PlayerView;
  units: UnitInfo[];
  reduced: boolean;
}

interface UnitView {
  info: UnitInfo;
  model: UnitModel;
  bar: HealthBar;
  color: string;
  phase: number;
  heading: number;
  /** Fixed world anchor for planets, which never move. */
  planetCenter: THREE.Vector3 | null;
  wreck: boolean;
}

export const gridToWorld = (x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 =>
  out.set(x - FIELD_WIDTH / 2 + 0.5, SHIP_Y, y - FIELD_HEIGHT / 2 + 0.5);

export class BattleScene {
  readonly stage: Stage;
  private kit: ModelKit;
  private fx: EffectsLayer;
  private overlay: Overlay;
  private units = new Map<string, UnitView>();
  private frames: Frames | null = null;
  private event: CombatEvent | undefined;
  private stepAt = 0;
  private reduced: boolean;
  private hovered: string | null = null;
  private selected: string | null = null;
  private selectRing: THREE.Mesh;
  private pointer = new THREE.Vector2(-10, -10);
  private pointerInside = false;
  private raycaster = new THREE.Raycaster();
  private starfield: THREE.Points;

  constructor(container: HTMLElement, private input: BattleSceneInput) {
    this.reduced = input.reduced;
    this.stage = new Stage(container, {
      fov: 40, far: 3000, minDistance: 12, maxDistance: 70,
      minPolarAngle: 0.2, maxPolarAngle: 1.25, azimuthRange: 1.1,
    });
    const { scene, textures } = this.stage;
    scene.background = new THREE.Color(0x020308);
    this.kit = this.stage.own(new ModelKit(textures));
    this.fx = this.stage.own(new EffectsLayer(this.kit.glow, { particleCapacity: input.reduced ? 400 : 1600 }));
    scene.add(this.fx.group);
    this.overlay = this.stage.own(new Overlay(this.stage));

    // Space: nebula sky, a star shell and the painted battle backdrop far below the field.
    scene.add(createNebulaSky(1500, [0x3a1030, 0x0c2a4a]));
    this.starfield = createStarfield(input.reduced ? 1200 : 2400, 1100);
    scene.add(this.starfield);
    const backdrop = createBackdropPlane(textures.get("art/combat.webp"), 640, 358, 0.5);
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.set(0, -150, 20);
    scene.add(backdrop);

    // Light from the upper left, like the painted planets, and a cool fill from below.
    scene.add(new THREE.HemisphereLight(0x8fa4d0, 0x150c18, 0.7));
    const sun = new THREE.DirectionalLight(0xfff1e0, 2.6);
    sun.position.set(-40, 45, -25);
    scene.add(sun);

    scene.add(this.grid());
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.selectRing.visible = false;
    scene.add(this.selectRing);

    this.buildUnits();
    this.backgroundPlanet();

    this.stage.useStudioEnvironment(0.5);
    // Lean the view toward the side with a planet, so it is in frame.
    const planetSide = this.input.units.find((u) => u.kind === "planet")?.side;
    const lean = planetSide === undefined ? 0 : planetSide === 1 ? 2 : -2;
    this.stage.setHome(new THREE.Vector3(lean, 20, 19), new THREE.Vector3(lean, -1.5, 1.2));
    this.stage.onFrame((dt, t) => this.frame(dt, t));
    const el = this.stage.renderer.domElement;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("click", this.onClick);
    this.stage.start();
    // Handy for poking at the scene from the console or a browser test.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__battle = this;
  }

  private grid(): THREE.Group {
    const g = new THREE.Group();
    const pts: number[] = [];
    const x0 = -FIELD_WIDTH / 2;
    const z0 = -FIELD_HEIGHT / 2;
    for (let x = 1; x < FIELD_WIDTH; x++) pts.push(x0 + x, 0, z0, x0 + x, 0, -z0);
    for (let z = 1; z < FIELD_HEIGHT; z++) pts.push(x0, 0, z0 + z, -x0, 0, z0 + z);
    const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5a82dc, transparent: true, opacity: 0.1, depthWrite: false })));
    const border = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
      x0, 0, z0, -x0, 0, z0, -x0, 0, z0, -x0, 0, -z0, -x0, 0, -z0, x0, 0, -z0, x0, 0, -z0, x0, 0, z0,
    ], 3));
    g.add(new THREE.LineSegments(border, new THREE.LineBasicMaterial({ color: 0x7aa2ff, transparent: true, opacity: 0.35, depthWrite: false })));
    // A faint sheen under the field so it reads as a surface from low angles.
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_HEIGHT).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2a55, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    sheen.position.y = -0.01;
    g.add(sheen);
    g.renderOrder = -1;
    return g;
  }

  private buildUnits(): void {
    const { view, units } = this.input;
    units.forEach((info, i) => {
      const color = view.players[info.snap.ownerId]?.color ?? "#999999";
      let model: UnitModel;
      let planetCenter: THREE.Vector3 | null = null;
      switch (info.kind) {
        case "planet": {
          model = buildPlanet(this.kit, info.planetType ?? "terran", PLANET_RADIUS, color);
          // The planet sits just off the battlefield edge, its near side on the unit's square.
          const p = gridToWorld(info.snap.x, info.snap.y);
          const out = Math.sign(p.x || (info.side === 0 ? -1 : 1));
          planetCenter = new THREE.Vector3(p.x + out * (PLANET_RADIUS + 0.2), -1.2, p.z);
          break;
        }
        case "station":
          model = buildStation(this.kit, info.station ?? "starBase", color);
          break;
        case "monster":
          model = buildMonster(this.kit, 0.45 + info.size * 0.7, i);
          break;
        default:
          model = buildShip(this.kit, info.hull, color, info.style);
      }
      this.stage.scene.add(model.root);
      const twoRows = info.snap.maxArmor !== undefined && info.snap.maxStructure !== undefined;
      const width = info.kind === "planet" ? 2 : Math.max(0.8, model.radius * 1.6);
      const bar = new HealthBar(twoRows ? 2 : 1, width, 0.08);
      this.stage.scene.add(bar.group);
      this.units.set(info.snap.key, {
        info, model, bar, color, planetCenter, wreck: false,
        phase: (i * 1.7) % (Math.PI * 2),
        heading: info.side === 1 ? Math.PI : 0,
      });
    });
  }

  /** With no planet in the fight, the system's planet still hangs beside the field as scenery. */
  private backgroundPlanet(): void {
    if (this.input.units.some((u) => u.kind === "planet")) return;
    const { report, view } = this.input;
    const type = starPlanetType(report, view, report.sides[1]);
    if (!type) return;
    const model = buildPlanet(this.kit, type, 6, null);
    model.root.position.set(FIELD_WIDTH / 2 + 9, -6, -6);
    this.stage.scene.add(model.root);
    this.stage.onFrame((_, t) => model.animate(t, this.reduced));
  }

  /** World position of a unit's centre right now (planets: the side facing the field). */
  private anchor(key: string | undefined, k: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!key || !this.frames) return null;
    const u = this.units.get(key);
    const a = this.frames.prev.get(key);
    const b = this.frames.now.get(key);
    if (!u || !a || !b) return null;
    if (u.info.kind === "planet" && u.planetCenter) {
      const p = gridToWorld(b.x, b.y, out);
      return p.setY(0.3);
    }
    const moving = this.event?.kind === "move" && this.event.ship === key;
    const e = moving ? ease(k) : 1;
    gridToWorld(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, out);
    if (u.info.kind === "station") out.y = 0.3;
    return out;
  }

  private radiusOf(key?: string): number {
    const u = key ? this.units.get(key) : undefined;
    if (!u) return 0.5;
    if (u.info.kind === "planet") return 1.2;
    if (u.info.kind === "station") return STATION_RADIUS[u.info.station ?? "starBase"];
    return u.model.radius;
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** Clears effects in flight, e.g. on restart. */
  resetEffects(): void {
    this.fx.clear();
    this.overlay.clear();
  }

  /** Moves the replay to a new position; effects spawn for `event` when it is new. */
  show(frames: Frames, event: CombatEvent | undefined, stepAt: number, fresh: boolean): void {
    this.frames = frames;
    this.event = event;
    this.stepAt = stepAt;
    for (const [key, u] of this.units) {
      const s = frames.now.get(key);
      if (s) u.heading = this.headingOf(u, s);
    }
    if (fresh && event) this.spawn(event);
  }

  private headingOf(u: UnitView, s: UnitState): number {
    return u.info.kind === "ship" || u.info.kind === "monster" ? s.heading : u.heading;
  }

  private spawn(e: CombatEvent): void {
    const n = this.reduced ? 0.35 : 1;
    const count = (c: number) => Math.max(2, Math.round(c * n));
    const src = this.anchor(e.ship, 1);
    const dst = this.anchor(e.target, 1);
    const step = STEP_MS / 1000;
    switch (e.kind) {
      case "fire": {
        if (!src || !dst) break;
        const look = weaponLook(e.weapon);
        const shooter = this.units.get(e.ship);
        const from = src.clone();
        if (shooter && shooter.info.kind !== "planet") {
          const m = shooter.model.muzzle.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -shooter.heading);
          from.add(m.setY(0));
        }
        const r = this.radiusOf(e.target);
        const to = dst.clone();
        if (!e.hit) {
          // Misses pass beside the target and keep going.
          const side = new THREE.Vector3(-(dst.z - from.z), 0, dst.x - from.x).normalize().multiplyScalar(r * 1.6);
          to.add(side).add(dst.clone().sub(from).normalize().multiplyScalar(2));
        } else {
          to.add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(r * 0.6));
        }
        let delay = 0;
        if (look === "missile" || look === "torpedo") {
          delay = step * 1.4;
          this.fx.projectile(from, to, look === "torpedo" ? 0x7ad7ff : 0xffd32a, look === "torpedo" ? 0.7 : 0.45, delay);
        } else {
          const color = BEAM_COLORS[e.weapon ?? ""] ?? (look === "spores" ? 0x7dff7a : 0xff4a5a);
          this.fx.beam(from, to, color, 0.07, step * 2.2, e.hit ? 1 : 0.45);
          this.fx.flash(from, 0.8, color, 0.18);
        }
        if (!e.hit) break;
        const absorbed = e.absorbed ?? 0;
        const damage = e.damage ?? 0;
        const target = this.units.get(e.target!);
        if (absorbed > 0 || damage === 0) {
          this.fx.shield(dst, r * 1.35, absorbed > 0 ? Math.min(1, absorbed / Math.max(1, damage + absorbed)) : 1, delay);
          if (absorbed > 0) this.overlay.float(dst.clone().setY(dst.y + 1.1), `${absorbed} absorbed`, "#8fe3ff", delay, 0.9);
        }
        if (damage > 0) {
          const structural = (e.structureDamage ?? 0) > 0 || (target?.info.snap.maxArmor === undefined && damage > (target?.info.snap.maxHits ?? 1) * 0.25);
          this.fx.burst(to, {
            count: count(structural ? 22 : 12), colors: structural ? FIRE : SPARK, speed: structural ? 3.2 : 2.4,
            life: [0.25, 0.7], size: [0.14, 0.32], delay,
          });
          this.fx.flash(to, structural ? 1.4 : 0.9, structural ? 0xff8a4a : 0xffe0a0, 0.25, delay);
          this.overlay.float(dst.clone().setY(dst.y + 0.4), `-${damage}`, structural ? "#ff9a7a" : "#ffd0a0", delay);
        }
        if (typeof e.systemHit === "string" && e.systemHit) {
          this.fx.burst(to, { count: count(12), colors: ["#9ad0ff", "#ffffff", "#5a8cff"], speed: 3.5, life: [0.15, 0.45], size: [0.05, 0.12], delay });
          this.overlay.float(dst.clone().setY(dst.y + 1), `${systemName(e.systemHit)} hit`, "#9ad0ff", delay + 0.1, 1.4);
        }
        break;
      }
      case "destroyed": {
        if (!src) break;
        const r = this.radiusOf(e.ship);
        // A slow, swelling fireball, a fast spray of burning fragments and a white-hot flash.
        this.fx.burst(src, { count: count(36), colors: FIRE, speed: 0.6 + r * 0.8, life: [0.6, 1.3], size: [0.6 + r * 0.4, 1.2 + r * 0.8], drag: 0.3 });
        this.fx.burst(src, { count: count(90), colors: FIRE, speed: 3 + r * 3, life: [0.4, 1.3], size: [0.16, 0.42], drag: 0.2 });
        this.fx.burst(src, { count: count(30), colors: ["#ffffff", "#fff4c2"], speed: 6, life: [0.15, 0.4], size: [0.1, 0.2] });
        this.fx.flash(src, 5 + r * 4, 0xfff0c8, 0.6);
        this.fx.shockwave(src.clone().setY(0.05), 2.4 + r * 2, 0xff9a50, 0.8);
        this.fx.lightFlash(src, 25);
        this.fx.scatter(src, this.reduced ? 3 : 8, 0.07 + r * 0.05, 2 + r);
        if (!this.reduced) this.stage.shake(0.25 + r * 0.25);
        break;
      }
      case "retreat": {
        if (!src) break;
        const u = this.units.get(e.ship);
        this.fx.flash(src, 1.6, u?.color ?? 0xffffff, 0.4, step * 0.8);
        break;
      }
      case "launch": {
        if (!src) break;
        const u = this.units.get(e.ship);
        this.fx.shockwave(src.clone().setY(0.1), 1.5, u?.color ?? 0x9ad0ff, 0.5);
        this.fx.burst(src, { count: count(10), colors: ["#ffffff", u?.color ?? "#9ad0ff"], speed: 2, life: [0.3, 0.6], size: [0.06, 0.12], flatten: 0.2 });
        break;
      }
      case "board": {
        if (!src || !dst) break;
        this.fx.beam(src, dst, 0xffd23f, 0.03, step * 3, 0.6);
        this.overlay.float(dst.clone().setY(dst.y + 0.8), "Boarded", "#ffd23f", 0, 1.2);
        break;
      }
      case "repair": {
        if (!src) break;
        this.fx.burst(src, { count: count(16), colors: ["#7dffb0", "#c8ffe0"], speed: 0.8, life: [0.5, 1], size: [0.06, 0.12], drift: new THREE.Vector3(0, 1.2, 0) });
        if (e.damage) this.overlay.float(src.clone().setY(src.y + 0.5), `+${e.damage}`, "#7dffb0");
        break;
      }
    }
  }

  private frame(dt: number, t: number): void {
    const k = this.reduced ? 1 : Math.min(1, (performance.now() - this.stepAt) / STEP_MS);
    const frames = this.frames;
    const ev = this.event;
    const mat = this.starfield.material as THREE.ShaderMaterial;
    mat.uniforms.uTime!.value = t;
    mat.uniforms.uTwinkle!.value = this.reduced ? 0 : 1;
    this.fx.setParticleScale(this.stage.viewportHeight, this.stage.camera.fov);

    for (const [key, u] of this.units) {
      const now = frames?.now.get(key);
      const prev = frames?.prev.get(key);
      const { model, bar, info } = u;
      if (!now || !prev) { model.root.visible = false; bar.group.visible = false; continue; }
      const retreating = ev?.kind === "retreat" && ev.ship === key;
      const dying = ev?.kind === "destroyed" && ev.ship === key && k < 1;
      const visible = !now.gone || (retreating && k < 1);
      model.root.visible = visible;
      bar.group.visible = visible && now.alive && !now.gone && !(retreating && k > 0);
      if (!visible) continue;

      const pos = this.anchor(key, k, new THREE.Vector3())!;
      if (u.planetCenter) model.root.position.copy(u.planetCenter);
      else {
        model.root.position.copy(pos);
        if (retreating) {
          // Jump away toward its own edge of the battlefield.
          const away = info.side === 0 ? -1 : 1;
          model.root.position.x += away * ease(k) * ease(k) * 8;
        }
        const bob = this.reduced || !now.alive ? 0 : Math.sin(t * 1.3 + u.phase) * 0.05;
        model.body.position.y = bob;
      }

      // Turn smoothly toward the heading: on a move, during the glide; otherwise hold it.
      if (info.kind === "ship" || info.kind === "monster") {
        const target = retreating ? (info.side === 0 ? Math.PI : 0) : now.heading;
        const from = ev?.kind === "move" && ev.ship === key ? prev.heading : target;
        const h = lerpAngle(from, target, retreating ? Math.min(1, k * 3) : ease(k));
        model.root.rotation.y = -h;
        // Bank a little into turns.
        model.body.rotation.x = this.reduced ? 0 : -angleDiff(from, target) * 0.25 * Math.sin(Math.PI * k);
      }
      model.animate(t, this.reduced || !now.alive);

      // Fading: retreat warps out, a kill fades to a dark drifting wreck.
      // A planet whose defences fall stays where it is.
      let opacity = 1;
      if (info.kind === "planet") opacity = 1;
      else if (retreating) opacity = 1 - k;
      else if (dying) opacity = 1 - k * 0.75;
      else if (!now.alive) opacity = 0.25;
      this.setOpacity(u, opacity, !now.alive && !dying && info.kind !== "planet");
      const flicker = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 30 + u.phase * 5);
      for (const e of model.engines) e.visible = now.alive;
      if (info.kind === "ship") for (const e of model.engines) e.material.opacity = 0.9 * flicker * opacity;

      // Health bars above the model.
      const top = u.planetCenter ? pos.clone().setY(2.6) : model.root.position.clone().setY(model.root.position.y + model.height + 0.45);
      bar.group.position.copy(top);
      const s = info.snap;
      if (s.maxArmor !== undefined && s.maxStructure !== undefined && now.armor !== null && now.structure !== null) {
        bar.set([
          { value: s.maxArmor > 0 ? now.armor / s.maxArmor : 0, color: 0x9ab8ff },
          { value: s.maxStructure > 0 ? now.structure / s.maxStructure : 0, color: healthColor(now.structure / Math.max(1, s.maxStructure)) },
        ]);
      } else {
        const frac = Math.max(0, now.hits / s.maxHits);
        bar.set([{ value: frac, color: healthColor(frac) }]);
      }
    }

    this.updatePointer();
    this.fx.update(dt);
    this.overlay.update(dt);
  }

  private setOpacity(u: UnitView, opacity: number, wreck: boolean): void {
    const transparent = opacity < 0.999;
    for (const m of u.model.materials) {
      if (m.blending === THREE.AdditiveBlending) continue;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
      m.depthWrite = !transparent;
    }
    if (wreck !== u.wreck) {
      u.wreck = wreck;
      for (const m of u.model.materials) {
        if (m instanceof THREE.MeshBasicMaterial && m.blending !== THREE.AdditiveBlending) {
          m.color.multiplyScalar(wreck ? 0.25 : 4);
        }
      }
    }
  }

  private onPointerMove = (ev: PointerEvent) => {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
  };

  private onClick = () => {
    this.selected = this.hovered === this.selected ? null : this.hovered;
  };

  /** The unit nearest the pointer ray, if the ray passes close enough. */
  private pick(): string | null {
    if (!this.pointerInside || !this.frames) return null;
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    let best: string | null = null;
    let bestD = Infinity;
    for (const [key, u] of this.units) {
      const s = this.frames.now.get(key);
      if (!s || s.gone || !u.model.root.visible) continue;
      const p = u.planetCenter ?? u.model.root.position;
      const r = u.planetCenter ? PLANET_RADIUS : Math.max(0.5, this.radiusOf(key));
      const d = this.raycaster.ray.distanceSqToPoint(p);
      if (d < r * r && d < bestD) {
        bestD = d;
        best = key;
      }
    }
    return best;
  }

  private updatePointer(): void {
    this.hovered = this.pick();
    this.stage.renderer.domElement.style.cursor = this.hovered ? "pointer" : "";
    const key = this.hovered ?? this.selected;
    const u = key ? this.units.get(key) : undefined;
    const s = key ? this.frames?.now.get(key) : undefined;
    if (!u || !s || s.gone) {
      this.overlay.setLabel(null);
      this.selectRing.visible = false;
      return;
    }
    const at = u.planetCenter ? u.planetCenter.clone().setY(u.planetCenter.y + PLANET_RADIUS + 0.6) : u.model.root.position.clone().setY(u.model.root.position.y + u.model.height + 0.75);
    this.overlay.setLabel(at, labelHtml(u, s, this.input.view));
    const ringAt = u.planetCenter ?? u.model.root.position;
    this.selectRing.visible = !u.planetCenter;
    this.selectRing.position.set(ringAt.x, 0.02, ringAt.z);
    this.selectRing.scale.setScalar(Math.max(0.6, this.radiusOf(key!) * 1.3));
    (this.selectRing.material as THREE.MeshBasicMaterial).color.set(u.color);
  }

  dispose(): void {
    const el = this.stage.renderer.domElement;
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("click", this.onClick);
    for (const u of this.units.values()) {
      disposeModel(u.model);
      u.bar.dispose();
    }
    this.units.clear();
    this.stage.dispose();
  }
}

const ease = (k: number) => 1 - Math.pow(1 - k, 3);

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const lerpAngle = (a: number, b: number, k: number) => a + angleDiff(a, b) * k;

const KIND_NAMES: Record<string, string> = {
  frigate: "Frigate", destroyer: "Destroyer", cruiser: "Cruiser", battleship: "Battleship", titan: "Titan", doomStar: "Doom Star",
  starBase: "Star Base", battlestation: "Battlestation", starFortress: "Star Fortress",
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function labelHtml(u: UnitView, s: UnitState, view: PlayerView): string {
  const owner = view.players[u.info.snap.ownerId]?.name ?? "Unknown";
  const what = u.info.kind === "planet" ? "Planet" : u.info.kind === "monster" ? "Monster"
    : u.info.kind === "station" ? KIND_NAMES[u.info.station ?? "starBase"] : KIND_NAMES[u.info.hull];
  const hp = s.alive ? `${Math.max(0, Math.round(s.hits))} / ${u.info.snap.maxHits}` : "destroyed";
  return `<b style="color:${escapeHtml(u.color)}">${escapeHtml(u.info.snap.name)}</b><span>${escapeHtml(what ?? "")} · ${escapeHtml(owner)}</span><span>${hp}</span>`;
}
