import * as THREE from "three";
import type { PlanetSize } from "@starlord/sim";
import { Stage } from "../stage";
import { createBackdropPlane, createNebulaSky, createStarfield, seeded } from "../backdrop";
import { LabelLayer } from "../labels";
import { ModelKit, type UnitModel } from "../models/kit";
import { buildPlanet } from "../models/planet";
import { buildStar } from "../models/star";
import { buildStation, STATION_RADIUS } from "../models/stations";
import { buildShip, SHIP_LENGTH } from "../models/ships";
import { buildMonster } from "../models/monster";
import { buildAsteroidBelt, buildPlanetRings, type AsteroidBelt } from "../models/belt";
import type { SystemFleet, SystemModel, SystemPlanet } from "./systemModel";
import { additive } from "../../ui/touch";
import { ColonizeFx } from "./colonizeFx";

/**
 * One star system in 3D: the star in the middle lighting everything, planets
 * on their orbits (asteroid fields as rock belts, gas giants with rings),
 * colonies wearing their owner's colours, orbital stations, and the fleets
 * parked at the system's edge. Click a planet or fleet to pick it; the camera
 * glides over to follow it. Built from a `SystemModel`, so any screen can show it.
 */

export type SystemPick = { kind: "planet"; id: string } | { kind: "fleet"; id: string } | { kind: "star" };

export interface SystemSceneOptions {
  reduced: boolean;
  /** `additive` is true on a shift-click. */
  onPick?: (pick: SystemPick | null, additive: boolean) => void;
}

export const STAR_RADIUS = 2.4;
const PLANET_RADIUS: Record<PlanetSize, number> = { tiny: 0.5, small: 0.66, medium: 0.86, large: 1.06, huge: 1.28 };
const GAS_GIANT_RADIUS = 1.7;
/** Fleets wait this far outside the outermost orbit. */
const FLEET_MARGIN = 4.5;

/** Orbit slot (1..5) to distance from the star. */
export const orbitRadius = (orbit: number) => 6.5 + (orbit - 1) * 3.8;

const pickKey = (p: SystemPick) => (p.kind === "star" ? "star" : `${p.kind}:${p.id}`);

interface Body {
  pick: SystemPick;
  /** The thing that moves; labels and the camera follow it. */
  anchor: THREE.Object3D;
  /** Invisible sphere the pointer hits. */
  hit: THREE.Mesh;
  radius: number;
  /** Angle on its orbit now, and how fast it travels, radians per second. */
  angle: number;
  speed: number;
  orbit: number;
  models: UnitModel[];
  belt?: AsteroidBelt;
  /** Orbiting station, circling the planet. */
  station?: { model: UnitModel; distance: number; angle: number };
}

export class SystemScene {
  readonly stage: Stage;
  private kit: ModelKit;
  private labels: LabelLayer;
  private content = new THREE.Group();
  private bodies = new Map<string, Body>();
  private starModel: UnitModel | null = null;
  private starLight: THREE.PointLight;
  private ownGeometries: THREE.BufferGeometry[] = [];
  private selectRing: THREE.Sprite;
  private hoverKey: string | null = null;
  private selectedKey: string | null = null;
  private follow: THREE.Object3D | null = null;
  private followPrev = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt: { x: number; y: number } | null = null;
  private reduced: boolean;
  private time = 0;
  private sky: THREE.Mesh;
  private starfield: THREE.Points;
  private model!: SystemModel;
  /** Planets whose colonization is playing; drawn unsettled until the ship lands. */
  private landing = new Set<string>();
  private fx: { effect: ColonizeFx; planetId: string; onDone?: () => void } | null = null;

  constructor(container: HTMLElement, model: SystemModel, private opts: SystemSceneOptions) {
    this.reduced = opts.reduced;
    this.stage = new Stage(container, {
      fov: 40, far: 3000, minDistance: 4, maxDistance: 90,
      minPolarAngle: 0.15, maxPolarAngle: 1.45,
    });
    const { scene, textures } = this.stage;
    scene.background = new THREE.Color(0x020308);
    this.kit = this.stage.own(new ModelKit(textures));
    this.labels = this.stage.own(new LabelLayer(this.stage));

    this.sky = createNebulaSky(1400, [0x1a1040, 0x0c2a4a], 5);
    scene.add(this.sky);
    this.starfield = createStarfield(opts.reduced ? 1200 : 2600, 1000, 9);
    scene.add(this.starfield);
    const backdrop = createBackdropPlane(textures.get("art/galaxy.webp"), 900, 504, 0.35);
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.set(0, -260, 0);
    scene.add(backdrop);

    // The star lights the system; a faint fill keeps night sides from going pitch black.
    this.starLight = new THREE.PointLight(0xffffff, 3.2, 0, 0);
    scene.add(this.starLight);
    scene.add(new THREE.HemisphereLight(0x6f86c0, 0x0a0812, 0.35));
    scene.add(this.content);

    this.selectRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.stage.textures.adopt("selectRing", ringTexture),
      color: 0x9fd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.selectRing.visible = false;
    scene.add(this.selectRing);

    this.setModel(model);
    this.stage.useStudioEnvironment(0.35);

    const el = this.stage.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("dblclick", this.onDoubleClick);
    this.stage.onFrame((dt) => this.frame(dt));
    this.stage.start();
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__system = this;
  }

