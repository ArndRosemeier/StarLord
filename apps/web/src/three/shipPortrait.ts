import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { HullSize } from "@starlord/sim";
import { TextureCache } from "./assets";
import { ModelKit, disposeModel, type UnitModel } from "./models/kit";
import { buildShip, SHIP_LENGTH } from "./models/ships";
import { Stage } from "./stage";

/**
 * The battle ship models outside of battle: a turntable viewer for the ship
 * designer and small still portraits for lists. Both show the same model a
 * hull fights with, sized to fill the frame whatever the hull class.
 */

/** Length every hull is scaled to, so a frigate fills the frame like a titan. */
const FIT = 1.6;

/**
 * Studio lights carried by the camera, so the ship stays lit from the viewer's
 * upper left however it is turned: a warm key, a cool rim from behind and a soft fill.
 */
function addLights(scene: THREE.Scene, camera: THREE.Camera): void {
  scene.add(camera);
  camera.add(new THREE.HemisphereLight(0x9fb4e0, 0x1a1020, 0.9));
  const key = new THREE.DirectionalLight(0xfff1e0, 3.4);
  key.position.set(-3, 4, 2);
  camera.add(key);
  const rim = new THREE.DirectionalLight(0x7fb2ff, 3);
  rim.position.set(3, 1.5, -6);
  camera.add(rim);
}

/** Builds the hull's model scaled to `FIT` and centred on the origin. */
function fittedShip(kit: ModelKit, hull: HullSize, color: string): UnitModel {
  const model = buildShip(kit, hull, color);
  model.root.scale.setScalar(FIT / SHIP_LENGTH[hull]);
  model.root.updateMatrixWorld(true);
  // Engine glows are sprites; leave them out so the hull itself is centred.
  const box = new THREE.Box3();
  model.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, false);
  });
  if (!box.isEmpty()) model.root.position.sub(box.getCenter(new THREE.Vector3()));
  return model;
}

/** A slowly turning ship the player can drag around and zoom, on a see-through background. */
export class ShipViewer {
  private stage: Stage;
  private kit: ModelKit;
  private model: UnitModel | null = null;
  private key = "";
  private resume = 0;

  constructor(container: HTMLElement, hull: HullSize, color: string, private reduced: boolean) {
    this.stage = new Stage(container, {
      fov: 30, near: 0.05, far: 50, minDistance: 1.6, maxDistance: 7,
      minPolarAngle: 0.25, maxPolarAngle: Math.PI - 0.25, transparent: true,
    });
    this.kit = this.stage.own(new ModelKit(this.stage.textures));
    addLights(this.stage.scene, this.stage.camera);
    this.stage.useStudioEnvironment(0.6);
    this.stage.setHome(new THREE.Vector3(1.8, 1.15, 2.05), new THREE.Vector3());
    const controls = this.stage.controls;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 1.6;
    // Hold still while the player turns the ship, then pick the turntable up again.
    controls.addEventListener("start", this.onGrab);
    controls.addEventListener("end", this.onRelease);
    this.stage.onFrame((_dt, time) => {
      if (!this.model) return;
      this.model.animate(time, this.reduced);
      if (!this.reduced) this.model.body.position.y = Math.sin(time * 1.3) * 0.03;
    });
    this.setShip(hull, color);
    this.stage.start();
  }

  setShip(hull: HullSize, color: string): void {
    const key = `${hull}|${color}`;
    if (key === this.key) return;
    this.key = key;
    if (this.model) disposeModel(this.model);
    this.model = fittedShip(this.kit, hull, color);
    this.stage.scene.add(this.model.root);
  }

  private onGrab = () => {
    clearTimeout(this.resume);
    this.stage.controls.autoRotate = false;
  };

  private onRelease = () => {
    clearTimeout(this.resume);
    if (!this.reduced) this.resume = window.setTimeout(() => (this.stage.controls.autoRotate = true), 2500);
  };

  dispose(): void {
    clearTimeout(this.resume);
    this.stage.controls.removeEventListener("start", this.onGrab);
    this.stage.controls.removeEventListener("end", this.onRelease);
    this.model = null;
    this.stage.dispose();
  }
}

interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  kit: ModelKit;
  ready: Promise<void>;
}

let studio: Studio | null = null;
const portraits = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

/** One hidden renderer shared by every portrait, so lists do not each hold a WebGL context. */
function getStudio(): Studio {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.6;
  room.dispose();
  pmrem.dispose();
  // A three-quarter side view, nose to the right, like a ship card.
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(0.75, 1.2, 2.75);
  camera.lookAt(0, 0, 0);
  addLights(scene, camera);
  const textures = new TextureCache(4);
  const kit = new ModelKit(textures);
  studio = { renderer, scene, camera, kit, ready: textures.ready() };
  return studio;
}

/** A still image (data URL) of the hull's model in the owner's colour, `size` CSS pixels square. */
export function shipPortrait(hull: HullSize, color: string, size: number): Promise<string> {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const key = `${hull}|${color}|${size}|${ratio}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  // Portraits render one after another on the shared renderer.
  const job = queue.then(async () => {
    const s = getStudio();
    await s.ready;
    s.renderer.setPixelRatio(ratio);
    s.renderer.setSize(size, size, false);
    const model = fittedShip(s.kit, hull, color);
    s.scene.add(model.root);
    s.renderer.render(s.scene, s.camera);
    const url = s.renderer.domElement.toDataURL("image/png");
    disposeModel(model);
    return url;
  });
  queue = job.catch(() => undefined);
  portraits.set(key, job);
  job.catch(() => portraits.delete(key));
  return job;
}
