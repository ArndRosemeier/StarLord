import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { TextureCache } from "./assets";

/**
 * A reusable 3D viewport: renderer, scene, perspective camera with gentle
 * orbit/zoom controls, a resize-aware render loop and one place that frees
 * every GPU resource when the view goes away. Scenes (battles now, perhaps
 * the galaxy or planets later) add objects to `scene` and per-frame work
 * through `onFrame`.
 */

export interface StageOptions {
  /** Field of view in degrees. */
  fov?: number;
  near?: number;
  far?: number;
  /** Cap on the device pixel ratio, to keep fill rate sane on high-DPI screens. */
  maxPixelRatio?: number;
  /** Orbit limits; the camera always looks at `target`. */
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  /** Limits on turning left/right around the target, radians from the start angle. */
  azimuthRange?: number;
  /** See-through background, so the page shows behind the scene. */
  transparent?: boolean;
}

export type FrameCallback = (dt: number, time: number) => void;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly textures: TextureCache;
  /** Extra things to dispose that are not in the scene graph. */
  private owned: { dispose(): void }[] = [];
  private callbacks = new Set<FrameCallback>();
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private last = 0;
  private home = { position: new THREE.Vector3(0, 20, 20), target: new THREE.Vector3() };
  private shakeAmount = 0;
  private shakeOffset = new THREE.Vector3();
  private disposed = false;
  /** Pixel height of the drawing buffer, for size-attenuated point sprites. */
  viewportHeight = 1;

  constructor(readonly container: HTMLElement, opts: StageOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !!opts.transparent, powerPreference: "high-performance" });
    if (opts.transparent) this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(opts.maxPixelRatio ?? 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.textures = new TextureCache(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 40, 1, opts.near ?? 0.1, opts.far ?? 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.7;
    this.controls.minDistance = opts.minDistance ?? 5;
    this.controls.maxDistance = opts.maxDistance ?? 200;
    this.controls.minPolarAngle = opts.minPolarAngle ?? 0.15;
    this.controls.maxPolarAngle = opts.maxPolarAngle ?? Math.PI * 0.45;
    this.azimuthRange = opts.azimuthRange ?? Infinity;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.domElement.addEventListener("dblclick", this.onDoubleClick);
    this.renderer.domElement.addEventListener("pointerdown", this.onTapDown);
    this.renderer.domElement.addEventListener("pointerup", this.onTapUp);
  }

  /** Touch browsers do not all send dblclick, so a quick double tap stands in for it. */
  private tapDown: { x: number; y: number; t: number } | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private onTapDown = (e: PointerEvent) => {
    this.tapDown = e.pointerType === "mouse" || !e.isPrimary ? null : { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  private onTapUp = (e: PointerEvent) => {
    const down = this.tapDown;
    this.tapDown = null;
    const now = performance.now();
    if (!down || now - down.t > 300 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
    const prev = this.lastTap;
    this.lastTap = { x: e.clientX, y: e.clientY, t: now };
    if (prev && now - prev.t < 350 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      this.lastTap = null;
      this.renderer.domElement.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    }
  };

  private azimuthRange: number;

  /**
   * Soft studio reflections for metal surfaces (a prefiltered room scene), so
   * metallic hulls are not black where no light hits them directly.
   */
  useStudioEnvironment(intensity = 0.6): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = this.own(pmrem.fromScene(room, 0.04).texture);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = intensity;
  }

  /** Where the camera starts and returns to on double-click. */
  setHome(position: THREE.Vector3, target: THREE.Vector3): void {
    this.home = { position: position.clone(), target: target.clone() };
    this.resetCamera();
  }

  resetCamera(): void {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    if (Number.isFinite(this.azimuthRange)) {
      const offset = this.home.position.clone().sub(this.home.target);
      const az = Math.atan2(offset.x, offset.z);
      this.controls.minAzimuthAngle = az - this.azimuthRange;
      this.controls.maxAzimuthAngle = az + this.azimuthRange;
    }
    this.controls.update();
  }

  private onDoubleClick = () => this.resetCamera();

  /** A brief camera shake, e.g. for an explosion. Callers skip it under reduced motion. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  onFrame(cb: FrameCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /** Disposes `thing` with the stage. */
  own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  start(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      // rAF timestamps and performance.now() need not share an origin, so never step backwards.
      const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
      this.last = t;
      this.camera.position.sub(this.shakeOffset);
      this.controls.update();
      for (const cb of this.callbacks) cb(dt, t / 1000);
      if (this.shakeAmount > 0.01) {
        this.shakeOffset.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shakeAmount);
        this.shakeAmount *= Math.pow(0.02, dt);
      } else this.shakeOffset.set(0, 0, 0);
      this.camera.position.add(this.shakeOffset);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Renders one frame now, e.g. for a still frame while the loop is stopped. */
  renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewportHeight = h * this.renderer.getPixelRatio();
  }

  /** World position to CSS pixels inside the container; null when behind the camera. */
  project(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    out.set((v.x * 0.5 + 0.5) * this.container.clientWidth, (-v.y * 0.5 + 0.5) * this.container.clientHeight);
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.callbacks.clear();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("dblclick", this.onDoubleClick);
    this.renderer.domElement.removeEventListener("pointerdown", this.onTapDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onTapUp);
    this.controls.dispose();
    disposeObject(this.scene);
    for (const o of this.owned) o.dispose();
    this.owned = [];
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** Frees the geometries and materials (and their textures) of an object tree. */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geometries.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => materials.add(x));
    else if (mat) materials.add(mat);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    if (m instanceof THREE.ShaderMaterial) {
      for (const u of Object.values(m.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
    }
    m.dispose();
  }
}
