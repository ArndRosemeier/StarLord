import * as THREE from "three";

/**
 * A fixed-size pool of glowing, additive point particles. Bursts beyond the
 * capacity overwrite the oldest particles, so the cost never grows.
 */

export interface BurstOptions {
  count: number;
  colors: THREE.ColorRepresentation[];
  /** World units per second. */
  speed: number;
  /** Seconds. */
  life: [number, number];
  /** World units. */
  size: [number, number];
  /** Seconds to wait before showing up. */
  delay?: number;
  /** Fraction of speed kept per second (drag). */
  drag?: number;
  /** Squash the spread vertically (1 = sphere, 0 = flat disc). */
  flatten?: number;
  /** Extra velocity added to every particle. */
  drift?: THREE.Vector3;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private base: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private baseSize: Float32Array;
  private drag: Float32Array;
  private next = 0;
  private material: THREE.ShaderMaterial;
  private tmp = new THREE.Color();

  constructor(readonly capacity: number) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity).fill(1);
    this.max = new Float32Array(capacity).fill(1);
    this.baseSize = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * a * 1.6, a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Pixel scale for point sizes: the viewport height over the camera's vertical view. */
  setScale(viewportHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale!.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  burst(at: THREE.Vector3, o: BurstOptions): void {
    const flatten = o.flatten ?? 1;
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const v = o.speed * (0.25 + Math.random() * 0.9);
      this.vel[i * 3] = Math.cos(a) * q * v + (o.drift?.x ?? 0);
      this.vel[i * 3 + 1] = u * v * flatten + (o.drift?.y ?? 0);
      this.vel[i * 3 + 2] = Math.sin(a) * q * v + (o.drift?.z ?? 0);
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      this.tmp.set(o.colors[n % o.colors.length]!);
      this.base[i * 3] = this.tmp.r;
      this.base[i * 3 + 1] = this.tmp.g;
      this.base[i * 3 + 2] = this.tmp.b;
      this.max[i] = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.life[i] = -(o.delay ?? 0);
      this.baseSize[i] = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      this.drag[i] = o.drag ?? 0.15;
    }
  }

  clear(): void {
    this.life.fill(1);
    this.max.fill(1);
    this.size.fill(0);
    this.col.fill(0);
    this.flag();
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const max = this.max[i]!;
      let life = this.life[i]!;
      if (life >= max) {
        if (this.size[i] !== 0) this.size[i] = 0;
        continue;
      }
      life += dt;
      this.life[i] = life;
      if (life < 0) { this.size[i] = 0; continue; }
      const k = Math.pow(this.drag[i]!, dt);
      for (let j = 0; j < 3; j++) {
        this.vel[i * 3 + j]! *= k;
        this.pos[i * 3 + j]! += this.vel[i * 3 + j]! * dt;
      }
      const q = Math.min(1, life / max);
      const fade = 1 - q;
      this.col[i * 3] = this.base[i * 3]! * fade;
      this.col[i * 3 + 1] = this.base[i * 3 + 1]! * fade;
      this.col[i * 3 + 2] = this.base[i * 3 + 2]! * fade;
      this.size[i] = this.baseSize[i]! * (1 - q * 0.5);
    }
    this.flag();
  }

  private flag(): void {
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.color!.needsUpdate = true;
    g.attributes.size!.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
