import * as THREE from "three";
import { hullTint } from "../materials";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/**
 * Orbital stations: a spindle with one habitat ring for the smallest tier, a
 * double-ringed spindle with pods for the middle one, and a great fortress
 * wheel with gun arms and spires for the largest. Rings turn slowly.
 */

export type StationTierId = "starBase" | "battlestation" | "starFortress";

/** Outer radius in world units. */
export const STATION_RADIUS: Record<StationTierId, number> = { starBase: 1, battlestation: 1.35, starFortress: 1.8 };

const PI = Math.PI;

export function buildStation(k: ModelKit, tier: StationTierId, owner: THREE.ColorRepresentation): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hull = k.hull(owner);
  const lit = new THREE.MeshStandardMaterial({
    color: hullTint(owner, 0.3), map: k.stationMap, emissive: 0xffffff, emissiveMap: k.stationMap, emissiveIntensity: 0.55,
    metalness: 0.5, roughness: 0.5, flatShading: true,
  });
  const dark = k.dark();
  const trim = k.accent(owner);
  const spinners: { obj: THREE.Object3D; speed: number }[] = [];
  const g = (key: string, make: () => THREE.BufferGeometry) => k.geo(`station:${key}`, make);

  const spindle = (h: number, r: number) => {
    part(body, g(`spindle:${h}:${r}`, () => new THREE.CylinderGeometry(r, r, h, 10)), lit);
    part(body, g(`cap:${r}`, () => new THREE.ConeGeometry(r * 1.05, r * 2.2, 10)), hull, [0, h / 2 + r * 1.1, 0]);
    part(body, g(`cap:${r}`, () => new THREE.ConeGeometry(r * 1.05, r * 2.2, 10)), hull, [0, -h / 2 - r * 1.1, 0], [PI, 0, 0]);
    part(body, g(`antenna`, () => new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4)), dark, [0, h / 2 + r * 2.2 + 0.15, 0]);
  };
  const ring = (radius: number, tubeR: number, y: number, spokes: number, speed: number) => {
    const wheel = new THREE.Group();
    wheel.position.y = y;
    part(wheel, g(`ring:${radius}:${tubeR}`, () => new THREE.TorusGeometry(radius, tubeR, 8, 48)), lit, [0, 0, 0], [PI / 2, 0, 0]);
    part(wheel, g(`ringtrim:${radius}:${tubeR}`, () => new THREE.TorusGeometry(radius, tubeR * 0.25, 4, 48)), trim, [0, tubeR * 0.9, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * PI * 2;
      part(wheel, g(`spoke:${radius}`, () => new THREE.BoxGeometry(radius, 0.03, 0.04)), dark, [Math.cos(a) * radius / 2, 0, Math.sin(a) * radius / 2], [0, -a, 0]);
    }
    body.add(wheel);
    spinners.push({ obj: wheel, speed });
  };

  switch (tier) {
    case "starBase": {
      spindle(0.7, 0.12);
      ring(0.55, 0.06, 0, 4, 0.25);
      for (const a of [0, PI]) part(body, g("dock", () => new THREE.BoxGeometry(0.22, 0.05, 0.05)), dark, [Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2], [0, a, 0]);
      break;
    }
    case "battlestation": {
      spindle(1.0, 0.15);
      ring(0.8, 0.07, 0.12, 6, 0.2);
      ring(0.55, 0.05, -0.22, 4, -0.3);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        part(body, g("pod", () => new THREE.IcosahedronGeometry(0.11, 0)), hull, [Math.cos(a) * 0.32, 0.4, Math.sin(a) * 0.32]);
        part(body, g("podglow", () => new THREE.IcosahedronGeometry(0.035, 0)), trim, [Math.cos(a) * 0.32, 0.5, Math.sin(a) * 0.32]);
      }
      break;
    }
    case "starFortress": {
      part(body, g("core", () => new THREE.IcosahedronGeometry(0.38, 1)), lit);
      part(body, g("coretrim", () => new THREE.TorusGeometry(0.4, 0.025, 4, 32)), trim, [0, 0, 0], [PI / 2, 0, 0]);
      for (const s of [1, -1]) {
        part(body, g("spire", () => new THREE.ConeGeometry(0.12, 0.8, 6)), hull, [0, s * 0.72, 0], [s > 0 ? 0 : PI, 0, 0]);
      }
      ring(1.3, 0.11, 0, 6, 0.12);
      const tilt = new THREE.Group();
      tilt.rotation.x = 0.35;
      part(tilt, g("halo", () => new THREE.TorusGeometry(0.85, 0.03, 4, 48)), trim, [0, 0, 0], [PI / 2, 0, 0]);
      body.add(tilt);
      spinners.push({ obj: tilt, speed: -0.4 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        part(body, g("arm", () => new THREE.BoxGeometry(0.5, 0.06, 0.08)), dark, [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], [0, -a, 0]);
        part(body, g("gun", () => new THREE.BoxGeometry(0.14, 0.12, 0.14)), hull, [Math.cos(a) * 0.9, 0.08, Math.sin(a) * 0.9], [0, -a, 0]);
      }
      break;
    }
  }

  const beacon = k.engine(owner, 0.35);
  beacon.position.y = tier === "starFortress" ? 1.15 : tier === "battlestation" ? 0.85 : 0.65;
  body.add(beacon);
  const radius = STATION_RADIUS[tier];
  body.scale.setScalar(radius / (tier === "starFortress" ? 1.4 : tier === "battlestation" ? 0.87 : 0.61));
  return {
    root, body, engines: [beacon],
    muzzle: new THREE.Vector3(0, 0.1, 0),
    radius,
    height: beacon.position.y * body.scale.x * 0.8,
    materials: materialsOf(root),
    animate(time, still) {
      if (still) return;
      for (const s of spinners) s.obj.rotation.y = time * s.speed;
    },
  };
}
