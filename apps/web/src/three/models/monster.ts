import * as THREE from "three";
import { seeded } from "../backdrop";
import { glowSpriteMaterial } from "../materials";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";
import { MONSTER_COLORS, type MonsterSpecies } from "../../game/monsters";

/**
 * Space creatures, one look per kind so an eel reads as an eel: built
 * head-forward along +X, about one unit long, then scaled so `size` is the
 * radius in world units. Monsters ignore owner colours; each kind keeps its
 * own. A monster of unknown kind gets the generic creature.
 */
export function buildMonster(k: ModelKit, size: number, seed: number, species: MonsterSpecies | null = null): UnitModel {
  switch (species) {
    case "ionEel": return buildSerpent(k, size, seed, false);
    case "starWyrm": return buildSerpent(k, size, seed, true);
    case "voidAmoeba": return buildAmoeba(k, size, seed);
    case "latticeCrystal": return buildCrystal(k, size, seed);
    case "starHydra": return buildHydra(k, size, seed);
    case "guardian": return buildGuardian(k, size);
    default: return buildGeneric(k, size, seed);
  }
}

/** A lumpy, glistening carapace around a glowing core, with tendrils that writhe behind it. */
function buildGeneric(k: ModelKit, size: number, seed: number): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rand = seeded(seed * 7919 + 13);

  const geo = k.geo(`monster:${seed % 4}`, () => {
    const g = new THREE.IcosahedronGeometry(0.5, 2);
    const p = g.attributes.position!;
    const r = seeded((seed % 4) + 3);
    const bumps = Array.from({ length: 7 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      let s = 1;
      for (const b of bumps) s += Math.pow(Math.max(0, n.dot(b)), 6) * 0.35;
      v.multiplyScalar(s);
      v.x *= 1.35;
      p.setXYZ(i, v.x, v.y * 0.8, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0x5a1630, emissive: 0x6a0a2a, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.35, flatShading: true,
  });
  part(body, geo, skin);
  const eyes = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  for (const z of [-0.14, 0.14]) part(body, k.geo("monster:eye", () => new THREE.IcosahedronGeometry(0.05, 0)), eyes, [0.6, 0.1, z]);

  const core = new THREE.Sprite(glowSpriteMaterial(k.glow, 0xff3d6a, 0.9));
  core.scale.setScalar(1.6);
  body.add(core);

  const tendrils: THREE.Object3D[] = [];
  const tendrilMat = new THREE.MeshStandardMaterial({ color: 0x7a2050, emissive: 0x9a1a5a, emissiveIntensity: 0.6, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group();
    const a = (i / 6) * Math.PI * 2;
    pivot.position.set(-0.45, Math.cos(a) * 0.15, Math.sin(a) * 0.2);
    pivot.rotation.set(a, 0, 0);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.3, 0.1 + rand() * 0.1, 0),
      new THREE.Vector3(-0.6, -0.05, 0.1),
      new THREE.Vector3(-0.95, 0.12, 0),
    ]);
    part(pivot, k.geo(`monster:tendril:${i % 3}`, () => new THREE.TubeGeometry(curve, 16, 0.035, 5, false)), tendrilMat);
    body.add(pivot);
    tendrils.push(pivot);
  }
  body.scale.setScalar(size * 1.4);
  return {
    root, body, engines: [core],
    muzzle: new THREE.Vector3(size * 0.8, 0, 0),
    radius: size,
    height: size * 0.75,
    materials: materialsOf(root),
    animate(time, still) {
      if (still) return;
      tendrils.forEach((t, i) => {
        t.rotation.z = Math.sin(time * 2.1 + i * 1.3) * 0.35;
        t.rotation.y = Math.cos(time * 1.7 + i) * 0.25;
      });
      const beat = 1 + Math.sin(time * 4.5) * 0.04;
      body.scale.setScalar(size * 1.4 * beat);
      core.scale.setScalar(1.4 + Math.sin(time * 4.5) * 0.2);
    },
  };
}

const flesh = (c: { body: number; glow: number }, glow = 0.35) => new THREE.MeshStandardMaterial({
  color: c.body, emissive: c.glow, emissiveIntensity: glow, metalness: 0.2, roughness: 0.4, flatShading: true,
});

const glowSprite = (k: ModelKit, color: number, scale: number, opacity = 0.9) => {
  const s = new THREE.Sprite(glowSpriteMaterial(k.glow, color, opacity));
  s.scale.setScalar(scale);
  return s;
};

