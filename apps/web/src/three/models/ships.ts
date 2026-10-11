import * as THREE from "three";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/**
 * Warships, one silhouette per hull class, built nose-forward along +X at unit
 * length and scaled to the class's size. Bevelled armour slabs and turned
 * fuselages in the owner's colour, dark machinery, self-lit trim, glowing
 * engine bells and turrets that read at battle distance and up close in the
 * ship designer.
 */

export type ShipClass = "frigate" | "destroyer" | "cruiser" | "battleship" | "titan" | "doomStar";

/** Model length in world units (one battlefield square is 1). */
export const SHIP_LENGTH: Record<ShipClass, number> = {
  frigate: 0.9, destroyer: 1.1, cruiser: 1.4, battleship: 1.75, titan: 2.1, doomStar: 2.6,
};

const PI = Math.PI;
type V3 = [number, number, number];

/** A cone along +X (tip forward). */
const cone = (k: ModelKit, r: number, h: number, segs: number) =>
  k.geo(`cone:${r}:${h}:${segs}`, () => new THREE.ConeGeometry(r, h, segs).rotateZ(-PI / 2));
/** A cylinder along X, `front` radius at +X. */
const tube = (k: ModelKit, front: number, back: number, len: number, segs: number, open = false) =>
  k.geo(`tube:${front}:${back}:${len}:${segs}:${open}`, () => new THREE.CylinderGeometry(front, back, len, segs, 1, open).rotateZ(-PI / 2));
