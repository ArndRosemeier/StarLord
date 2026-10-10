import * as THREE from "three";
import { fresnelMaterial, accentColor } from "../materials";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/** Atmosphere tint and fallback surface colour per planet type. */
const LOOK: Record<string, { surface: number; air: number | null }> = {
  gaia: { surface: 0x3f9d5a, air: 0x7fd0ff },
  terran: { surface: 0x3a6fa8, air: 0x7fb8ff },
  ocean: { surface: 0x1f4f9a, air: 0x7fb8ff },
  swamp: { surface: 0x5b6a2a, air: 0xb8d070 },
  arid: { surface: 0xb08a50, air: 0xffd8a0 },
  tundra: { surface: 0xc8d8e8, air: 0xbfe0ff },
  desert: { surface: 0xc0662a, air: 0xffb070 },
  barren: { surface: 0x7a7a7a, air: null },
  radiated: { surface: 0x40303a, air: 0xb070ff },
  toxic: { surface: 0xa8b030, air: 0xd8ff60 },
  inferno: { surface: 0x401a10, air: 0xff7030 },
  asteroids: { surface: 0x6a5e50, air: null },
  gasGiant: { surface: 0xd0a070, air: 0xffd0a0 },
};

/**
 * A textured planet with an atmosphere rim and, when it is defended, a thin
 * orbital defence ring in the owner's colour. `radius` is in world units.
 */
export function buildPlanet(k: ModelKit, type: string, radius: number, owner: THREE.ColorRepresentation | null): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const look = LOOK[type] ?? LOOK.terran!;
  const surface = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.1 });
  surface.map = k.textures.get(`textures/planets/${type}.webp`, {
    onError: () => {
      surface.map = null;
      surface.color.set(look.surface);
      surface.needsUpdate = true;
    },
  });
  const globe = part(body, k.geo("planet:sphere", () => new THREE.SphereGeometry(1, 64, 32)), surface, [0, 0, 0], [0.35, 0, 0.15], [radius, radius, radius]);
  if (look.air !== null) {
    part(body, k.geo("planet:sphere", () => new THREE.SphereGeometry(1, 64, 32)), fresnelMaterial(look.air, 3, 1.4), [0, 0, 0], [0, 0, 0], [radius * 1.04, radius * 1.04, radius * 1.04]);
  }
  let ring: THREE.Object3D | null = null;
  if (owner !== null) {
    const trim = new THREE.MeshBasicMaterial({ color: accentColor(owner), transparent: true, opacity: 0.75 });
    ring = part(body, k.geo("planet:ring", () => new THREE.TorusGeometry(1, 0.006, 4, 96)), trim, [0, 0, 0], [Math.PI / 2 - 0.25, 0, 0.1], [radius * 1.35, radius * 1.35, radius * 1.35]);
  }
  return {
    root, body, engines: [],
    muzzle: new THREE.Vector3(),
    radius,
    height: radius,
    materials: materialsOf(root),
    animate(time, still) {
      if (still) return;
      globe.rotation.y = time * 0.03;
      if (ring) ring.rotation.z = 0.1 + time * 0.05;
    },
  };
}
