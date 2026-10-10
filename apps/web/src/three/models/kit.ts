import * as THREE from "three";
import { glowTexture, type TextureCache } from "../assets";
import { accentColor, glowSpriteMaterial, hullTint } from "../materials";

/**
 * What procedural models are made of: shared textures, cached geometries and
 * per-model materials. A model is a `UnitModel`: a root to place and turn, an
 * inner body to bob, anchor points for weapons and engines, and its own
 * materials so it can fade without touching other models.
 */

export interface UnitModel {
  root: THREE.Group;
  body: THREE.Group;
  /** Rough radius in world units, for effects and picking. */
  radius: number;
  /** Height of the model's top above its root, for health bars. */
  height: number;
  /** Where shots leave from, in body space. */
  muzzle: THREE.Vector3;
  engines: THREE.Sprite[];
  materials: THREE.Material[];
  /** Per-frame animation (spinning rings, writhing tendrils). */
  animate(time: number, still: boolean): void;
}

export class ModelKit {
  readonly glow: THREE.Texture;
  readonly hullMap: THREE.Texture;
  readonly stationMap: THREE.Texture;
  private geometries = new Map<string, THREE.BufferGeometry>();

  constructor(readonly textures: TextureCache) {
    this.glow = textures.adopt("glow", () => glowTexture(64));
    this.hullMap = textures.get("textures/hull.webp", { repeat: [2, 1] });
    this.stationMap = textures.get("textures/station.webp", { repeat: [3, 1] });
  }

  /** A geometry shared by every model that asks for the same key. */
  geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) {
      g = make();
      this.geometries.set(key, g);
    }
    return g;
  }

  /** Painted hull plating in the owner's colour. */
  hull(owner: THREE.ColorRepresentation, map = this.hullMap): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: hullTint(owner),
      map,
      metalness: 0.55,
      roughness: 0.45,
      flatShading: true,
    });
  }

  /** Darker machinery: engines, pylons, turrets. */
  dark(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 0.7, roughness: 0.5, map: this.hullMap, flatShading: true });
  }

  /** Self-lit trim in the owner's colour. */
  accent(owner: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: accentColor(owner) });
  }

  engine(color: THREE.ColorRepresentation, scale: number): THREE.Sprite {
    const s = new THREE.Sprite(glowSpriteMaterial(this.glow, new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45), 0.9));
    s.scale.setScalar(scale);
    return s;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
  }
}

/** Adds a mesh to `parent` at a position, rotation and scale. */
export function part(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  parent.add(m);
  return m;
}

/** Collects the materials a model uses, without duplicates. */
export function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const set = new Set<THREE.Material>();
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => set.add(m));
    else if (mat) set.add(mat);
  });
  return [...set];
}

/** Disposes a model's own materials; geometries and textures are shared and belong to the kit. */
export function disposeModel(model: UnitModel): void {
  for (const m of model.materials) m.dispose();
  model.root.removeFromParent();
}
