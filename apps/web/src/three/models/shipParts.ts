import * as THREE from "three";
import { part, type ModelKit } from "./kit";

/**
 * Building blocks for ship models: cached primitives laid along +X (nose
 * forward), bevelled armour slabs, turned fuselages, engine bells, turrets
 * and masts. Every ship style is assembled from these.
 */

export const PI = Math.PI;
export type V3 = [number, number, number];

/** A cone along +X (tip forward). */
export const cone = (k: ModelKit, r: number, h: number, segs: number) =>
  k.geo(`cone:${r}:${h}:${segs}`, () => new THREE.ConeGeometry(r, h, segs).rotateZ(-PI / 2));
/** A cylinder along X, `front` radius at +X. */
export const tube = (k: ModelKit, front: number, back: number, len: number, segs: number, open = false) =>
  k.geo(`tube:${front}:${back}:${len}:${segs}:${open}`, () => new THREE.CylinderGeometry(front, back, len, segs, 1, open).rotateZ(-PI / 2));
export const box = (k: ModelKit, x: number, y: number, z: number) => k.geo(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
export const ico = (k: ModelKit, r: number, detail: number) => k.geo(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
export const torus = (k: ModelKit, r: number, t: number, rs: number, ts: number) =>
  k.geo(`torus:${r}:${t}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts));
/** A disc facing -X, for the glowing inside of an engine bell. */
export const disc = (k: ModelKit, r: number) => k.geo(`disc:${r}`, () => new THREE.CircleGeometry(r, 16).rotateY(-PI / 2));

/**
 * Box-projected texture coordinates, so plating panels keep one size on every
 * face however a shape was built.
 */
export function boxUV(g: THREE.BufferGeometry, scale = 2.5): THREE.BufferGeometry {
  g.computeVertexNormals();
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [ax, ay, az] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * An armour slab: a plan outline (x forward, z to starboard), mirrored across
 * the keel, extruded `thick` high with bevelled edges and centred on y = 0.
 * `half` runs from the nose to the stern along the starboard side. Unmirrored
 * slabs (fins) use `half` as the whole outline.
 */
export function slab(k: ModelKit, key: string, half: [number, number][], thick: number, bevel: number, mirror = true): THREE.BufferGeometry {
  return k.geo(`slab:${key}`, () => {
    const pts = mirror
      ? [...half, ...[...half].reverse().map(([x, z]) => [x, -z] as [number, number])]
        .filter(([, z], i, all) => i === 0 || z !== 0 || all[i - 1]![1] !== 0)
      : half;
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thick, steps: 1, curveSegments: 4,
      bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
    // Shape y becomes -z, the extrusion becomes +y.
    g.rotateX(-PI / 2);
    g.translate(0, -thick / 2, 0);
    return boxUV(g);
  });
}

/** A turned fuselage along X from a profile of [x, radius] points, tail first. */
export function fuselage(k: ModelKit, key: string, profile: [number, number][], segs: number): THREE.BufferGeometry {
  return k.geo(`lathe:${key}`, () =>
    boxUV(new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), segs).rotateZ(-PI / 2)),
  );
}

export interface Parts {
  k: ModelKit;
  body: THREE.Group;
  hull: THREE.Material;
  dark: THREE.Material;
  trim: THREE.Material;
  glass: THREE.Material;
  flame: THREE.Material;
  engines: [number, number, number, number][];
}

/** An engine bell opening backwards at `x`, with a hot core and a glow sprite behind it. */
export function engine(p: Parts, [x, y, z]: V3, r: number, len: number, glow: number): void {
  part(p.body, tube(p.k, r * 0.8, r, len, 12, true), p.dark, [x + len / 2, y, z]);
  part(p.body, tube(p.k, r * 0.86, r * 0.86, len * 0.4, 12), p.dark, [x + len, y, z]);
  part(p.body, disc(p.k, r * 0.78), p.flame, [x + len * 0.25, y, z]);
  p.engines.push([x - 0.02, y, z, glow]);
}

/** A gun turret on a deck at height `y`, barrels forward; `twin` mounts two barrels. */
export function turret(p: Parts, [x, y, z]: V3, r: number, twin = true): void {
  part(p.body, p.k.geo(`turret:${r}`, () => new THREE.CylinderGeometry(r * 0.85, r, r * 0.55, 10)), p.dark, [x, y + r * 0.27, z]);
  part(p.body, box(p.k, r * 1.1, r * 0.45, r * 1.2), p.hull, [x - r * 0.1, y + r * 0.62, z]);
  const offs = twin ? [-r * 0.28, r * 0.28] : [0];
  for (const dz of offs) part(p.body, tube(p.k, r * 0.12, r * 0.15, r * 2.2, 6), p.dark, [x + r * 1.3, y + r * 0.62, z + dz]);
}

/** A thin antenna mast rising from `at`. */
export function mast(p: Parts, [x, y, z]: V3, h: number): void {
  part(p.body, p.k.geo(`mast:${h}`, () => new THREE.CylinderGeometry(0.004, 0.007, h, 4)), p.dark, [x, y + h / 2, z]);
  part(p.body, ico(p.k, 0.012, 0), p.trim, [x, y + h, z]);
}

/** Mirrored pair: calls `make` for +z and -z. */
export const pair = (z: number, make: (z: number) => void) => [z, -z].forEach(make);
