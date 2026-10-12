import * as THREE from "three";
import { TextureCache } from "../three/assets";
import { ModelKit } from "../three/models/kit";
import { buildMonster } from "../three/models/monster";
import type { MonsterSpecies } from "../game/monsters";

/**
 * Development page for the monster models (dev server only: /dev/monsters.html):
 * one of every kind side by side, animating, with the generic creature last.
 * `?still` freezes them.
 */

const kinds: (MonsterSpecies | null)[] = ["ionEel", "starWyrm", "voidAmoeba", "latticeCrystal", "starHydra", "guardian", null];
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById("root")!.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a14);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);
const kit = new ModelKit(new TextureCache());
const models = kinds.map((kind, i) => {
  const m = buildMonster(kit, 0.9, i, kind);
  m.root.position.set(((i % 4) - 1.5) * 2.6, 0, Math.floor(i / 4) * 2.6 - 1.3);
  m.root.rotation.y = 0.5;
  scene.add(m.root);
  const label = document.createElement("div");
  label.textContent = kind ?? "generic";
  Object.assign(label.style, { position: "absolute", color: "#cde", font: "14px sans-serif" });
  document.body.appendChild(label);
  return { m, label };
});
const still = location.search.includes("still");
renderer.setAnimationLoop((t) => {
  for (const { m, label } of models) {
    m.animate(t / 1000, still);
    const p = m.root.position.clone().add(new THREE.Vector3(0, -1.1, 0)).project(camera);
    label.style.left = `${(p.x + 1) / 2 * innerWidth - 30}px`;
    label.style.top = `${(1 - p.y) / 2 * innerHeight}px`;
  }
  renderer.render(scene, camera);
});
