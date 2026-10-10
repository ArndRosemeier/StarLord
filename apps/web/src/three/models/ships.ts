import * as THREE from "three";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/**
 * Low-poly warships, one silhouette per hull class, built nose-forward along +X
 * at unit length and scaled to the class's size. Owner colour on the plating,
 * self-lit trim and engine glows.
 */

export type ShipClass = "frigate" | "destroyer" | "cruiser" | "battleship" | "titan" | "doomStar";

/** Model length in world units (one battlefield square is 1). */
export const SHIP_LENGTH: Record<ShipClass, number> = {
  frigate: 0.9, destroyer: 1.1, cruiser: 1.4, battleship: 1.75, titan: 2.1, doomStar: 2.6,
};

const PI = Math.PI;

/** A cone along +X (tip forward). */
const cone = (k: ModelKit, r: number, h: number, segs: number) =>
  k.geo(`cone:${r}:${h}:${segs}`, () => new THREE.ConeGeometry(r, h, segs).rotateZ(-PI / 2));
/** A cylinder along X, `front` radius at +X. */
const tube = (k: ModelKit, front: number, back: number, len: number, segs: number) =>
  k.geo(`tube:${front}:${back}:${len}:${segs}`, () => new THREE.CylinderGeometry(front, back, len, segs).rotateZ(-PI / 2));