  /** Rebuilds the system's contents, keeping the camera and the selection where possible. */
  setModel(model: SystemModel): void {
    this.model = model;
    const followKey = this.follow ? this.selectedKey : null;
    this.clearContent();
    const rand = seeded(hash(model.starId));
    const blackHole = model.starClass === "blackHole";

    (this.sky.material as THREE.ShaderMaterial).uniforms.uA!.value.set(model.nebula ? 0x5a1a6a : 0x1a1040);
    (this.sky.material as THREE.ShaderMaterial).uniforms.uB!.value.set(model.nebula ? 0x2a5a8a : 0x0c2a4a);
    this.starLight.color.set(model.color).lerp(new THREE.Color(0xffffff), 0.6);
    this.starLight.intensity = blackHole ? 1.2 : 3.2;

    // The star.
    this.starModel = buildStar(this.kit, model.color, STAR_RADIUS, blackHole);
    this.content.add(this.starModel.root);
    this.addBody({ kind: "star" }, this.starModel.root, STAR_RADIUS, 0, 0, 0, [this.starModel]);
    this.labels.set("star", this.starModel.root, `<b>${esc(model.name)}</b><span>${blackHole ? "black hole" : `${model.starClass} star`}</span>`, STAR_RADIUS * 1.25, "three-tag star");

    // Orbits and planets; a planet being colonized right now still looks empty until the ship lands.
    for (const shown of model.planets) {
      const p = this.landing.has(shown.id) ? { ...shown, colony: null, settle: null } : shown;
      const r = orbitRadius(p.orbit);
      const owned = p.colony?.color ?? null;
      this.content.add(this.orbitLine(r, owned));
      // Inner planets travel faster, as orbits should.
      const speed = 0.9 / Math.pow(r, 1.5);
      const angle = rand() * Math.PI * 2;
      if (p.type === "asteroids") {
        const belt = buildAsteroidBelt(this.kit, r, 0.9, this.reduced ? 160 : 320, hash(p.id));
        this.content.add(belt.mesh);
        // The belt's anchor marks a spot on it for the label and the camera.
        const anchor = new THREE.Object3D();
        this.content.add(anchor);
        const body = this.addBody({ kind: "planet", id: p.id }, anchor, 1.1, r, angle, speed, []);
        body.belt = belt;
      } else {
        const radius = p.type === "gasGiant" ? GAS_GIANT_RADIUS : PLANET_RADIUS[p.size];
        const planet = buildPlanet(this.kit, p.type, radius, owned);
        if (p.type === "gasGiant") {
          const rings = buildPlanetRings(this.kit, radius, 0xd8c0a0, hash(p.id));
          rings.rotation.x = -Math.PI / 2 + 0.35;
          planet.body.add(rings);
        }
        this.content.add(planet.root);
        const body = this.addBody({ kind: "planet", id: p.id }, planet.root, radius, r, angle, speed, [planet]);
        if (p.colony?.station) {
          const station = buildStation(this.kit, p.colony.station, p.colony.color);
          const scale = 0.42 / STATION_RADIUS.starBase;
          station.root.scale.setScalar(scale);
          this.content.add(station.root);
          body.station = { model: station, distance: radius + 1.0, angle: rand() * Math.PI * 2 };
          body.models.push(station);
        }
      }
      this.labels.set(`planet:${p.id}`, this.bodies.get(`planet:${p.id}`)!.anchor, planetTag(p), this.bodies.get(`planet:${p.id}`)!.radius + 0.35, `three-tag${p.colony ? " owned" : ""}${p.settle && !p.settle.blocked ? " settle" : ""}`)
        .style.setProperty("--tag-color", p.colony?.color ?? "");
    }

    // Fleets wait at the edge of the system, spread along the near arc.
    const outer = orbitRadius(Math.max(2, ...model.planets.map((p) => p.orbit)));
    const fleetRing = outer + FLEET_MARGIN;
    model.fleets.forEach((f, i) => {
      const n = model.fleets.length;
      const angle = Math.PI * 0.5 + (i - (n - 1) / 2) * Math.min(0.32, 1.6 / Math.max(1, n));
      const group = new THREE.Group();
      const models = this.fleetModels(f, i);
      for (const m of models) group.add(m.root);
      group.position.set(Math.cos(angle) * fleetRing, 0.6, Math.sin(angle) * fleetRing);
      // Bows toward the star.
      group.rotation.y = Math.PI - angle;
      this.content.add(group);
      this.addBody({ kind: "fleet", id: f.id }, group, 1.8, 0, 0, 0, models);
      this.labels.set(`fleet:${f.id}`, group, fleetTag(f), 1.4, `three-tag fleet${f.mine ? " mine" : ""}`)
        .style.setProperty("--tag-color", f.color);
    });

    if (!model.explored) {
      this.labels.set("unexplored", this.starModel.root, "Unexplored: send a ship to chart this system", -STAR_RADIUS * 2.2, "three-tag note");
    }

    // Keep the selection if it still exists.
    if (this.selectedKey && !this.bodies.has(this.selectedKey)) this.selectedKey = null;
    this.select(this.selectedKey ? this.bodies.get(this.selectedKey)!.pick : null, false);
    this.place(this.time);
    // Keep riding along with the body the camera was following.
    if (followKey && this.bodies.has(followKey)) {
      this.follow = this.bodies.get(followKey)!.anchor;
      this.follow.getWorldPosition(this.followPrev);
    }
    // Frame the whole system: everything out to the fleets fits in view.
    const reach = (model.fleets.length ? fleetRing + 1.5 : outer + 1.5);
    if (reach !== this.reach) {
      this.reach = reach;
      const dist = reach * 2.35;
      this.stage.controls.maxDistance = Math.max(90, dist * 1.6);
      this.stage.setHome(new THREE.Vector3(0, dist * 0.62, dist * 0.78), new THREE.Vector3(0, 0, reach * 0.12));
    }
  }