/** Models are built about one unit across; this fills `size` as the generic creature does. */
const SPECIES_SCALE = 1.3;

function finish(root: THREE.Group, body: THREE.Group, size: number, engines: THREE.Sprite[], animate: UnitModel["animate"]): UnitModel {
  body.scale.setScalar(size * SPECIES_SCALE);
  return {
    root, body, engines,
    muzzle: new THREE.Vector3(size * 0.7, 0, 0),
    radius: size,
    height: size * 0.6,
    materials: materialsOf(root),
    animate,
  };
}

/**
 * Ion eel (a long, thin, banded serpent wrapped in crackling sparks) or star
 * wyrm (a thicker, spined serpent with horns and beating wings). Both swim
 * with a wave running down the body.
 */
function buildSerpent(k: ModelKit, size: number, seed: number, wyrm: boolean): UnitModel {
  const c = MONSTER_COLORS[wyrm ? "starWyrm" : "ionEel"];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = flesh(c, wyrm ? 0.3 : 0.25);
  const band = new THREE.MeshBasicMaterial({ color: c.light });
  const n = wyrm ? 11 : 14;
  const seg = k.geo("monster:seg", () => new THREE.IcosahedronGeometry(0.5, 1));
  const segments: THREE.Group[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const t = i / (n - 1);
    const r = (wyrm ? 0.16 : 0.1) * (1 - t * 0.75) + 0.02;
    g.position.x = 0.55 - t * 1.45;
    part(g, seg, skin, [0, 0, 0], [0, 0, 0], [r * 3.2, r * 2, r * 2]);
    if (!wyrm && i % 2 === 1) part(g, seg, band, [0, r * 0.75, 0], [0, 0, 0], [r * 1.2, r * 0.5, r * 1.6]);
    if (wyrm && i < n - 2) part(g, k.geo("monster:spine", () => new THREE.ConeGeometry(0.5, 1, 4)), skin, [0, r * 1.05, 0], [0, 0, 0.3], [r * 0.6, r * 1.6, r * 0.6]);
    body.add(g);
    segments.push(g);
  }
  // Head: a longer snout with glowing eyes; the wyrm gets horns and a jaw.
  const head = segments[0]!;
  const hr = wyrm ? 0.2 : 0.13;
  part(head, seg, skin, [0.1, 0, 0], [0, 0, 0], [hr * 3.4, hr * 1.7, hr * 1.9]);
  const eye = new THREE.MeshBasicMaterial({ color: wyrm ? 0xffe04a : c.light });
  for (const z of [-1, 1]) {
    part(head, k.geo("monster:eye", () => new THREE.IcosahedronGeometry(0.05, 0)), eye, [0.2, hr * 0.45, z * hr * 0.55], [0, 0, 0], [1.2, 1.2, 1.2]);
    if (wyrm) part(head, k.geo("monster:horn", () => new THREE.ConeGeometry(0.04, 0.3, 5)), skin, [-0.02, hr * 0.8, z * hr * 0.5], [0, 0, 1.2]);
  }
  if (wyrm) part(head, seg, skin, [0.12, -hr * 0.55, 0], [0, 0, -0.15], [hr * 2.6, hr * 0.6, hr * 1.4]);
  // Wings for the wyrm: two thin membranes on the shoulders.
  const wings: THREE.Group[] = [];
  if (wyrm) {
    const wingGeo = k.geo("monster:wing", () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(-0.25, 0.75);
      shape.lineTo(-0.45, 0.55);
      shape.lineTo(-0.55, 0.62);
      shape.lineTo(-0.6, 0.25);
      shape.lineTo(-0.35, 0);
      return new THREE.ShapeGeometry(shape);
    });
    const membrane = new THREE.MeshStandardMaterial({ color: c.body, emissive: c.glow, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.6 });
    for (const zs of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.1, 0.05, zs * 0.08);
      const w = part(pivot, wingGeo, membrane);
      w.rotation.x = zs * Math.PI / 2;
      segments[2]!.add(pivot);
      wings.push(pivot);
    }
  }
  // The eel crackles: sparks that flicker along its length.
  const sparks: THREE.Sprite[] = [];
  const glows: THREE.Sprite[] = [];
  const rand = seeded(seed * 31 + 7);
  if (!wyrm) {
    for (let i = 0; i < 6; i++) {
      const s = glowSprite(k, c.glow, 0.35, 0.8);
      segments[1 + Math.floor(rand() * (n - 3))]!.add(s);
      s.position.set(0, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2);
      sparks.push(s);
    }
  } else {
    const fire = glowSprite(k, c.glow, 0.5, 0.7);
    fire.position.set(0.3, -0.03, 0);
    head.add(fire);
    glows.push(fire);
  }
  const speed = wyrm ? 2.4 : 3.6;
  return finish(root, body, size, [...sparks, ...glows], (time, still) => {
    if (still) return;
    segments.forEach((g, i) => {
      const amp = (wyrm ? 0.07 : 0.1) * (0.3 + i / n);
      g.position.z = Math.sin(time * speed - i * 0.7 + seed) * amp;
      g.position.y = Math.sin(time * speed * 0.5 - i * 0.5) * amp * 0.35;
      g.rotation.y = -Math.cos(time * speed - i * 0.7 + seed) * amp * 3;
    });
    wings.forEach((w, i) => { w.rotation.x = (i === 0 ? -1 : 1) * (0.2 + Math.sin(time * 3) * 0.45); });
    sparks.forEach((s, i) => {
      const on = Math.sin(time * 23 + i * 5.1) > 0.2;
      s.visible = on;
      s.scale.setScalar(0.25 + Math.abs(Math.sin(time * 17 + i)) * 0.25);
    });
    glows.forEach((g) => g.scale.setScalar(0.45 + Math.sin(time * 6) * 0.08));
  });
}

