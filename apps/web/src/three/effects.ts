import * as THREE from "three";
import { fresnelMaterial, glowSpriteMaterial } from "./materials";
import { ParticleSystem, type BurstOptions } from "./particles";

/**
 * Pooled combat effects: beams, projectiles with trails, shield flashes,
 * shockwave rings, light flashes, tumbling debris and particles. Every pool
 * has a fixed size, so a busy battle never allocates more.
 */

const UP = new THREE.Vector3(0, 1, 0);
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

interface Timed {
  t: number;
  life: number;
  delay: number;
}

interface Beam extends Timed { core: THREE.Mesh; glow: THREE.Mesh; tip: THREE.Sprite; strength: number }
interface Projectile extends Timed { head: THREE.Sprite; trail: THREE.Sprite[]; from: THREE.Vector3; to: THREE.Vector3; arc: number }
interface Shield extends Timed { mesh: THREE.Mesh; strength: number }
interface Ring extends Timed { mesh: THREE.Mesh; size: number }
interface Flash extends Timed { sprite: THREE.Sprite; size: number }
interface Debris extends Timed { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; size: number }

export interface EffectsOptions {
  particleCapacity: number;
}

export class EffectsLayer {
  readonly group = new THREE.Group();
  readonly particles: ParticleSystem;
  private beams: Beam[] = [];
  private projectiles: Projectile[] = [];
  private shields: Shield[] = [];
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private debris: Debris[] = [];
  private light = new THREE.PointLight(0xffb070, 0, 30, 1.6);
  private lightT = 0;
  private owned: { dispose(): void }[] = [];

