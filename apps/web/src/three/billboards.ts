import * as THREE from "three";

/**
 * Camera-facing status bars made of sprites (always drawn on top). Each row
 * is a dark track with a coloured fill that shrinks from the right.
 */

export interface BarRow {
  /** 0..1 */
  value: number;
  color: THREE.ColorRepresentation;
}

const white = (() => {
  let tex: THREE.DataTexture | null = null;
  return () => {
    if (!tex) {
      tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      tex.needsUpdate = true;
    }
    return tex;
  };
})();

export class HealthBar {
  readonly group = new THREE.Group();
  private rows: { track: THREE.Sprite; fill: THREE.Sprite }[] = [];

  constructor(rowCount: number, private width: number, private rowHeight = 0.07) {
    // Sprites always face the camera, so rows are laid out through each sprite's
    // anchor (`center`) rather than by moving them in world space.
    for (let i = 0; i < rowCount; i++) {
      const track = this.sprite(0x200608, 0.8);
      const fill = this.sprite(0x4fd18b, 1);
      const rowOffset = i * (rowHeight + 0.03);
      track.scale.set(width, rowHeight, 1);
      fill.scale.set(width, rowHeight * 0.7, 1);
      track.center.set(0.5, 0.5 + rowOffset / rowHeight);
      fill.center.set(0.5, 0.5 + rowOffset / (rowHeight * 0.7));
      fill.renderOrder = 21;
      this.group.add(track, fill);
      this.rows.push({ track, fill });
    }
  }

  private sprite(color: number, opacity: number): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: white(), color, transparent: true, opacity, depthTest: false, depthWrite: false }));
    s.renderOrder = 20;
    return s;
  }

  set(rows: BarRow[]): void {
    this.rows.forEach((r, i) => {
      const row = rows[i];
      r.track.visible = r.fill.visible = !!row;
      if (!row) return;
      // Keep the fill's left edge on the track's left edge as it shrinks.
      const v = Math.max(0.002, Math.min(1, row.value));
      r.fill.scale.x = this.width * v;
      r.fill.center.x = 0.5 / v;
      r.fill.visible = row.value > 0;
      (r.fill.material as THREE.SpriteMaterial).color.set(row.color);
    });
  }

  setOpacity(o: number): void {
    for (const r of this.rows) {
      (r.track.material as THREE.SpriteMaterial).opacity = 0.8 * o;
      (r.fill.material as THREE.SpriteMaterial).opacity = o;
    }
  }

  dispose(): void {
    for (const r of this.rows) {
      (r.track.material as THREE.Material).dispose();
      (r.fill.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}

/** Fill colour for a health fraction: green, amber, then red. */
export function healthColor(frac: number): number {
  return frac > 0.6 ? 0x4fd18b : frac > 0.3 ? 0xffc857 : 0xff6b6b;
}
