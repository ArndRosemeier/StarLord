import * as THREE from "three";
import { part, type ModelKit } from "./kit";
import { box, cone, engine, fuselage, ico, mast, pair, PI, slab, torus, tube, turret, type Parts } from "./shipParts";

/**
 * Ship design languages beyond the standard warships: one builder per style,
 * making all six hulls from the hull index `n` (frigate 0 … doom star 5).
 * Bigger hulls get more segments, guns and engines in the same shapes, so a
 * fleet reads as one family. Owner-coloured plating (`p.hull`) and trim
 * (`p.trim`) carry the empire colour on every style.
 */

export interface StyleResult {
  /** A part that turns slowly, around its own X or Y axis. */
  spin?: THREE.Object3D;
  spinAxis?: "x" | "y";
}

type Builder = (p: Parts, n: number) => StyleResult | void;

const oct = (k: ModelKit, r: number) => k.geo(`oct:${r}`, () => new THREE.OctahedronGeometry(r, 0));
/** An upright cylinder (along Y). */
const post = (k: ModelKit, top: number, bottom: number, h: number, segs = 6) =>
  k.geo(`post:${top}:${bottom}:${h}:${segs}`, () => new THREE.CylinderGeometry(top, bottom, h, segs));
/** Even spread of `count` values across [-half, half]. */
const spread = (count: number, half: number) =>
  Array.from({ length: count }, (_, i) => (count === 1 ? 0 : -half + (2 * half * i) / (count - 1)));

/** Beaked needles with forward-swept wings. */
const raptor: Builder = (pp, n) => {
  const { k, body, hull, dark, trim, glass } = pp;
  part(body, fuselage(k, "raptor", [[-0.42, 0.06], [-0.2, 0.085], [0.15, 0.07], [0.38, 0.03], [0.5, 0]], 10), hull, [0, 0, 0], [0, 0, 0], [1, 0.75, 1]);
  part(body, cone(k, 0.03, 0.14, 6), dark, [0.43, -0.03, 0]);
  part(body, ico(k, 0.05, 1), glass, [0.2, 0.04, 0], [0, 0, 0], [2, 0.6, 0.8]);
  const span = 0.22 + n * 0.045;
  part(body, slab(k, `raptor-wing-${n}`, [[-0.02, 0], [0.05, span], [-0.01, span + 0.03], [-0.32, 0.07], [-0.32, 0]], 0.018, 0.008), hull, [0, -0.012, 0]);
  pair(span * 0.55, (z) => part(body, box(k, 0.14, 0.006, 0.01), trim, [-0.04, 0.003, z], [0, -0.35 * Math.sign(z), 0]));
  pair(span + 0.005, (z) => part(body, tube(k, 0.007, 0.01, 0.16, 5), dark, [0.02, -0.012, z]));
  if (n >= 2) part(body, slab(k, "raptor-canard", [[0.32, 0], [0.27, 0.11], [0.21, 0.11], [0.19, 0]], 0.012, 0.005), dark, [0, 0, 0]);
  if (n >= 3) {
    const h = 0.1 + 0.02 * n;
    part(body, slab(k, `raptor-crest-${n}`, [[-0.05, 0], [-0.3, h], [-0.37, h], [-0.35, 0]], 0.01, 0.004, false), dark, [0, 0.03, 0], [-PI / 2, 0, 0]);
    for (let i = 0; i < n - 2; i++) turret(pp, [0.12 - i * 0.13, 0.05, 0], 0.028);
  }
  engine(pp, [-0.47, 0, 0], 0.05, 0.07, 0.3);
  if (n >= 1) pair(0.12 + 0.02 * n, (z) => engine(pp, [-0.38, -0.012, z], 0.03, 0.05, 0.18));
};

