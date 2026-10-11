import * as THREE from "three";
import { fresnelMaterial, glowSpriteMaterial } from "../materials";
import { materialsOf, part, type ModelKit, type UnitModel } from "./kit";

/**
 * A star as the centrepiece of a system: a boiling, limb-darkened surface,
 * a hot rim and layered corona glows. Black holes get a dark core with a
 * swirling accretion disc instead.
 */

const SURFACE_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const NOISE = /* glsl */ `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; } return v; }`;

const SURFACE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vV;
  ${NOISE}
  void main() {
    vec3 p = normalize(vPos) * 3.0;
    float n = fbm(p + vec3(uTime * 0.05, uTime * 0.03, 0.0));
    float cells = fbm(p * 3.0 - vec3(0.0, uTime * 0.08, uTime * 0.04));
    float heat = 0.55 + 0.6 * n + 0.35 * cells;
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    float limb = 0.45 + 0.55 * pow(mu, 0.45);
    vec3 hot = mix(uColor, vec3(1.0), 0.55);
    vec3 col = mix(uColor * 0.55, hot, smoothstep(0.75, 1.35, heat)) * heat * limb * 1.3;
    gl_FragColor = vec4(col, 1.0);
  }`;

const DISC_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x);
    float band = smoothstep(0.42, 0.5, r) * smoothstep(1.0, 0.62, r);
    // Sample around the circle (not by raw angle) so there is no seam where the angle wraps.
    float b = a - uTime * 0.25 + r * 2.5;
    float swirl = fbm(vec3(cos(b) * 3.0, sin(b) * 3.0, r * 7.0));
    vec3 col = mix(uInner, uOuter, smoothstep(0.45, 1.0, r)) * (0.6 + swirl);
    float alpha = band * (0.55 + 0.45 * swirl);
    gl_FragColor = vec4(col * alpha, alpha);
  }`;

export function buildStar(k: ModelKit, color: THREE.ColorRepresentation, radius: number, blackHole = false): UnitModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tint = new THREE.Color(color);
  const sphere = k.geo("star:sphere", () => new THREE.SphereGeometry(1, 64, 32));
  const timed: THREE.ShaderMaterial[] = [];
  const glows: THREE.Sprite[] = [];

  if (blackHole) {
    part(body, sphere, new THREE.MeshBasicMaterial({ color: 0x000000 }), [0, 0, 0], [0, 0, 0], [radius * 0.7, radius * 0.7, radius * 0.7]);
    part(body, sphere, fresnelMaterial(0xb48cff, 2.2, 1.6), [0, 0, 0], [0, 0, 0], [radius * 0.75, radius * 0.75, radius * 0.75]);
    const disc = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uInner: { value: new THREE.Color(0xffd9a0) }, uOuter: { value: new THREE.Color(0x7a4dff) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: DISC_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    timed.push(disc);
    part(body, k.geo("star:disc", () => new THREE.PlaneGeometry(2, 2)), disc, [0, 0, 0], [-Math.PI / 2 + 0.18, 0, 0], [radius * 3.2, radius * 3.2, 1]);
    const halo = new THREE.Sprite(glowSpriteMaterial(k.glow, 0x7a4dff, 0.5));
    halo.scale.setScalar(radius * 6);
    body.add(halo);
    glows.push(halo);
  } else {
    const surface = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: tint.clone() }, uTime: { value: 0 } },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
    });
    timed.push(surface);
    part(body, sphere, surface, [0, 0, 0], [0, 0, 0], [radius, radius, radius]);
    part(body, sphere, fresnelMaterial(tint.clone().lerp(new THREE.Color(0xffffff), 0.3), 1.6, 1.3), [0, 0, 0], [0, 0, 0], [radius * 1.06, radius * 1.06, radius * 1.06]);
    for (const [scale, opacity] of [[3.0, 0.75], [6.5, 0.32], [13, 0.12]] as const) {
      const s = new THREE.Sprite(glowSpriteMaterial(k.glow, tint, opacity));
      s.scale.setScalar(radius * scale);
      body.add(s);
      glows.push(s);
    }
  }

  const base = glows.map((g) => g.material.opacity);
  return {
    root, body, engines: [],
    muzzle: new THREE.Vector3(),
    radius,
    height: radius,
    materials: materialsOf(root),
    animate(time, still) {
      const t = still ? 0 : time;
      for (const m of timed) m.uniforms.uTime!.value = t;
      if (still) return;
      // A slow breathing of the corona.
      glows.forEach((g, i) => (g.material.opacity = base[i]! * (1 + Math.sin(time * (0.7 + i * 0.3) + i) * 0.06)));
    },
  };
}