/** Void amoeba: a translucent, wobbling membrane around a dark nucleus and drifting vacuoles. */
function buildAmoeba(k: ModelKit, size: number, seed: number): UnitModel {
  const c = MONSTER_COLORS.voidAmoeba;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const membrane = new THREE.MeshBasicMaterial({ color: c.glow, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const skin = part(body, k.geo("monster:blob", () => new THREE.IcosahedronGeometry(0.6, 3)), membrane);
  part(body, k.geo("monster:nucleus", () => new THREE.IcosahedronGeometry(0.2, 2)), flesh({ body: 0x103020, glow: c.glow }, 0.5), [0.05, 0, 0]);
  const vac = flesh(c, 0.6);
  const rand = seeded(seed * 13 + 5);
  const bubbles: { m: THREE.Mesh; a: number; r: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const m = part(body, k.geo("monster:vacuole", () => new THREE.IcosahedronGeometry(0.06, 1)), vac);
    bubbles.push({ m, a: rand() * Math.PI * 2, r: 0.25 + rand() * 0.2 });
  }
  const core = glowSprite(k, c.glow, 1.6, 0.6);
  body.add(core);
  return finish(root, body, size, [core], (time, still) => {
    const t = still ? 0 : time;
    skin.scale.set(1 + Math.sin(t * 2.1) * 0.08, 0.85 + Math.sin(t * 1.7 + 1) * 0.08, 1 + Math.cos(t * 1.9) * 0.08);
    bubbles.forEach((b, i) => b.m.position.set(Math.cos(b.a + t * 0.6) * b.r, Math.sin(t * 0.9 + i) * 0.18, Math.sin(b.a + t * 0.6) * b.r));
  });
}

/** Lattice crystal: a cluster of long, glowing shards around a bright heart, turning slowly. */
function buildCrystal(k: ModelKit, size: number, seed: number): UnitModel {
  const c = MONSTER_COLORS.latticeCrystal;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shard = new THREE.MeshStandardMaterial({ color: c.body, emissive: c.glow, emissiveIntensity: 0.35, metalness: 0.1, roughness: 0.15, flatShading: true });
  const geo = k.geo("monster:shard", () => new THREE.OctahedronGeometry(0.5, 0));
  const rand = seeded(seed * 17 + 3);
  const cluster = new THREE.Group();
  body.add(cluster);
  for (let i = 0; i < 11; i++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const len = 0.45 + rand() * 0.55;
    const m = part(cluster, geo, shard, [0, 0, 0], [0, 0, 0], [0.16, len, 0.16]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.position.copy(dir.multiplyScalar(len * 0.35));
  }
  const heart = glowSprite(k, c.glow, 1.3, 0.85);
  body.add(heart);
  return finish(root, body, size, [heart], (time, still) => {
    if (still) return;
    cluster.rotation.y = time * 0.35;
    cluster.rotation.x = Math.sin(time * 0.4) * 0.3;
    heart.scale.setScalar(1.2 + Math.sin(time * 3) * 0.15);
  });
}

/** Star hydra: a heavy body with three long necks, each ending in a fanged, glowing-eyed head. */
function buildHydra(k: ModelKit, size: number, seed: number): UnitModel {
  const c = MONSTER_COLORS.starHydra;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = flesh(c, 0.3);
  const seg = k.geo("monster:seg", () => new THREE.IcosahedronGeometry(0.5, 1));
  part(body, seg, skin, [-0.25, 0, 0], [0, 0, 0], [0.9, 0.6, 0.7]);
  part(body, seg, skin, [-0.6, 0, 0], [0, 0, 0], [0.5, 0.25, 0.25]);
  const eye = new THREE.MeshBasicMaterial({ color: c.light });
  const necks: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0.05, 0, 0);
    pivot.rotation.set(0, (i - 1) * 0.55, 0);
    for (let j = 0; j < 5; j++) part(pivot, seg, skin, [0.1 + j * 0.1, j * 0.02, 0], [0, 0, 0], [0.12, 0.1, 0.1]);
    part(pivot, seg, skin, [0.62, 0.1, 0], [0, 0, -0.2], [0.24, 0.13, 0.15]);
    part(pivot, k.geo("monster:fang", () => new THREE.ConeGeometry(0.02, 0.1, 4)), eye, [0.72, 0.04, 0], [0, 0, Math.PI]);
    for (const z of [-0.04, 0.04]) part(pivot, k.geo("monster:eye", () => new THREE.IcosahedronGeometry(0.05, 0)), eye, [0.68, 0.14, z], [0, 0, 0], [0.6, 0.6, 0.6]);
    body.add(pivot);
    necks.push(pivot);
  }
  const breath = glowSprite(k, c.glow, 0.9, 0.5);
  breath.position.set(-0.2, 0, 0);
  body.add(breath);
  return finish(root, body, size, [breath], (time, still) => {
    if (still) return;
    necks.forEach((n, i) => {
      n.rotation.z = Math.sin(time * 1.8 + i * 2.1 + seed) * 0.25;
      n.rotation.y = (i - 1) * 0.55 + Math.cos(time * 1.3 + i * 1.7) * 0.15;
    });
  });
}

/** The Guardian: an armoured golden fortress with a burning eye, ringed by two counter-turning bands of weapons. */
function buildGuardian(k: ModelKit, size: number): UnitModel {
  const c = MONSTER_COLORS.guardian;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const plate = new THREE.MeshStandardMaterial({ color: c.light, emissive: c.body, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.35, flatShading: true });
  const dark = k.dark();
  const trim = new THREE.MeshBasicMaterial({ color: c.glow });
  part(body, k.geo("monster:guardianCore", () => new THREE.DodecahedronGeometry(0.42, 0)), plate);
  const spike = k.geo("monster:guardianSpike", () => new THREE.ConeGeometry(0.07, 0.4, 6));
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    const m = part(body, spike, dark);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z));
    m.position.set(x * 0.5, y * 0.5, z * 0.5);
  }
  const ringGeo = k.geo("monster:guardianRing", () => new THREE.TorusGeometry(0.62, 0.035, 6, 40));
  const ringA = part(body, ringGeo, plate, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const ringB = part(body, ringGeo, plate, [0, 0, 0], [Math.PI / 2 + 0.6, 0.4, 0], [0.85, 0.85, 0.85]);
  const node = k.geo("monster:guardianNode", () => new THREE.IcosahedronGeometry(0.045, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(ringA, node, trim, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0]);
  }
  part(body, k.geo("monster:eye", () => new THREE.IcosahedronGeometry(0.05, 0)), trim, [0.4, 0.02, 0], [0, 0, 0], [2.2, 2.2, 2.2]);
  const eye = glowSprite(k, c.glow, 0.7, 0.95);
  eye.position.set(0.45, 0.02, 0);
  const aura = glowSprite(k, c.glow, 2.2, 0.35);
  body.add(eye, aura);
  return finish(root, body, size, [eye, aura], (time, still) => {
    if (still) return;
    ringA.rotation.z = time * 0.6;
    ringB.rotation.z = -time * 0.45;
    eye.scale.setScalar(0.65 + Math.sin(time * 2.5) * 0.1);
  });
}
