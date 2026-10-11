import * as THREE from "three";
import type { Stage } from "./stage";

/**
 * Name tags pinned to objects in a 3D scene: crisp HTML that follows its
 * object every frame and hides when the object is behind the camera. Unlike
 * the battle's single hover label, any number of tags can be shown at once.
 */

interface Tag {
  el: HTMLDivElement;
  target: THREE.Object3D;
  /** World-space lift above the object's origin, so the tag sits over it. */
  lift: number;
}

export class LabelLayer {
  readonly layer: HTMLDivElement;
  private tags = new Map<string, Tag>();
  private world = new THREE.Vector3();
  private p = new THREE.Vector2();

  constructor(private stage: Stage) {
    this.layer = document.createElement("div");
    Object.assign(this.layer.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    stage.container.appendChild(this.layer);
  }

  /** Adds or replaces the tag `key`, pinned `lift` world units above `target`. */
  set(key: string, target: THREE.Object3D, html: string, lift = 0, className = "three-tag"): HTMLDivElement {
    let tag = this.tags.get(key);
    if (!tag) {
      const el = document.createElement("div");
      this.layer.appendChild(el);
      tag = { el, target, lift };
      this.tags.set(key, tag);
    }
    tag.target = target;
    tag.lift = lift;
    tag.el.className = className;
    if (tag.el.innerHTML !== html) tag.el.innerHTML = html;
    return tag.el;
  }

  /** Toggles a CSS class on one tag, e.g. for hover or selection. */
  mark(key: string, cls: string, on: boolean): void {
    this.tags.get(key)?.el.classList.toggle(cls, on);
  }

  clear(): void {
    for (const t of this.tags.values()) t.el.remove();
    this.tags.clear();
  }

  update(): void {
    for (const t of this.tags.values()) {
      t.target.getWorldPosition(this.world);
      this.world.y += t.lift;
      const p = this.stage.project(this.world, this.p);
      if (!p) {
        t.el.style.visibility = "hidden";
        continue;
      }
      t.el.style.visibility = "";
      t.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  dispose(): void {
    this.clear();
    this.layer.remove();
  }
}