  constructor(private glow: THREE.Texture, opts: EffectsOptions) {
    this.particles = new ParticleSystem(opts.particleCapacity);
    this.group.add(this.particles.points, this.light);
    this.owned.push(this.particles);

    const beamGeo = this.own(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0));
    for (let i = 0; i < 8; i++) {
      const core = new THREE.Mesh(beamGeo, this.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      const glowMesh = new THREE.Mesh(beamGeo, this.own(new THREE.MeshBasicMaterial({ color: 0xff4a5a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      const tip = new THREE.Sprite(this.own(glowSpriteMaterial(glow, 0xffffff)));
      for (const o of [core, glowMesh, tip]) { o.visible = false; o.renderOrder = 6; this.group.add(o); }
      this.beams.push({ core, glow: glowMesh, tip, t: 1, life: 1, delay: 0, strength: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const head = new THREE.Sprite(this.own(glowSpriteMaterial(glow, 0xffd32a)));
      const trail = Array.from({ length: 6 }, () => new THREE.Sprite(this.own(glowSpriteMaterial(glow, 0xffd32a, 0.6))));
      for (const o of [head, ...trail]) { o.visible = false; o.renderOrder = 6; this.group.add(o); }
      this.projectiles.push({ head, trail, from: new THREE.Vector3(), to: new THREE.Vector3(), arc: 0, t: 1, life: 1, delay: 0 });
    }
    const shieldGeo = this.own(new THREE.IcosahedronGeometry(1, 3));
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(shieldGeo, this.own(fresnelMaterial(0x6fd6ff, 1.6, 0)));
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.shields.push({ mesh, t: 1, life: 1, delay: 0, strength: 1 });
    }
    const ringGeo = this.own(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(ringGeo, this.own(new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 1, life: 1, delay: 0, size: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(this.own(glowSpriteMaterial(glow, 0xfff0c8)));
      sprite.visible = false;
      sprite.renderOrder = 8;
      this.group.add(sprite);
      this.flashes.push({ sprite, t: 1, life: 1, delay: 0, size: 1 });
    }
    const debrisGeo = this.own(new THREE.TetrahedronGeometry(1, 0));
    const debrisMat = this.own(new THREE.MeshStandardMaterial({ color: 0x4a4f5a, emissive: 0xff5a1a, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.4, flatShading: true }));
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(debrisGeo, debrisMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.debris.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 1, life: 1, delay: 0, size: 1 });
    }
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.owned.push(x);
    return x;
  }

  /** The least busy item of a pool: a free one, else the oldest. */
  private pick<T extends Timed>(pool: T[]): T {
    let best = pool[0]!;
    for (const p of pool) {
      if (p.t >= p.life + p.delay) return p;
      if (p.t / (p.life + p.delay) > best.t / (best.life + best.delay)) best = p;
    }
    return best;
  }

  setParticleScale(viewportHeight: number, fov: number): void {
    this.particles.setScale(viewportHeight, fov);
  }

  burst(at: THREE.Vector3, o: BurstOptions): void {
    this.particles.burst(at, o);
  }

  /** A beam from `a` to `b`: a white core inside a coloured glow, fading over `life` seconds. */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, width: number, life: number, strength = 1): void {
    const beam = this.pick(this.beams);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    for (const [mesh, r] of [[beam.core, width * 0.25], [beam.glow, width]] as const) {
      mesh.position.copy(a);
      mesh.quaternion.copy(q);
      mesh.scale.set(r, len, r);
      mesh.visible = true;
    }
    (beam.glow.material as THREE.MeshBasicMaterial).color.set(color);
    beam.tip.position.copy(b);
    beam.tip.scale.setScalar(width * 6);
    (beam.tip.material as THREE.SpriteMaterial).color.set(color).lerp(new THREE.Color(0xffffff), 0.4);
    beam.tip.visible = true;
    Object.assign(beam, { t: 0, life, delay: 0, strength });
  }

  /** A glowing round flying from `a` to `b` over `life` seconds along a shallow arc. */
  projectile(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, size: number, life: number): void {
    const p = this.pick(this.projectiles);
    p.from.copy(a);
    p.to.copy(b);
    p.arc = Math.min(1.5, a.distanceTo(b) * 0.08);
    (p.head.material as THREE.SpriteMaterial).color.set(color);
    p.head.scale.setScalar(size);
    p.trail.forEach((s, i) => {
      (s.material as THREE.SpriteMaterial).color.set(color);
      s.scale.setScalar(size * (0.8 - i * 0.11));
    });
    Object.assign(p, { t: 0, life, delay: 0 });
  }

  /** A bubble that lights up around `at` when shields soak a hit. */
  shield(at: THREE.Vector3, radius: number, strength: number, delay = 0): void {
    const s = this.pick(this.shields);
    s.mesh.position.copy(at);
    s.mesh.scale.setScalar(radius);
    s.mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    Object.assign(s, { t: 0, life: 0.55, delay, strength: Math.min(1.6, 0.6 + strength) });
  }

  /** An expanding ring flat on the battlefield. */
  shockwave(at: THREE.Vector3, size: number, color: THREE.ColorRepresentation, life = 0.7, delay = 0): void {
    const r = this.pick(this.rings);
    r.mesh.position.copy(at);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    Object.assign(r, { t: 0, life, delay, size });
  }

  /** A bright sprite that swells and fades. */
  flash(at: THREE.Vector3, size: number, color: THREE.ColorRepresentation, life = 0.35, delay = 0): void {
    const f = this.pick(this.flashes);
    f.sprite.position.copy(at);
    (f.sprite.material as THREE.SpriteMaterial).color.set(color);
    Object.assign(f, { t: 0, life, delay, size });
  }

  /** Lights the surroundings briefly, e.g. for an explosion. */
  lightFlash(at: THREE.Vector3, intensity: number): void {
    this.light.position.copy(at).add(new THREE.Vector3(0, 1, 0));
    this.light.intensity = intensity;
    this.lightT = 1;
  }

  /** Tumbling hull fragments thrown outward. */
  scatter(at: THREE.Vector3, count: number, size: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const d = this.pick(this.debris);
      d.mesh.position.copy(at);
      d.vel.set(Math.random() - 0.5, (Math.random() - 0.3) * 0.6, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      d.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      Object.assign(d, { t: 0, life: 1.4 + Math.random(), delay: 0, size: size * (0.5 + Math.random()) });
    }
  }

  clear(): void {
    for (const pool of [this.beams, this.projectiles, this.shields, this.rings, this.flashes, this.debris] as Timed[][]) {
      for (const p of pool) p.t = p.life + p.delay;
    }
    this.particles.clear();
    this.light.intensity = 0;
    this.update(0);
  }

  update(dt: number): void {
    this.particles.update(dt);
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt * 2.5);
      this.light.intensity *= this.lightT > 0 ? Math.pow(0.01, dt) : 0;
    }
    for (const b of this.beams) {
      b.t += dt;
      const on = b.t < b.life;
      b.core.visible = b.glow.visible = b.tip.visible = on;
      if (!on) continue;
      const fade = 1 - b.t / b.life;
      (b.core.material as THREE.MeshBasicMaterial).opacity = fade * b.strength;
      (b.glow.material as THREE.MeshBasicMaterial).opacity = fade * 0.55 * b.strength;
      (b.tip.material as THREE.SpriteMaterial).opacity = fade * b.strength;
    }
    for (const p of this.projectiles) {
      p.t += dt;
      const on = p.t < p.life;
      p.head.visible = on;
      p.trail.forEach((s) => (s.visible = on));
      if (!on) continue;
      const at = (k: number) => {
        const e = ease(Math.max(0, Math.min(1, k)));
        return p.from.clone().lerp(p.to, e).add(new THREE.Vector3(0, Math.sin(e * Math.PI) * p.arc, 0));
      };
      const k = p.t / p.life;
      p.head.position.copy(at(k));
      p.trail.forEach((s, i) => s.position.copy(at(k - (i + 1) * 0.06)));
    }
    for (const s of this.shields) {
      s.t += dt;
      const live = s.t < s.life + s.delay && s.t >= s.delay;
      s.mesh.visible = live;
      if (!live) continue;
      const q = (s.t - s.delay) / s.life;
      (s.mesh.material as THREE.ShaderMaterial).uniforms.uIntensity!.value = (1 - q) * s.strength * 1.8;
    }
    for (const r of this.rings) {
      r.t += dt;
      const live = r.t < r.life + r.delay && r.t >= r.delay;
      r.mesh.visible = live;
      if (!live) continue;
      const q = (r.t - r.delay) / r.life;
      r.mesh.scale.setScalar(Math.max(0.01, r.size * ease(q)));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - q) * 0.9;
    }
    for (const f of this.flashes) {
      f.t += dt;
      const live = f.t < f.life + f.delay && f.t >= f.delay;
      f.sprite.visible = live;
      if (!live) continue;
      const q = (f.t - f.delay) / f.life;
      f.sprite.scale.setScalar(f.size * (0.4 + ease(Math.min(1, q * 2)) * 0.6));
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - q) * (1 - q);
    }
    for (const d of this.debris) {
      d.t += dt;
      const live = d.t < d.life;
      d.mesh.visible = live;
      if (!live) continue;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(Math.pow(0.5, dt));
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.scale.setScalar(d.size * (1 - d.t / d.life));
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned = [];
    this.group.removeFromParent();
  }
}
