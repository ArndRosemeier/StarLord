import * as THREE from "three";

/** Shared material recipes for 3D scenes. */

/** A rim glow that is bright at the silhouette and clear in the middle: atmospheres, shields. */
export function fresnelMaterial(color: THREE.ColorRepresentation, power = 2.5, intensity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uColor * f * uIntensity, f * uIntensity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** An additive glow sprite material. */
export function glowSpriteMaterial(map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Owner colour mixed toward steel grey, so hull plating detail still shows through. */
export function hullTint(owner: THREE.ColorRepresentation, amount = 0.55): THREE.Color {
  return new THREE.Color(0x9aa3b0).lerp(new THREE.Color(owner), amount);
}

/** Brighter, saturated version of an owner colour for emissive trim. */
export function accentColor(owner: THREE.ColorRepresentation): THREE.Color {
  const c = new THREE.Color(owner);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.1), Math.max(0.55, hsl.l));
}