const box = (k: ModelKit, x: number, y: number, z: number) => k.geo(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const ico = (k: ModelKit, r: number, detail: number) => k.geo(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
const torus = (k: ModelKit, r: number, t: number, rs: number, ts: number) =>
  k.geo(`torus:${r}:${t}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts));
/** A disc facing -X, for the glowing inside of an engine bell. */
const disc = (k: ModelKit, r: number) => k.geo(`disc:${r}`, () => new THREE.CircleGeometry(r, 16).rotateY(-PI / 2));

/**
 * Box-projected texture coordinates, so plating panels keep one size on every
 * face however a shape was built.
 */
function boxUV(g: THREE.BufferGeometry, scale = 2.5): THREE.BufferGeometry {
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
function slab(k: ModelKit, key: string, half: [number, number][], thick: number, bevel: number, mirror = true): THREE.BufferGeometry {
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
function fuselage(k: ModelKit, key: string, profile: [number, number][], segs: number): THREE.BufferGeometry {
  return k.geo(`lathe:${key}`, () =>
    boxUV(new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), segs).rotateZ(-PI / 2)),
  );
}

interface Parts {
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
function engine(p: Parts, [x, y, z]: V3, r: number, len: number, glow: number): void {
  part(p.body, tube(p.k, r * 0.8, r, len, 12, true), p.dark, [x + len / 2, y, z]);
  part(p.body, tube(p.k, r * 0.86, r * 0.86, len * 0.4, 12), p.dark, [x + len, y, z]);
  part(p.body, disc(p.k, r * 0.78), p.flame, [x + len * 0.25, y, z]);
  p.engines.push([x - 0.02, y, z, glow]);
}

/** A gun turret on a deck at height `y`, barrels forward; `twin` mounts two barrels. */
function turret(p: Parts, [x, y, z]: V3, r: number, twin = true): void {
  part(p.body, p.k.geo(`turret:${r}`, () => new THREE.CylinderGeometry(r * 0.85, r, r * 0.55, 10)), p.dark, [x, y + r * 0.27, z]);
  part(p.body, box(p.k, r * 1.1, r * 0.45, r * 1.2), p.hull, [x - r * 0.1, y + r * 0.62, z]);
  const offs = twin ? [-r * 0.28, r * 0.28] : [0];
  for (const dz of offs) part(p.body, tube(p.k, r * 0.12, r * 0.15, r * 2.2, 6), p.dark, [x + r * 1.3, y + r * 0.62, z + dz]);
}

/** A thin antenna mast rising from `at`. */
function mast(p: Parts, [x, y, z]: V3, h: number): void {
  part(p.body, p.k.geo(`mast:${h}`, () => new THREE.CylinderGeometry(0.004, 0.007, h, 4)), p.dark, [x, y + h / 2, z]);
  part(p.body, ico(p.k, 0.012, 0), p.trim, [x, y + h, z]);
}

/** Mirrored pair: calls `make` for +z and -z. */
const pair = (z: number, make: (z: number) => void) => [z, -z].forEach(make);

export function buildShip(k: ModelKit, cls: ShipClass, owner: THREE.ColorRepresentation): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const p: Parts = {
    k, body, engines: [],
    hull: k.hull(owner),
    dark: k.dark(),
    trim: k.accent(owner),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x3aa0ff, emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.15, flatShading: true }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(owner).lerp(new THREE.Color(0xffffff), 0.6) }),
  };
  const { hull, dark, trim, glass } = p;
  let spin: THREE.Object3D | null = null;
  let muzzle = new THREE.Vector3(0.55, 0, 0);
  let height = 0.12;

  switch (cls) {
    case "frigate": {
      // A swept arrowhead with a raised spine, canopy and twin tail fins.
      part(body, slab(k, "frigate", [[0.5, 0], [0.1, 0.07], [-0.18, 0.3], [-0.32, 0.31], [-0.3, 0.12], [-0.42, 0.1], [-0.42, 0]], 0.035, 0.012), hull);
      part(body, fuselage(k, "frigate-spine", [[-0.44, 0.07], [-0.3, 0.085], [0, 0.07], [0.3, 0.035], [0.46, 0]], 8), hull, [0, 0.02, 0], [0, 0, 0], [1, 0.7, 1]);
      part(body, ico(k, 0.06, 1), glass, [0.12, 0.06, 0], [0, 0, 0], [1.9, 0.6, 0.8]);
      pair(0.11, (z) => {
        part(body, slab(k, "frigate-fin", [[-0.22, 0], [-0.36, 0.11], [-0.4, 0.11], [-0.38, 0]], 0.008, 0.004, false), dark, [0, 0.03, z], [-PI / 2 + 0.3 * Math.sign(z), 0, 0]);
        part(body, tube(k, 0.008, 0.01, 0.16, 5), dark, [-0.12, -0.01, z * 2.4]);
        part(body, box(k, 0.22, 0.006, 0.012), trim, [-0.14, 0.03, z * 1.5]);
      });
      part(body, box(k, 0.4, 0.008, 0.012), trim, [-0.05, 0.075, 0]);
      engine(p, [-0.46, 0.01, 0], 0.055, 0.08, 0.32);
      pair(0.2, (z) => engine(p, [-0.38, 0, z], 0.025, 0.05, 0.16));
      muzzle = new THREE.Vector3(0.5, 0, 0);
      height = 0.14;
      break;
    }
    case "destroyer": {
      // A long needle fuselage with two engine nacelles on swept pylons.
      part(body, fuselage(k, "destroyer", [[-0.4, 0.07], [-0.3, 0.1], [0.05, 0.095], [0.3, 0.06], [0.5, 0]], 10), hull, [0, 0, 0], [0, 0, 0], [1, 0.8, 1]);
      part(body, slab(k, "destroyer-deck", [[0.25, 0], [0.1, 0.06], [-0.3, 0.07], [-0.36, 0]], 0.03, 0.01), hull, [0, 0.075, 0]);
      part(body, slab(k, "destroyer-bridge", [[0, 0], [-0.04, 0.04], [-0.16, 0.045], [-0.18, 0]], 0.05, 0.01), dark, [0, 0.12, 0]);
      part(body, box(k, 0.03, 0.012, 0.07), glass, [0.005, 0.135, 0]);
      mast(p, [-0.12, 0.16, 0], 0.08);
      turret(p, [0.16, 0.08, 0], 0.035);
      part(body, slab(k, "destroyer-pylon", [[0.0, 0], [-0.08, 0.24], [-0.2, 0.24], [-0.22, 0]], 0.014, 0.006), dark, [0, -0.01, 0]);
      pair(0.26, (z) => {
        part(body, fuselage(k, "destroyer-nacelle", [[-0.26, 0.05], [-0.1, 0.06], [0.12, 0.05], [0.2, 0.02]], 10), hull, [-0.16, -0.01, z]);
        part(body, box(k, 0.34, 0.008, 0.012), trim, [-0.14, 0.05, z]);
        engine(p, [-0.48, -0.01, z], 0.045, 0.06, 0.26);
      });
      engine(p, [-0.46, 0, 0], 0.05, 0.06, 0.24);
      height = 0.2;
      break;
    }
    case "cruiser": {
      // A wedge hull with a stepped superstructure, two turrets and side sponsons.
      part(body, slab(k, "cruiser", [[0.5, 0], [0.3, 0.08], [0.05, 0.16], [-0.38, 0.17], [-0.44, 0.12], [-0.44, 0]], 0.1, 0.025), hull);
      part(body, slab(k, "cruiser-keel", [[0.3, 0], [0.0, 0.08], [-0.4, 0.08], [-0.4, 0]], 0.06, 0.015), dark, [0, -0.08, 0]);
      part(body, slab(k, "cruiser-deck", [[0.12, 0], [0.0, 0.08], [-0.34, 0.09], [-0.36, 0]], 0.05, 0.015), hull, [0, 0.085, 0]);
      part(body, slab(k, "cruiser-tower", [[-0.08, 0], [-0.12, 0.05], [-0.26, 0.05], [-0.28, 0]], 0.06, 0.012), dark, [0, 0.14, 0]);
      part(body, box(k, 0.03, 0.014, 0.08), glass, [-0.085, 0.16, 0]);
      mast(p, [-0.22, 0.17, 0.02], 0.1);
      mast(p, [-0.24, 0.17, -0.025], 0.07);
      turret(p, [0.24, 0.05, 0], 0.045);
      turret(p, [0.08, 0.11, 0], 0.045);
      pair(0.17, (z) => {
        part(body, fuselage(k, "cruiser-sponson", [[-0.22, 0.045], [0.1, 0.045], [0.2, 0.0]], 8), dark, [-0.12, -0.005, z]);
        part(body, box(k, 0.5, 0.01, 0.014), trim, [-0.06, 0.055, z * 0.82]);
        turret(p, [-0.02, 0.04, z * 1.08], 0.03, false);
      });
      for (const z of [-0.09, 0, 0.09]) engine(p, [-0.5, 0, z], 0.045, 0.07, 0.24);
      height = 0.25;
      break;
    }
    case "battleship": {
      // A long armoured citadel: layered decks, a bridge tower, four twin turrets, broadside batteries.
      part(body, slab(k, "battleship", [[0.5, 0], [0.38, 0.07], [0.15, 0.14], [-0.3, 0.15], [-0.44, 0.12], [-0.46, 0]], 0.12, 0.025), hull);
      part(body, slab(k, "battleship-keel", [[0.42, 0], [0.2, 0.06], [-0.4, 0.08], [-0.44, 0]], 0.08, 0.02), dark, [0, -0.1, 0]);
      part(body, slab(k, "battleship-deck", [[0.25, 0], [0.12, 0.09], [-0.34, 0.1], [-0.38, 0]], 0.05, 0.015), hull, [0, 0.095, 0]);
      part(body, slab(k, "battleship-tower", [[-0.05, 0], [-0.09, 0.05], [-0.24, 0.055], [-0.26, 0]], 0.08, 0.012), dark, [0, 0.16, 0]);
      part(body, slab(k, "battleship-bridge", [[-0.09, 0], [-0.11, 0.065], [-0.18, 0.065], [-0.19, 0]], 0.025, 0.006), hull, [0, 0.215, 0]);
      part(body, box(k, 0.02, 0.012, 0.11), glass, [-0.1, 0.22, 0]);
      mast(p, [-0.16, 0.23, 0], 0.12);
      turret(p, [0.3, 0.06, 0], 0.05);
      turret(p, [0.16, 0.12, 0], 0.05);
      turret(p, [-0.32, 0.12, 0], 0.045);
      pair(0.155, (z) => {
        part(body, box(k, 0.62, 0.012, 0.014), trim, [-0.06, 0.06, z * 0.92]);
        for (const x of [0.05, -0.08, -0.21]) turret(p, [x, 0.03, z], 0.025, false);
        part(body, slab(k, "battleship-fin", [[-0.25, 0], [-0.4, 0.12], [-0.46, 0.12], [-0.44, 0]], 0.01, 0.005, false), dark, [0, -0.1, z * 0.4], [PI / 2 - 0.6 * Math.sign(z), 0, 0]);
      });
      for (const z of [-0.07, 0.07]) for (const y of [-0.045, 0.045]) engine(p, [-0.52, y, z], 0.042, 0.07, 0.22);
      muzzle = new THREE.Vector3(0.6, 0, 0);
      height = 0.3;
      break;
    }
    case "titan": {
      // A twin-hulled colossus: a central spine with a spinal lance, outrigger hulls joined by armoured wings.
      part(body, slab(k, "titan-spine", [[0.5, 0], [0.32, 0.09], [-0.36, 0.11], [-0.44, 0.07], [-0.44, 0]], 0.13, 0.03), hull);
      part(body, slab(k, "titan-wing", [[0.18, 0], [0.05, 0.36], [-0.3, 0.4], [-0.36, 0]], 0.04, 0.012), dark);
      part(body, slab(k, "titan-deck", [[0.2, 0], [0.06, 0.07], [-0.3, 0.08], [-0.34, 0]], 0.06, 0.015), hull, [0, 0.1, 0]);
      part(body, slab(k, "titan-tower", [[-0.08, 0], [-0.12, 0.06], [-0.26, 0.06], [-0.28, 0]], 0.09, 0.012), dark, [0, 0.175, 0]);
      part(body, box(k, 0.02, 0.014, 0.12), glass, [-0.115, 0.2, 0]);
      mast(p, [-0.22, 0.22, 0.03], 0.13);
      mast(p, [-0.24, 0.22, -0.03], 0.09);
      // The spinal lance: a long barrel with charging rings.
      part(body, tube(k, 0.025, 0.035, 0.36, 10), dark, [0.52, 0, 0]);
      for (const x of [0.42, 0.52, 0.62]) part(body, torus(k, 0.04, 0.008, 6, 14), trim, [x, 0, 0], [0, PI / 2, 0]);
      turret(p, [0.12, 0.13, 0], 0.05);
      turret(p, [-0.34, 0.13, 0], 0.045);
      pair(0.36, (z) => {
        part(body, fuselage(k, "titan-outrigger", [[-0.42, 0.07], [-0.2, 0.085], [0.15, 0.075], [0.32, 0.0]], 10), hull, [-0.04, 0, z]);
        part(body, box(k, 0.6, 0.01, 0.014), trim, [-0.06, 0.075, z]);
        turret(p, [0.05, 0.065, z], 0.035);
        turret(p, [-0.18, 0.065, z], 0.035);
        engine(p, [-0.5, 0, z], 0.06, 0.08, 0.26);
      });
      for (const z of [-0.08, 0, 0.08]) engine(p, [-0.5, 0, z], 0.05, 0.08, 0.26);
      muzzle = new THREE.Vector3(0.72, 0, 0);
      height = 0.32;
      break;
    }
    case "doomStar": {
      // A planet-cracker: an armoured sphere with an equatorial trench, a spinal cannon and a turning weapons ring.
      part(body, ico(k, 0.32, 3), hull);
      part(body, torus(k, 0.322, 0.02, 6, 48), dark, [0, 0, 0], [PI / 2, 0, 0]);
      part(body, torus(k, 0.326, 0.006, 4, 48), trim, [0, 0.03, 0], [PI / 2, 0, 0]);
      part(body, torus(k, 0.326, 0.006, 4, 48), trim, [0, -0.03, 0], [PI / 2, 0, 0]);
      // The dish of the main gun.
      part(body, k.geo("doom-dish", () => new THREE.SphereGeometry(0.16, 20, 8, 0, PI * 2, 0, PI / 3).rotateZ(-PI / 2)), dark, [0.2, 0, 0]);
      part(body, cone(k, 0.05, 0.4, 10), dark, [0.42, 0, 0]);
      part(body, ico(k, 0.04, 1), glass, [0.56, 0, 0]);
      part(body, slab(k, "doom-tower", [[0.06, 0], [0.02, 0.06], [-0.14, 0.06], [-0.16, 0]], 0.08, 0.015), dark, [-0.04, 0.32, 0]);
      mast(p, [-0.08, 0.36, 0], 0.12);
      for (const [y, z] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]] as const) {
        const m = part(body, box(k, 0.05, 0.05, 0.12), dark, [0.05, y, z]);
        m.lookAt(new THREE.Vector3(0.05, y * 4, z * 4));
      }
      const ring = new THREE.Group();
      part(ring, torus(k, 0.46, 0.035, 8, 48), dark, [0, 0, 0], [0, PI / 2, 0]);
      part(ring, torus(k, 0.46, 0.012, 4, 48), trim, [0.03, 0, 0], [0, PI / 2, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        part(ring, cone(k, 0.035, 0.18, 6), hull, [0, Math.cos(a) * 0.52, Math.sin(a) * 0.52], [a + PI / 2, 0, PI / 2]);
        part(ring, box(k, 0.06, 0.05, 0.05), dark, [0, Math.cos(a) * 0.46, Math.sin(a) * 0.46], [a, 0, 0]);
      }
      body.add(ring);
      spin = ring;
      for (const z of [-0.12, 0.12]) for (const y of [-0.12, 0.12]) engine(p, [-0.4, y, z], 0.06, 0.12, 0.28);
      muzzle = new THREE.Vector3(0.78, 0, 0);
      height = 0.5;
      break;
    }
  }

  const sprites = p.engines.map(([x, y, z, s]) => {
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