  private reach = 0;

  /** Highlights a body and has the camera follow it; null returns to the whole system. */
  select(pick: SystemPick | null, glide = true, distance?: number): void {
    // Already showing it (the scene picked it itself and the screen echoes the pick back).
    if (glide && (pick ? pickKey(pick) : null) === this.selectedKey && (this.follow || !pick)) return;
    if (this.selectedKey) this.labels.mark(this.selectedKey, "selected", false);
    const body = pick ? this.bodies.get(pickKey(pick)) : undefined;
    this.selectedKey = body ? pickKey(body.pick) : null;
    if (!body) {
      this.selectRing.visible = false;
      if (glide && this.follow) this.stage.resetCamera();
      this.follow = null;
      this.glide = null;
      return;
    }
    this.labels.mark(this.selectedKey!, "selected", true);
    this.selectRing.visible = body.pick.kind !== "star";
    this.selectRing.scale.setScalar(body.radius * 3.2);
    if (!glide) return;
    this.follow = body.anchor;
    body.anchor.getWorldPosition(this.followPrev);
    // Glide in: move the orbit target to the body and pull the camera in to a sensible distance.
    const startDist = this.stage.camera.position.distanceTo(this.stage.controls.target);
    this.glide = { t: 0, from: this.stage.controls.target.clone(), startDist, dist: distance ?? Math.min(startDist, Math.max(5, body.radius * 9)) };
  }

  /** Whether the colonization cutscene is playing. */
  get playing(): boolean {
    return this.fx !== null;
  }

  /**
   * Plays the colony ship flying from its fleet to `planetId` and founding the colony. Call it
   * before the model shows the new colony: the planet is drawn unsettled until the ship lands.
   */
  playColonize(planetId: string, fleetId: string, color: string, onDone?: () => void): void {
    this.skip();
    const key = `planet:${planetId}`;
    const body = this.bodies.get(key);
    if (!body || this.reduced) {
      onDone?.();
      return;
    }
    const from = new THREE.Vector3();
    const fleet = this.bodies.get(`fleet:${fleetId}`);
    if (fleet) fleet.anchor.getWorldPosition(from);
    else from.set(0, 0.6, orbitRadius(5) + FLEET_MARGIN);
    this.landing.add(planetId);
    const target = {
      radius: body.radius,
      position: (out: THREE.Vector3) => {
        // Look the body up each frame: the scene may rebuild while the ship is under way.
        const b = this.bodies.get(key);
        return b ? b.anchor.getWorldPosition(out) : out;
      },
    };
    const effect = new ColonizeFx(this.kit, target, from, color, this.stage.textures.adopt("shockRing", shockTexture));
    this.stage.scene.add(effect.group);
    this.fx = { effect, planetId, onDone };
    // Watch it happen: glide to the planet and follow it.
    // Pull back far enough to see the ship come in.
    this.selectedKey = null;
    this.select(body.pick, true, 16);
    this.selectRing.visible = false;
  }

