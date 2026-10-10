import * as THREE from "three";

/** Small seeded generator so backdrops look the same every time. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A shell of stars around the origin, with a few tinted ones and size variety. */
export function createStarfield(count: number, radius: number, seed = 7): THREE.Points {
  const rand = seeded(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tints = [[1, 1, 1], [0.75, 0.85, 1], [1, 0.9, 0.75], [1, 0.75, 0.7]];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = radius * (0.85 + rand() * 0.15);
    const q = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r], i * 3);
    const t = tints[rand() < 0.75 ? 0 : 1 + Math.floor(rand() * 3)]!;
    const b = 0.35 + Math.pow(rand(), 3) * 0.9;
    col.set([t[0]! * b, t[1]! * b, t[2]! * b], i * 3);
    size[i] = 1 + Math.pow(rand(), 6) * 3.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) }, uTime: { value: 0 }, uTwinkle: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      uniform float uTime;
      uniform float uTwinkle;
      void main() {
        vColor = color * (1.0 - uTwinkle * 0.35 * (0.5 + 0.5 * sin(uTime * 1.3 + position.x * 0.37 + position.z * 0.21)));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a, a);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

/**
 * A painted backdrop on a large plane far behind the scene, fading to black at
 * its edges so it blends into the star shell. Parallax comes free with the camera.
 */
export function createBackdropPlane(texture: THREE.Texture, width: number, height: number, opacity = 0.65): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float edge = smoothstep(0.5, 0.28, max(abs(c.x), abs(c.y) * 1.2));
        vec3 col = texture2D(map, vUv).rgb;
        gl_FragColor = vec4(col * uOpacity * edge, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = -20;
  return mesh;
}

/** A huge inside-out sphere with soft coloured nebula clouds, drawn behind everything. */
export function createNebulaSky(radius: number, colors: [THREE.ColorRepresentation, THREE.ColorRepresentation], seed = 3): THREE.Mesh {
  const rand = seeded(seed);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: new THREE.Color(colors[0]) },
      uB: { value: new THREE.Color(colors[1]) },
      uSeed: { value: rand() * 100 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uSeed;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + uSeed) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.2);
        float m = fbm(d * 4.0 + 7.0);
        float cloud = smoothstep(0.45, 0.85, n) * 0.55;
        vec3 col = mix(uA, uB, smoothstep(0.3, 0.7, m)) * cloud;
        col += vec3(0.01, 0.012, 0.025);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -30;
  return mesh;
}
