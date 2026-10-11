import * as THREE from "three";
import { accentColor, glowSpriteMaterial } from "../materials";
import { disposeModel, type ModelKit, type UnitModel } from "../models/kit";
import { buildShip } from "../models/ships";
import { seeded } from "../backdrop";

/**
 * The colonization cutscene: the colony ship leaves its fleet, arcs across the
 * system to the planet, sinks to the surface, and the new colony flashes into
 * being with a shockwave and city lights in the owner's colour. The planet
 * keeps moving along its orbit, so the effect asks for its position each frame.
 */

/** Seconds per phase. */
const FLY = 2.4;
const LAND = 0.8;
const BLOOM = 1.6;
export const COLONIZE_SECONDS = FLY + LAND + BLOOM;

export interface ColonizeTarget {
  /** Planet centre in world space, now. */
  position(out: THREE.Vector3): THREE.Vector3;
  radius: number;
}

export class ColonizeFx {
  readonly group = new THREE.Group();
  private t = 0;
  private ship: UnitModel;
  private engine: THREE.Sprite;
  private flash: THREE.Sprite;
  private wave: THREE.Sprite;
  private lights = new THREE.Group();
  private lightsMat: THREE.SpriteMaterial;
  private owned: { dispose(): void }[] = [];
  private from: THREE.Vector3;
  private planet = new THREE.Vector3();
  private prev = new THREE.Vector3();
  /** Where on the planet the ship touches down, as a direction from its centre. */
  private landDir: THREE.Vector3;
  done = false;

  constructor(k: ModelKit, private target: ColonizeTarget, from: THREE.Vector3, color: THREE.ColorRepresentation, ringMap: THREE.Texture) {
    this.from = from.clone();
    const tint = accentColor(color);
    this.ship = buildShip(k, "cruiser", color);
    this.ship.root.scale.setScalar(0.75);
    this.group.add(this.ship.root);
    this.engine = new THREE.Sprite(glowSpriteMaterial(k.glow, tint.clone().lerp(new THREE.Color(0xffffff), 0.5), 0.95));
    this.engine.scale.setScalar(0.9);
    this.group.add(this.engine);

    this.flash = new THREE.Sprite(glowSpriteMaterial(k.glow, 0xffffff, 0));
    this.group.add(this.flash);
    const waveMat = new THREE.SpriteMaterial({ map: ringMap, color: tint, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.wave = new THREE.Sprite(waveMat);
    this.group.add(this.wave);

    // City lights scattered over the side facing the landing point.
    target.position(this.planet);
    this.landDir = this.from.clone().sub(this.planet).setY(0).normalize().add(new THREE.Vector3(0, 0.55, 0)).normalize();
    const rand = seeded(Math.abs(Math.floor(from.x * 1000 + from.z * 7)) || 3);
    // Glow sprites rather than points: they read at any zoom and blend like the engine glow.
    this.lightsMat = glowSpriteMaterial(k.glow, tint.clone().lerp(new THREE.Color(0xffffff), 0.7), 0);
    // Glows sit on the surface, where the planet's own depth would clip them; lights on the far
    // side are hidden by hand instead (see update).
    this.lightsMat.depthTest = false;
    this.flash.material.depthTest = false;
    this.flash.renderOrder = this.lights.renderOrder = 5;
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      // Cluster around the landing site.
      d.lerp(this.landDir, 0.45 + rand() * 0.3).normalize().multiplyScalar(target.radius * 1.02);
      const dot = new THREE.Sprite(this.lightsMat);
      dot.position.copy(d);
      dot.scale.setScalar(target.radius * (0.18 + rand() * 0.2));
      this.lights.add(dot);
    }
    this.group.add(this.lights);
    this.owned.push(this.lightsMat, waveMat, this.engine.material, this.flash.material);
    this.prev.copy(this.from);
  }

  /** Advances the effect; returns true once it has finished. */
  update(dt: number, time: number, camera?: THREE.Camera): boolean {
    if (this.done) return true;
    this.t += dt;
    const t = this.t;
    this.target.position(this.planet);
    const r = this.target.radius;
    const surface = this.planet.clone().addScaledVector(this.landDir, r * 0.98);
    const approach = this.planet.clone().addScaledVector(this.landDir, r + 1.6);
    const pos = new THREE.Vector3();

    if (t < FLY) {
      // A high arc from the fleet to a point above the landing site.
      const u = easeInOut(t / FLY);
      const mid = this.from.clone().lerp(approach, 0.5);
      mid.y += 3 + this.from.distanceTo(approach) * 0.15;
      bezier(this.from, mid, approach, u, pos);
      this.ship.root.scale.setScalar(0.75);
    } else if (t < FLY + LAND) {
      const u = easeIn((t - FLY) / LAND);
      pos.copy(approach).lerp(surface, u);
      this.ship.root.scale.setScalar(0.75 * (1 - u * 0.85));
    } else {
      pos.copy(surface);
      this.ship.root.visible = false;
      this.engine.visible = false;
    }

    if (this.ship.root.visible) {
      this.ship.root.position.copy(pos);
      // Nose along the direction of travel (ships are modelled nose along +X).
      const v = pos.clone().sub(this.prev);
      if (v.lengthSq() > 1e-8) {
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), v.normalize());
        this.ship.root.quaternion.slerp(q, Math.min(1, dt * 10));
      }
      this.ship.animate(time, false);
      const back = new THREE.Vector3(-0.55, 0, 0).applyQuaternion(this.ship.root.quaternion).multiplyScalar(this.ship.root.scale.x / 0.75);
      this.engine.position.copy(pos).add(back);
      this.engine.material.opacity = 0.7 + Math.sin(time * 40) * 0.2;
    }
    this.prev.copy(pos);

    // Touchdown: a flash, a shockwave across the surface and lights coming on.
    const b = t - FLY - LAND;
    if (b > -0.15) {
      const u = Math.max(0, b) / BLOOM;
      this.flash.position.copy(surface);
      this.flash.material.opacity = Math.max(0, 1 - u * 1.6) * Math.min(1, (b + 0.15) / 0.15);
      this.flash.scale.setScalar(r * (1.6 + u * 4));
      this.wave.position.copy(this.planet);
      (this.wave.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 - u);
      this.wave.scale.setScalar(r * (2 + u * 5));
      this.lights.position.copy(this.planet);
      if (camera) {
        const toCam = camera.position.clone().sub(this.planet).normalize();
        for (const dot of this.lights.children) dot.visible = dot.position.clone().normalize().dot(toCam) > 0.15;
      }
      this.lightsMat.opacity = Math.min(1, u * 2.5) * (u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1);
    }
    if (t >= COLONIZE_SECONDS) this.done = true;
    return this.done;
  }

  dispose(): void {
    disposeModel(this.ship);
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
    this.done = true;
  }
}

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeIn = (u: number) => u * u;

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const k = 1 - u;
  return out.set(
    k * k * a.x + 2 * k * u * b.x + u * u * c.x,
    k * k * a.y + 2 * k * u * b.y + u * u * c.y,
    k * k * a.z + 2 * k * u * b.z + u * u * c.z,
  );
}
