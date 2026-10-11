import * as THREE from "three";
import { seeded } from "../backdrop";
import type { ModelKit } from "./kit";

/**
 * Rock fields and planetary rings for system views: an asteroid belt is one
 * instanced mesh of tumbling rocks around a circle, and ring systems are a
 * banded, see-through disc around a planet.
 */

export interface AsteroidBelt {
  mesh: THREE.InstancedMesh;
  /** Turns the belt slowly; rocks keep their own tumble. */
  animate(time: number, still: boolean): void;
}

export function buildAsteroidBelt(k: ModelKit, radius: number, width: number, count: number, seed: number): AsteroidBelt {
  const rand = seeded(seed);
  const geo = k.geo("belt:rock", () => {
    // A lumpy rock: an icosphere pushed in and out at random.
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const r = seeded(11);
    const v = new THREE.Vector3();
    const bumps = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let b = bumps.get(key);
      if (b === undefined) bumps.set(key, (b = 0.7 + r() * 0.5));
      v.multiplyScalar(b);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb0a090,
    map: k.textures.get("textures/planets/asteroids.webp"),
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rocks: { a: number; r: number; y: number; s: number; spin: THREE.Euler; rate: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    // Denser toward the belt's middle line.
    const off = (rand() + rand() + rand() - 1.5) / 1.5;
    rocks.push({
      a,
      r: radius + off * width,
      y: (rand() - 0.5) * width * 0.25,
      s: 0.05 + Math.pow(rand(), 3) * 0.22,
      spin: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6),
      rate: 0.2 + rand() * 0.8,
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const place = (time: number) => {
    rocks.forEach((rock, i) => {
      p.set(Math.cos(rock.a) * rock.r, rock.y, Math.sin(rock.a) * rock.r);
      e.set(rock.spin.x + time * rock.rate, rock.spin.y + time * rock.rate * 0.7, rock.spin.z);
      q.setFromEuler(e);
      s.setScalar(rock.s);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(0);
  mesh.computeBoundingSphere();
  return {
    mesh,
    animate(time, still) {
      if (still) return;
      mesh.rotation.y = -time * 0.01;
      place(time);
    },
  };
}

/** A banded ring disc for a gas giant, `radius` being the planet's. */
export function buildPlanetRings(k: ModelKit, radius: number, color: THREE.ColorRepresentation, seed: number): THREE.Mesh {
  const rand = seeded(seed);
  const bands = [rand(), rand(), rand(), rand()];
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uBands: { value: new THREE.Vector4(...bands) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec4 uBands;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float inside = smoothstep(0.55, 0.58, r) * smoothstep(1.0, 0.96, r);
        float t = (r - 0.55) / 0.45;
        float band = 0.55 + 0.25 * sin(t * 40.0 * (0.6 + uBands.x)) + 0.2 * sin(t * 97.0 * (0.5 + uBands.y));
        float gap = smoothstep(0.02, 0.05, abs(t - (0.45 + uBands.z * 0.2)));
        float a = inside * band * gap * 0.75;
        gl_FragColor = vec4(uColor * (0.7 + band * 0.5), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(k.geo("belt:ringPlane", () => new THREE.PlaneGeometry(2, 2)), mat);
  ring.scale.set(radius * 2.3, radius * 2.3, 1);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}
