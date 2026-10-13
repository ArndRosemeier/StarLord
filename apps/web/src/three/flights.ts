import * as THREE from "three";
import { glowSpriteMaterial } from "./materials";

/**
 * Missiles, torpedoes and squadrons on their way across the 3D battlefield:
 * a small dart pointing where it flies, a bright glow in the weapon's colour,
 * a fading trail back along its path and a faint dashed line to its target,
 * so a volley in flight reads at a glance and its target is never a guess.
 */

export interface FlightDraw {
  id: string;
  /** World positions: where it was one event ago, where it is now, and its target. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: THREE.Vector3 | null;
  /** Glow (weapon) colour and owner colour. */
  color: THREE.ColorRepresentation;
  owner: THREE.ColorRepresentation;
  /** Missiles or craft in the volley: bigger volleys draw bigger. */
  count: number;
  craft: boolean;
}

interface FlightView {
  group: THREE.Group;
  dart: THREE.Mesh;
  glow: THREE.Sprite;
  trail: THREE.Line;
  aim: THREE.Line;
  seen: boolean;
}

const TRAIL_POINTS = 2;
/** Longest trail drawn behind a missile, in world units. */
const TRAIL_LENGTH = 3;

export class FlightLayer {
  readonly group = new THREE.Group();
  private views = new Map<string, FlightView>();
  private dartGeo = new THREE.ConeGeometry(0.13, 0.65, 8).rotateZ(-Math.PI / 2);
  private craftGeo = new THREE.TetrahedronGeometry(0.16);

  constructor(private glow: THREE.Texture) {}

  /** Draws everything in flight `k` of the way (0..1) from its last position to its current one. */
  update(draws: FlightDraw[], k: number, t: number, reduced: boolean): void {
    for (const v of this.views.values()) v.seen = false;
    for (const d of draws) {
      const v = this.views.get(d.id) ?? this.make(d);
      v.seen = true;
      v.group.visible = true;
      const at = d.from.clone().lerp(d.to, k);
      const dir = d.to.clone().sub(d.from);
      if (dir.lengthSq() < 1e-6 && d.target) dir.copy(d.target).sub(at);
      const scale = 1 + Math.min(1.2, Math.log2(Math.max(1, d.count)) * 0.3);
      v.dart.position.copy(at);
      v.dart.scale.setScalar(scale);
      if (dir.lengthSq() > 1e-6) v.dart.rotation.y = -Math.atan2(dir.z, dir.x);
      if (d.craft && !reduced) v.dart.rotation.x = t * 3;
      const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 12 + at.x);
      v.glow.position.copy(at);
      v.glow.scale.setScalar(1.2 * scale * pulse);
      // Trail: from where it was one step ago (or a short stub behind it) to where it is.
      const back = at.clone().sub(dir.clone().setLength(Math.min(TRAIL_LENGTH, Math.max(1.2, d.from.distanceTo(at)))));
      const tp = v.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      tp.setXYZ(0, back.x, back.y, back.z);
      tp.setXYZ(1, at.x, at.y, at.z);
      tp.needsUpdate = true;
      const ap = v.aim.geometry.getAttribute("position") as THREE.BufferAttribute;
      if (d.target) {
        ap.setXYZ(0, at.x, at.y, at.z);
        ap.setXYZ(1, d.target.x, d.target.y, d.target.z);
        ap.needsUpdate = true;
        v.aim.computeLineDistances();
        v.aim.visible = true;
      } else v.aim.visible = false;
      v.trail.geometry.computeBoundingSphere();
      v.aim.geometry.computeBoundingSphere();
    }
    for (const [id, v] of this.views) {
      if (v.seen) continue;
      this.group.remove(v.group);
      this.free(v);
      this.views.delete(id);
    }
  }

  private make(d: FlightDraw): FlightView {
    const group = new THREE.Group();
    const dart = new THREE.Mesh(d.craft ? this.craftGeo : this.dartGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(d.owner).lerp(new THREE.Color(0xffffff), 0.35) }));
    const glow = new THREE.Sprite(glowSpriteMaterial(this.glow, d.color, 1));
    glow.renderOrder = 6;
    const trail = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3))
        .setAttribute("color", new THREE.BufferAttribute(new Float32Array([0, 0, 0, ...new THREE.Color(d.color).toArray()]), 3)),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const aim = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineDashedMaterial({ color: d.owner, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    group.add(aim, trail, dart, glow);
    this.group.add(group);
    const v = { group, dart, glow, trail, aim, seen: true };
    this.views.set(d.id, v);
    return v;
  }

  private free(v: FlightView): void {
    for (const o of [v.dart, v.trail, v.aim]) {
      if (o !== v.dart) o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    v.glow.material.dispose();
  }

  dispose(): void {
    for (const v of this.views.values()) this.free(v);
    this.views.clear();
    this.dartGeo.dispose();
    this.craftGeo.dispose();
  }
}