/** Massive armoured blocks with ram prows. */
const bulwark: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  const w = 0.15 + n * 0.02;
  part(body, slab(k, `bulwark-${n}`, [[0.42, 0], [0.42, w * 0.6], [0.3, w], [-0.42, w], [-0.46, w * 0.7], [-0.46, 0]], 0.15, 0.02), hull);
  part(body, slab(k, `bulwark-deck-${n}`, [[0.2, 0], [0.14, w * 0.65], [-0.38, w * 0.7], [-0.4, 0]], 0.07, 0.015), hull, [0, 0.11, 0]);
  part(body, cone(k, 0.09, 0.18, 4), dark, [0.5, -0.03, 0], [PI / 4, 0, 0], [1, 0.7, 1.5]);
  const plates = 2 + n;
  pair(w + 0.012, (z) => {
    for (const x of spread(plates, 0.32)) part(body, box(k, 0.6 / plates, 0.11, 0.022), dark, [x - 0.04, 0, z]);
    part(body, box(k, 0.7, 0.01, 0.012), trim, [-0.04, 0.08, z * 0.94]);
  });
  part(body, box(k, 0.12, 0.08, 0.11), dark, [-0.22, 0.18, 0]);
  part(body, box(k, 0.02, 0.016, 0.09), glass, [-0.155, 0.19, 0]);
  mast(p, [-0.25, 0.22, 0], 0.08);
  for (let i = 0; i <= Math.floor(n / 2); i++) turret(p, [0.12 - i * 0.17, 0.145, 0], 0.05);
  const engines = n < 2 ? 2 : n < 4 ? 3 : 4;
  for (const z of spread(engines, w * 0.6)) engine(p, [-0.52, 0, z], 0.06, 0.07, 0.26);
};

/** Flat, dark stealth wedges. */
const shade: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  const w = 0.3 + 0.02 * n;
  part(body, slab(k, `shade-${n}`, [[0.5, 0], [-0.25, w], [-0.4, w * 0.9], [-0.32, 0.08], [-0.42, 0]], 0.03, 0.01), dark);
  part(body, slab(k, `shade-top-${n}`, [[0.36, 0], [-0.2, w * 0.68], [-0.3, w * 0.6], [-0.27, 0]], 0.012, 0.004), hull, [0, 0.024, 0]);
  part(body, slab(k, "shade-canopy", [[0.22, 0], [0.12, 0.03], [0.03, 0.03], [0.01, 0]], 0.01, 0.004), glass, [0, 0.036, 0]);
  if (n >= 3) part(body, slab(k, `shade-spine-${n}`, [[0.15, 0], [-0.1, 0.08], [-0.3, 0.08], [-0.32, 0]], 0.03, 0.01), dark, [0, 0.04, 0]);
  const a = Math.atan2(w, 0.75);
  const len = Math.hypot(w, 0.75);
  pair(1, (s) => part(body, box(k, len, 0.006, 0.008), trim, [0.125, 0.012, (w / 2) * s], [0, a * s, 0]));
  pair(w * 0.8, (z) => part(body, slab(k, "shade-fin", [[-0.24, 0], [-0.34, 0.07], [-0.38, 0.07], [-0.36, 0]], 0.008, 0.003, false), dark, [0, 0.014, z], [-PI / 2 + 0.6 * Math.sign(z), 0, 0]));
  for (const z of spread(n + 1, 0.04 + 0.02 * n)) engine(p, [-0.43, 0, z], 0.018, 0.03, 0.12);
};

/** Saucers wrapped in rings. */
const halo: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  const r = 0.32;
  part(body, k.geo("halo-disc", () => new THREE.CylinderGeometry(r, r * 0.86, 0.06, 36)), hull, [0, 0, 0], [0, 0, 0], [1.15, 1, 1]);
  part(body, k.geo("halo-under", () => new THREE.CylinderGeometry(r * 0.55, r * 0.3, 0.07, 24)), dark, [0, -0.06, 0]);
  part(body, k.geo("halo-dome", () => new THREE.SphereGeometry(0.14, 20, 8, 0, PI * 2, 0, PI / 2)), glass, [0.03, 0.03, 0], [0, 0, 0], [1, 0.7, 1]);
  part(body, torus(k, r * 1.15 + 0.01, 0.012, 6, 64), trim, [0, 0.01, 0], [PI / 2, 0, 0], [1, 0.87, 1]);
  part(body, fuselage(k, "halo-nose", [[0.28, 0.05], [0.4, 0.04], [0.5, 0]], 10), hull);
  const spin = new THREE.Group();
  part(spin, torus(k, r + 0.08, 0.016, 6, 64), dark, [0, 0, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    part(spin, ico(k, 0.02, 0), trim, [Math.cos(a) * (r + 0.08), 0, Math.sin(a) * (r + 0.08)]);
  }
  if (n >= 2) part(spin, torus(k, r + 0.13, 0.01, 6, 64), dark, [0, 0, 0], [PI / 2 + 0.3, 0, 0]);
  spin.scale.set(1.12, 1, 1);
  body.add(spin);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n - 0.5) * PI * 0.9;
    part(body, ico(k, 0.035, 1), dark, [Math.cos(a) * r * 1.05, -0.02, Math.sin(a) * r * 0.95]);
  }
  for (const z of spread(2 + Math.floor(n / 2), 0.12)) engine(p, [-r * 1.18, 0, z], 0.04, 0.05, 0.2);
  return { spin, spinAxis: "y" };
};

