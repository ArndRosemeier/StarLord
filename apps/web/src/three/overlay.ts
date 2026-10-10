import * as THREE from "three";
import type { Stage } from "./stage";

/**
 * Crisp HTML text pinned to points in a 3D scene: rising damage numbers and a
 * hover label. Elements live in one absolutely positioned layer above the
 * canvas and follow their anchors every frame.
 */

interface Floater {
  el: HTMLDivElement;
  at: THREE.Vector3;
  /** Seconds left; starts above `life` while delayed. */
  t: number;
  life: number;
  rise: number;
}

export class Overlay {
  readonly layer: HTMLDivElement;
  private floaters: Floater[] = [];
  private label: HTMLDivElement;
  private labelAt: THREE.Vector3 | null = null;
  private p = new THREE.Vector2();

  constructor(private stage: Stage, private maxFloaters = 24) {
    this.layer = document.createElement("div");
    Object.assign(this.layer.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    stage.container.appendChild(this.layer);
    this.label = document.createElement("div");
    this.label.className = "three-label";
    this.label.style.display = "none";
    this.layer.appendChild(this.label);
  }

  /** A short text that rises and fades from `at` (copied), after an optional delay in seconds. */
  float(at: THREE.Vector3, text: string, color: string, delay = 0, life = 1.1): void {
    if (this.floaters.length >= this.maxFloaters) this.remove(0);
    const el = document.createElement("div");
    el.className = "three-floater";
    el.textContent = text;
    el.style.color = color;
    el.style.opacity = "0";
    this.layer.appendChild(el);
    this.floaters.push({ el, at: at.clone(), t: life + delay, life, rise: 0 });
  }

  /** Shows the hover label at a world point, or hides it with null. */
  setLabel(at: THREE.Vector3 | null, html?: string): void {
    this.labelAt = at ? at.clone() : null;
    this.label.style.display = at ? "" : "none";
    if (at && html !== undefined && this.label.innerHTML !== html) this.label.innerHTML = html;
  }

  clear(): void {
    while (this.floaters.length) this.remove(0);
  }

  private remove(i: number): void {
    this.floaters[i]!.el.remove();
    this.floaters.splice(i, 1);
  }

  update(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.t -= dt;
      if (f.t <= 0) { this.remove(i); continue; }
      if (f.t > f.life) continue;
      f.rise += dt * 28;
      const p = this.stage.project(f.at, this.p);
      if (!p) { f.el.style.opacity = "0"; continue; }
      f.el.style.opacity = String(Math.min(1, f.t / (f.life * 0.4)));
      f.el.style.transform = `translate(${p.x}px, ${p.y - f.rise}px) translate(-50%, -100%)`;
    }
    if (this.labelAt) {
      const p = this.stage.project(this.labelAt, this.p);
      if (p) this.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }

  dispose(): void {
    this.clear();
    this.layer.remove();
  }
}