  /** Finishes the cutscene at once. */
  skip(): void {
    const fx = this.fx;
    if (!fx) return;
    this.fx = null;
    fx.effect.dispose();
    this.landing.delete(fx.planetId);
    if (this.model) this.setModel(this.model);
    fx.onDone?.();
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  private glide: { t: number; from: THREE.Vector3; startDist: number; dist: number } | null = null;

  private addBody(pick: SystemPick, anchor: THREE.Object3D, radius: number, orbit: number, angle: number, speed: number, models: UnitModel[]): Body {
    const hit = new THREE.Mesh(
      this.kit.geo("system:hit", () => new THREE.SphereGeometry(1, 12, 8)),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.scale.setScalar(Math.max(radius * 1.4, 0.9));
    hit.userData.pickKey = pickKey(pick);
    anchor.add(hit);
    // Fleets scale their group, so keep the hit sphere in world terms there.
    const body: Body = { pick, anchor, hit, radius, angle, speed, orbit, models };
    this.bodies.set(pickKey(pick), body);
    return body;
  }

  private fleetModels(f: SystemFleet, i: number): UnitModel[] {
    if (f.kind === "monsters") {
      const m = buildMonster(this.kit, 2, hash(f.id) % 7);
      return [m];
    }
    const cls = f.hull ?? "destroyer";
    const count = Math.min(3, Math.max(1, f.ships));
    const scale = 1.5 / Math.max(1, SHIP_LENGTH[cls]);
    const out: UnitModel[] = [];
    for (let k = 0; k < count; k++) {
      const m = buildShip(this.kit, cls, f.color, f.style);
      m.root.scale.setScalar(scale * (k === 0 ? 1.1 : 0.85));
      // A small wedge: leader in front, wingmen behind and to the sides.
      const side = k === 0 ? 0 : k === 1 ? -1 : 1;
      m.root.position.set(k === 0 ? 0 : -1.1, k === 0 ? 0 : 0.15 * side, side * 0.95);
      // Ships are modelled nose along +X; the group turns them toward the star.
      m.root.rotation.y = Math.PI / 2;
      m.root.userData.phase = i * 1.7 + k;
      out.push(m);
    }
    return out;
  }

  private orbitLine(r: number, owner: string | null): THREE.LineLoop {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.ownGeometries.push(geo);
    const mat = new THREE.LineBasicMaterial({
      color: owner ?? 0x5a82dc, transparent: true, opacity: owner ? 0.4 : 0.18, depthWrite: false,
    });
    return new THREE.LineLoop(geo, mat);
  }

  /** Puts every body where it is at `time`. */
  private place(time: number): void {
    for (const b of this.bodies.values()) {
      if (b.pick.kind === "planet") {
        const a = b.angle + time * b.speed;
        b.anchor.position.set(Math.cos(a) * b.orbit, 0, Math.sin(a) * b.orbit);
        if (b.station) {
          const sa = b.station.angle + time * 0.35;
          b.station.model.root.position.set(
            b.anchor.position.x + Math.cos(sa) * b.station.distance,
            0.25,
            b.anchor.position.z + Math.sin(sa) * b.station.distance,
          );
        }
      }
    }
  }

  private frame(dt: number): void {
    const still = this.reduced;
    if (!still) this.time += dt;
    const t = this.time;
    this.place(t);
    for (const b of this.bodies.values()) {
      for (const m of b.models) {
        m.animate(t, still);
        if (b.pick.kind === "fleet") m.body.position.y = still ? 0 : Math.sin(t * 1.2 + (m.root.userData.phase ?? 0)) * 0.06;
      }
      b.belt?.animate(t, still);
    }

    // The camera rides along with whatever it follows.
    if (this.follow) {
      const now = this.follow.getWorldPosition(new THREE.Vector3());
      if (this.glide) {
        this.glide.t = Math.min(1, this.glide.t + dt * (still ? 10 : 1.6));
        const k = 1 - Math.pow(1 - this.glide.t, 3);
        const target = this.glide.from.clone().lerp(now, k);
        const offset = this.stage.camera.position.clone().sub(this.stage.controls.target);
        offset.setLength(THREE.MathUtils.lerp(this.glide.startDist, this.glide.dist, k));
        this.stage.controls.target.copy(target);
        this.stage.camera.position.copy(target).add(offset);
        if (this.glide.t >= 1) this.glide = null;
      } else {
        const delta = now.clone().sub(this.followPrev);
        this.stage.controls.target.add(delta);
        this.stage.camera.position.add(delta);
      }
      this.followPrev.copy(now);
    }

    const sel = this.selectedKey ? this.bodies.get(this.selectedKey) : undefined;
    if (this.fx) this.selectRing.visible = false;
    else if (sel && !this.selectRing.visible && sel.pick.kind !== "star") this.selectRing.visible = true;
    if (sel && this.selectRing.visible) {
      sel.anchor.getWorldPosition(this.selectRing.position);
      (this.selectRing.material as THREE.SpriteMaterial).rotation = still ? 0 : t * 0.4;
    }
    if (this.fx && this.fx.effect.update(dt, t, this.stage.camera)) this.skip();
    (this.starfield.material as THREE.ShaderMaterial).uniforms.uTime!.value = t;
    (this.starfield.material as THREE.ShaderMaterial).uniforms.uTwinkle!.value = still ? 0 : 1;
    this.labels.update();
  }

  private pickAt(e: PointerEvent): Body | undefined {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const hits = this.raycaster.intersectObjects([...this.bodies.values()].map((b) => b.hit), false);
    // Prefer a planet or fleet over the star behind it.
    const hit = hits.find((h) => h.object.userData.pickKey !== "star") ?? hits[0];
    return hit ? this.bodies.get(hit.object.userData.pickKey as string) : undefined;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    const key = this.pickAt(e) ? pickKey(this.pickAt(e)!.pick) : null;
    if (key === this.hoverKey) return;
    if (this.hoverKey) this.labels.mark(this.hoverKey, "hover", false);
    this.hoverKey = key;
    if (key) this.labels.mark(key, "hover", true);
    this.stage.renderer.domElement.style.cursor = key ? "pointer" : "";
  };

  private onPointerLeave = () => {
    if (this.hoverKey) this.labels.mark(this.hoverKey, "hover", false);
    this.hoverKey = null;
  };

  private onPointerUp = (e: PointerEvent) => {
    const down = this.downAt;
    this.downAt = null;
    // A drag orbits the camera; only a still click picks.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    // A click during the cutscene skips it.
    if (this.fx) {
      this.skip();
      return;
    }
    const body = this.pickAt(e);
    const pick = body?.pick ?? null;
    this.select(pick);
    this.opts.onPick?.(pick, additive(e));
  };

  private onDoubleClick = () => {
    // The stage already returns the camera home; stop following too.
    this.follow = null;
    this.glide = null;
  };

  private clearContent(): void {
    this.labels.clear();
    this.content.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.content.clear();
    for (const g of this.ownGeometries) g.dispose();
    this.ownGeometries = [];
    this.bodies.clear();
    this.starModel = null;
    this.follow = null;
  }

  dispose(): void {
    const el = this.stage.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("dblclick", this.onDoubleClick);
    if (this.fx) {
      this.fx.effect.dispose();
      this.fx = null;
    }
    this.clearContent();
    this.glide = null;
    this.stage.dispose();
  }
}

function planetTag(p: SystemPlanet): string {
  const kind = p.type === "asteroids" ? "Asteroids" : p.type === "gasGiant" ? "Gas giant" : `${cap(p.size)} ${words(p.type)}`;
  if (!p.colony) {
    const settle = p.settle && !p.settle.blocked ? `<em>✚ ${p.settle.outpost ? "Outpost" : "Colonize"}</em>` : "";
    return `<b>${kind}</b>${settle}`;
  }
  const what = p.colony.outpost ? "outpost" : `pop ${p.colony.population}`;
  const station = p.colony.station ? ` · ${words(p.colony.station)}` : "";
  return `<b>${esc(p.colony.name)}</b><span>${kind} · ${what}${station}</span>`;
}

function fleetTag(f: SystemFleet): string {
  const ships = `${f.ships} ship${f.ships === 1 ? "" : "s"}`;
  return `<b>${esc(f.name)}</b><span>${ships}${f.leaving ? " · leaving" : ""}</span>`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483646 + 1;
}

/** A soft, solid ring that fades inward, for shockwaves. */
function shockTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(255,255,255,0.05)");
  g.addColorStop(0.86, "rgba(255,255,255,0.9)");
  g.addColorStop(0.94, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A thin bright ring with soft edges, for the selection marker. */
function ringTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "white";
  ctx.shadowBlur = 8;
  ctx.setLineDash([18, 8]);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