/** A practical spine lined with round cargo pods. */
const hauler: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  part(body, tube(k, 0.035, 0.035, 0.8, 8), dark, [-0.05, 0, 0]);
  part(body, fuselage(k, "hauler-head", [[0.18, 0.06], [0.26, 0.095], [0.4, 0.075], [0.5, 0]], 12), hull);
  part(body, box(k, 0.06, 0.03, 0.1), glass, [0.38, 0.045, 0], [0, 0, -0.35]);
  const pods = 1 + n;
  const pr = Math.min(0.075, 0.2 / pods + 0.03);
  for (const x of spread(pods, 0.22)) {
    pair(pr + 0.02, (z) => {
      part(body, ico(k, pr, 2), hull, [x - 0.1, 0, z], [0, 0, 0], [1.35, 1, 1]);
      part(body, torus(k, pr * 0.92, 0.006, 4, 24), trim, [x - 0.1, 0, z], [0, PI / 2, 0]);
    });
    if (n >= 3) part(body, ico(k, pr * 0.8, 2), hull, [x - 0.1, pr + 0.03, 0], [0, 0, 0], [1.35, 1, 1]);
  }
  if (n >= 2) mast(p, [0.2, 0.08, 0], 0.08);
  pair(0.07, (z) => engine(p, [-0.5, 0, z], 0.05, 0.07, 0.24));
};

/** Chains of insect-like segments with mandibles and legs. */
const hive: Builder = (p, n) => {
  const { k, body, hull, dark, trim } = p;
  const segs = 3 + Math.floor(n / 2);
  for (let i = 0; i < segs; i++) {
    const f = i / (segs - 1);
    const r = 0.07 + f * 0.07 + n * 0.004;
    part(body, ico(k, r, 2), hull, [0.36 - f * 0.7, 0, 0], [0, 0, 0], [1.3, 0.8, 1]);
    if (i > 0) part(body, torus(k, r * 0.7, 0.008, 4, 20), dark, [0.36 - f * 0.7 + r * 1.1, 0, 0], [0, PI / 2, 0]);
  }
  pair(0.04, (z) => part(body, cone(k, 0.02, 0.15, 5), dark, [0.48, -0.015, z], [0, -0.35 * Math.sign(z), 0]));
  pair(0.045, (z) => part(body, ico(k, 0.018, 1), trim, [0.42, 0.03, z]));
  const legs = 2 + Math.floor(n / 2);
  pair(1, (s) => {
    for (const x of spread(legs, 0.12)) part(body, post(k, 0.007, 0.012, 0.24), dark, [x + 0.05, -0.06, s * 0.12], [-s * 0.95, 0, 0]);
  });
  if (n >= 2) part(body, slab(k, `hive-shell-${n}`, [[0.0, 0], [-0.08, 0.13], [-0.36, 0.12], [-0.42, 0]], 0.015, 0.008), hull, [0, 0.08, 0]);
  for (let i = 0; i < 1 + n; i++) part(body, ico(k, 0.014, 0), trim, [-0.08 - i * 0.06, 0.1, (i % 2 ? 1 : -1) * 0.04]);
  for (const z of spread(1 + Math.floor(n / 2), 0.06)) engine(p, [-0.5, 0, z], 0.04, 0.05, 0.22);
};