const box = (k: ModelKit, x: number, y: number, z: number) => k.geo(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const ico = (k: ModelKit, r: number, detail: number) => k.geo(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
const torus = (k: ModelKit, r: number, tube: number, rs: number, ts: number) =>
  k.geo(`torus:${r}:${tube}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts));

export function buildShip(k: ModelKit, cls: ShipClass, owner: THREE.ColorRepresentation): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hull = k.hull(owner);
  const dark = k.dark();
  const trim = k.accent(owner);
  const engines: [number, number, number, number][] = [];
  let spin: THREE.Object3D | null = null;
  let muzzle = new THREE.Vector3(0.55, 0, 0);
  let height = 0.12;

  switch (cls) {
    case "frigate": {
      part(body, cone(k, 0.16, 1, 4), hull, [0.05, 0, 0], [PI / 4, 0, 0], [1, 0.45, 1]);
      part(body, box(k, 0.3, 0.025, 0.62), hull, [-0.22, 0, 0]);
      part(body, box(k, 0.5, 0.02, 0.025), trim, [0, 0.05, 0]);
      part(body, box(k, 0.06, 0.12, 0.03), dark, [-0.3, 0.08, 0]);
      engines.push([-0.45, 0, 0, 0.35]);
      break;
    }
    case "destroyer": {
      part(body, tube(k, 0.02, 0.15, 1, 6), hull, [0.02, 0, 0]);
      part(body, box(k, 0.22, 0.03, 0.48), dark, [-0.2, 0, 0]);
      for (const z of [-0.24, 0.24]) {
        part(body, tube(k, 0.05, 0.065, 0.5, 8), hull, [-0.2, 0, z]);
        part(body, box(k, 0.36, 0.015, 0.02), trim, [-0.18, 0.06, z]);
        engines.push([-0.47, 0, z, 0.3]);
      }
      part(body, box(k, 0.14, 0.08, 0.08), dark, [-0.1, 0.12, 0]);
      height = 0.18;
      break;
    }
    case "cruiser": {
      part(body, box(k, 0.62, 0.15, 0.26), hull, [-0.12, 0, 0]);
      part(body, cone(k, 0.2, 0.45, 4), hull, [0.4, 0, 0], [PI / 4, 0, 0], [1, 0.55, 1]);
      part(body, box(k, 0.2, 0.12, 0.12), dark, [-0.25, 0.13, 0]);
      part(body, box(k, 0.08, 0.04, 0.16), trim, [-0.2, 0.2, 0]);
      for (const z of [-0.18, 0.18]) part(body, box(k, 0.4, 0.07, 0.08), dark, [-0.15, -0.02, z]);
      part(body, box(k, 0.62, 0.02, 0.02), trim, [-0.1, 0.08, 0]);
      for (const z of [-0.1, 0, 0.1]) engines.push([-0.46, 0, z, 0.24]);
      height = 0.24;
      break;
    }
    case "battleship": {
      part(body, tube(k, 0.15, 0.2, 0.8, 6), hull, [-0.1, 0, 0], [0, 0, 0], [1, 0.75, 1]);
      part(body, cone(k, 0.15, 0.4, 6), hull, [0.5, 0, 0], [0, 0, 0], [1, 0.75, 1]);
      part(body, box(k, 0.35, 0.16, 0.08), dark, [-0.25, 0.18, 0]);
      part(body, box(k, 0.3, 0.12, 0.02), hull, [-0.3, -0.18, 0]);
      for (const [x, z] of [[0.15, 0.12], [0.15, -0.12], [-0.05, 0.14], [-0.05, -0.14]] as const) {
        part(body, k.geo("turret", () => new THREE.CylinderGeometry(0.045, 0.05, 0.04, 8)), dark, [x, 0.13, z]);
        part(body, tube(k, 0.008, 0.008, 0.12, 4), dark, [x + 0.06, 0.14, z]);
      }
      part(body, box(k, 0.7, 0.015, 0.02), trim, [-0.05, 0.155, 0]);
      for (const z of [-0.08, 0.08]) for (const y of [-0.06, 0.06]) engines.push([-0.52, y, z, 0.24]);
      muzzle = new THREE.Vector3(0.7, 0, 0);
      height = 0.28;
      break;
    }
    case "titan": {
      part(body, box(k, 0.75, 0.16, 0.42), hull, [-0.1, 0, 0]);
      part(body, cone(k, 0.3, 0.5, 4), hull, [0.5, 0, 0], [PI / 4, 0, 0], [1, 0.4, 1]);
      part(body, box(k, 0.35, 0.18, 0.18), dark, [-0.25, 0.16, 0]);
      part(body, box(k, 0.05, 0.03, 0.24), trim, [-0.13, 0.26, 0]);
      for (const z of [-0.36, 0.36]) {
        part(body, tube(k, 0.06, 0.08, 0.7, 8), hull, [-0.08, 0, z]);
        part(body, box(k, 0.25, 0.03, 0.14), dark, [-0.12, 0, z * 0.78]);
        part(body, box(k, 0.6, 0.012, 0.012), trim, [-0.08, 0.075, z]);
        engines.push([-0.46, 0, z, 0.22]);
      }
      for (const z of [-0.12, 0, 0.12]) engines.push([-0.5, 0, z, 0.26]);
      muzzle = new THREE.Vector3(0.75, 0, 0);
      height = 0.3;
      break;
    }
    case "doomStar": {
      part(body, ico(k, 0.32, 1), hull);
      part(body, cone(k, 0.18, 0.6, 6), hull, [0.45, 0, 0]);
      part(body, tube(k, 0.07, 0.07, 0.3, 6), dark, [-0.35, 0, 0]);
      const ring = new THREE.Group();
      part(ring, torus(k, 0.46, 0.035, 6, 32), dark, [0, 0, 0], [0, PI / 2, 0]);
      part(ring, torus(k, 0.46, 0.012, 4, 32), trim, [0.02, 0, 0], [0, PI / 2, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        part(ring, cone(k, 0.04, 0.22, 4), hull, [0, Math.cos(a) * 0.5, Math.sin(a) * 0.5], [a + PI / 2, 0, PI / 2]);
      }
      body.add(ring);
      spin = ring;
      part(body, ico(k, 0.1, 0), trim, [0.3, 0.1, 0]);
      for (const z of [-0.12, 0.12]) for (const y of [-0.12, 0.12]) engines.push([-0.48, y, z, 0.28]);
      muzzle = new THREE.Vector3(0.78, 0, 0);
      height = 0.5;
      break;
    }
  }

  const sprites = engines.map(([x, y, z, s]) => {
    const e = k.engine(owner, s);
    e.position.set(x, y, z);
    body.add(e);
    return e;
  });
  const len = SHIP_LENGTH[cls];
  body.scale.setScalar(len);
  muzzle.multiplyScalar(len);
  return {
    root, body, engines: sprites, muzzle,
    radius: len * 0.55,
    height: height * len,
    materials: materialsOf(root),
    animate(time, still) {
      if (spin && !still) spin.rotation.x = time * 0.6;
    },
  };
}
