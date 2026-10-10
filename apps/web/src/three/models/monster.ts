import * as THREE from "three";
import { seeded } from "../backdrop";
import { glowSpriteMaterial } from "../materials";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/**
 * A space creature: a lumpy, glistening carapace around a glowing core, with
 * tendrils that writhe behind it. Monsters ignore owner colours; they always
 * look alien. `size` is its radius in world units.
 */
export function buildMonster(k: ModelKit, size: number, seed: number): UnitModel {
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