/** Open girder frames carrying engineered modules. */
const lattice: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  const len = 0.8;
  const w = 0.12 + 0.02 * n;
  const h = 0.1 + 0.015 * n;
  for (const y of [-h / 2, h / 2]) for (const z of [-w / 2, w / 2]) part(body, box(k, len, 0.014, 0.014), dark, [-0.05, y, z]);
  for (const x of spread(3 + n, len / 2)) {
    pair(w / 2, (z) => part(body, box(k, 0.014, h, 0.014), dark, [x - 0.05, 0, z]));
    pair(h / 2, (y) => part(body, box(k, 0.014, 0.014, w), dark, [x - 0.05, y, 0]));
  }
  part(body, box(k, len * 0.85, h * 0.5, w * 0.5), hull, [-0.05, 0, 0]);
  pair(w / 2, (z) => part(body, box(k, len * 0.9, 0.008, 0.008), trim, [-0.05, h / 2 + 0.006, z]));
  for (let i = 0; i < 1 + n; i++) {
    const x = 0.25 - i * (0.6 / (1 + n));
    const side = i % 3;
    const pos: [number, number, number] = side === 0 ? [x, h / 2 + 0.045, 0] : [x, 0, (side === 1 ? 1 : -1) * (w / 2 + 0.045)];
    part(body, box(k, 0.08, 0.08, 0.08), hull, pos);
  }
  if (n >= 1) pair(w / 2 + 0.05, (z) => part(body, tube(k, 0.032, 0.032, 0.28, 10), hull, [-0.12, -h * 0.2, z]));
  part(body, cone(k, 0.07, 0.07, 12), hull, [0.4, 0, 0]);
  part(body, ico(k, 0.025, 1), glass, [0.44, 0, 0]);
  if (n >= 3) turret(p, [0.1, h / 2 + 0.01, 0], 0.045);
  for (const y of spread(n < 2 ? 1 : 2, h * 0.3)) for (const z of spread(n < 4 ? 2 : 3, w * 0.35)) engine(p, [-0.52, y, z], 0.035, 0.05, 0.18);
};

/** Aggressive hulls with forward claws and spiked ridges. */
const fang: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  part(body, fuselage(k, "fang", [[-0.42, 0.07], [-0.2, 0.1], [0.1, 0.08], [0.3, 0.04], [0.42, 0]], 8), hull, [0, 0, 0], [0, 0, 0], [1, 0.7, 1]);
  const cz = 0.12 + 0.02 * n;
  part(body, box(k, 0.1, 0.025, cz * 2), dark, [0.02, 0, 0]);
  pair(cz, (z) => {
    part(body, cone(k, 0.035, 0.42, 5), hull, [0.24, 0, z], [0, 0.14 * Math.sign(z), 0]);
    part(body, box(k, 0.3, 0.006, 0.01), trim, [0.18, 0.03, z * 0.97], [0, 0.14 * Math.sign(z), 0]);
  });
  for (const x of spread(n + 2, 0.2)) part(body, cone(k, 0.022, 0.1, 4), dark, [x - 0.06, 0.07, 0], [0, 0, PI / 2 + 0.45]);
  if (n >= 2) part(body, slab(k, `fang-blade-${n}`, [[-0.05, 0], [-0.2, 0.28 + 0.03 * n], [-0.28, 0.28 + 0.03 * n], [-0.3, 0]], 0.015, 0.006), hull, [0, -0.02, 0]);
  if (n >= 3) pair(0.18, (z) => turret(p, [-0.15, -0.005, z], 0.03, false));
  part(body, box(k, 0.06, 0.012, 0.05), glass, [0.24, 0.032, 0]);
  pair(0.06, (z) => engine(p, [-0.48, 0, z], 0.045, 0.06, 0.24));
  if (n >= 3) engine(p, [-0.48, 0.05, 0], 0.035, 0.05, 0.2);
};

/** Elegant spires around shining orbs. */
const spire: Builder = (p, n) => {
  const { k, body, hull, trim, glass } = p;
  part(body, cone(k, 0.04, 0.55, 6), hull, [0.25, 0, 0]);
  part(body, tube(k, 0.04, 0.015, 0.4, 6), hull, [-0.3, 0, 0]);
  const orb = 0.12 + 0.01 * n;
  part(body, ico(k, orb, 3), glass);
  const spin = new THREE.Group();
  part(spin, torus(k, orb + 0.05, 0.009, 6, 48), trim, [0, 0, 0], [0, PI / 2, 0]);
  part(spin, torus(k, orb + 0.05, 0.009, 6, 48), trim, [0, 0, 0], [0, PI / 2 + PI / 2, 0], [1, 1, 1]);
  part(spin, torus(k, orb + 0.08, 0.006, 6, 48), hull, [0, 0, 0], [PI / 2, 0, 0]);
  body.add(spin);
  const fin = 0.14 + 0.025 * n;
  for (let i = 0; i < 3; i++) {
    const a = -PI / 2 + (i * 2 * PI) / 3;
    part(body, slab(k, `spire-fin-${n}`, [[-0.18, 0], [-0.38, fin], [-0.44, fin], [-0.42, 0]], 0.01, 0.005, false), hull, [0, 0, 0], [a, 0, 0]);
    if (n >= 3) part(body, ico(k, 0.035, 2), trim, [-0.41, -Math.sin(a) * fin, Math.cos(a) * fin]);
  }
  engine(p, [-0.53, 0, 0], 0.035, 0.05, 0.22);
  return { spin, spinAxis: "x" };
};

/** Segmented cylinders behind ringed, turning drill noses. */
const drill: Builder = (p, n) => {
  const { k, body, hull, dark, trim } = p;
  const r = 0.1 + 0.012 * n;
  const spin = new THREE.Group();
  spin.position.set(0.32, 0, 0);
  part(spin, cone(k, r, 0.32, 12), hull);
  for (let i = 0; i < 4; i++) part(spin, torus(k, r * (0.85 - i * 0.2), 0.009, 4, 20), trim, [-0.1 + i * 0.07, 0, 0], [0, PI / 2, 0]);
  body.add(spin);
  const segs = 2 + n;
  const segLen = 0.62 / segs;
  for (let i = 0; i < segs; i++) {
    const x = 0.14 - segLen * (i + 0.5);
    part(body, tube(k, r, r * 0.94, segLen * 0.86, 12), hull, [x, 0, 0]);
    part(body, torus(k, r * 0.97, 0.012, 6, 24), dark, [x - segLen / 2, 0, 0], [0, PI / 2, 0]);
  }
  pair(r + 0.008, (z) => part(body, box(k, 0.58, 0.05, 0.02), dark, [-0.17, -r * 0.35, z]));
  const count = 3 + Math.floor(n / 2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * PI * 2;
    engine(p, [-0.54, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55], 0.035, 0.05, 0.18);
  }
  return { spin, spinAxis: "x" };
};

/** Clusters of crystal shards. */
const shard: Builder = (p, n) => {
  const { k, body, hull, trim, glass } = p;
  part(body, oct(k, 0.2), hull, [0, 0, 0], [0, 0, 0], [2.4, 0.6, 0.6]);
  const count = 2 + 2 * n;
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996;
    const d = 0.1 + 0.05 * ((i * 7) % 3) + 0.01 * n;
    const size = 0.05 + 0.02 * ((i * 5) % 3);
    part(body, oct(k, size), i % 3 === 0 ? glass : hull,
      [0.22 - (i / count) * 0.55, Math.sin(a) * d * 0.7, Math.cos(a) * d], [a, 0, i % 2 ? 0.35 : -0.35], [2, 0.6, 0.6]);
  }
  for (let i = 0; i < 2 + n; i++) part(body, oct(k, 0.015), trim, [0.3 - i * 0.12, 0.1 + 0.02 * (i % 2), 0]);
  for (const z of spread(1 + Math.floor(n / 2), 0.05)) engine(p, [-0.46, 0, z], 0.035, 0.04, 0.2);
};

/** Smooth flat rays with long tails. */
const manta: Builder = (p, n) => {
  const { k, body, hull, dark, trim, glass } = p;
  const w = 0.02 * n;
  part(body, slab(k, `manta-${n}`, [
    [0.42, 0], [0.36, 0.08], [0.24, 0.2], [0.07, 0.32 + w * 0.6], [-0.05, 0.38 + w], [-0.13, 0.36 + w], [-0.2, 0.22], [-0.28, 0.1], [-0.32, 0],
  ], 0.035, 0.022), hull);
  part(body, ico(k, 0.12, 2), hull, [0.02, 0.03, 0], [0, 0, 0], [2, 0.45, 0.9]);
  pair(0.08, (z) => part(body, ico(k, 0.02, 1), glass, [0.3, 0.02, z]));
  part(body, cone(k, 0.018, 0.3, 5), dark, [-0.44, 0, 0], [0, PI, 0]);
  pair(0.07, (z) => part(body, slab(k, "manta-fin", [[-0.2, 0], [-0.3, 0.07], [-0.34, 0.07], [-0.32, 0]], 0.008, 0.003, false), dark, [0, 0.02, z], [-PI / 2 + 0.4 * Math.sign(z), 0, 0]));
  pair(1, (s) => {
    for (let i = 0; i < 2 + n; i++) part(body, ico(k, 0.011, 0), trim, [0.12 - i * 0.05, 0.022, s * (0.12 + i * 0.045)]);
  });
  if (n >= 4) turret(p, [0.12, 0.07, 0], 0.04);
  pair(0.08, (z) => engine(p, [-0.34, 0, z], 0.035, 0.05, 0.2));
  if (n >= 3) pair(0.16, (z) => engine(p, [-0.24, 0, z], 0.03, 0.04, 0.16));
};

export const STYLE_BUILDERS: Record<string, Builder> = {
  raptor, bulwark, shade, halo, hauler, hive, lattice, fang, spire, drill, shard, manta,
};
