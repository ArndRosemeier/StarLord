import { Application, Assets, Circle, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { MapInput, MapRenderer } from "./renderer";
import type { MapScene } from "./scene";

/** Pixels per galaxy unit at zoom 1. */
const UNIT = 48;
const DRAG_THRESHOLD = 4;

const hex = (c: string) => parseInt(c.replace("#", ""), 16);
const NEBULA_URL = "art/galaxy.webp";
/** How far the nebula moves relative to the map when panning, for a sense of depth. */
const PARALLAX = 0.06;

export class PixiMapRenderer implements MapRenderer {
  private app = new Application();
  private camera = new Container();
  private nebula: Sprite | null = null;
  private backdrop = new Graphics();
  private world = new Container();
  private input!: MapInput;
  private container!: HTMLElement;
  private mounted = false;
  private pending: MapScene | null = null;
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private lastSize = "";
  private destroyed = false;

  async mount(container: HTMLElement, input: MapInput): Promise<void> {
    this.container = container;
    this.input = input;
    await this.app.init({
      background: "#04050b",
      resizeTo: container,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    container.appendChild(this.app.canvas);
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.backdrop, this.world);
    void Assets.load<Texture>(NEBULA_URL).then((texture) => {
      if (this.destroyed) return;
      this.nebula = new Sprite(texture);
      this.nebula.anchor.set(0.5);
      this.nebula.alpha = 0.6;
      this.app.stage.addChildAt(this.nebula, 0);
      this.app.ticker.add(this.placeNebula);
    }).catch(() => {});
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.global.x, y: e.global.y, camX: this.camera.x, camY: this.camera.y, moved: false };
    });
    this.app.stage.on("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.global.x - this.drag.x;
      const dy = e.global.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.drag.moved = true;
      if (this.drag.moved) {
        this.camera.x = this.drag.camX + dx;
        this.camera.y = this.drag.camY + dy;
      }
    });
    const endDrag = () => {
      this.drag = null;
    };
    this.app.stage.on("pointerup", (e) => {
      if (this.drag && !this.drag.moved && e.target === this.app.stage) this.input.onBackground();
      endDrag();
    });
    this.app.stage.on("pointerupoutside", endDrag);
    this.mounted = true;
    if (this.pending) this.render(this.pending);
  }

  /** Keep the nebula covering the screen, drifting slightly with the camera. */
  private placeNebula = () => {
    const n = this.nebula;
    if (!n) return;
    const { width, height } = this.app.screen;
    const cover = Math.max(width / n.texture.width, height / n.texture.height) * 1.15;
    n.scale.set(cover);
    const maxX = (n.width - width) / 2;
    const maxY = (n.height - height) / 2;
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    n.position.set(width / 2 + clamp((this.camera.x - width / 2) * PARALLAX, maxX), height / 2 + clamp((this.camera.y - height / 2) * PARALLAX, maxY));
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = this.camera.scale.x;
    const next = Math.min(4, Math.max(0.3, old * Math.exp(-e.deltaY * 0.0015)));
    // Zoom around the cursor.
    this.camera.x = mx - ((mx - this.camera.x) * next) / old;
    this.camera.y = my - ((my - this.camera.y) * next) / old;
    this.camera.scale.set(next);
  };

  focus(x: number, y: number): void {
    const s = this.camera.scale.x;
    this.camera.x = this.app.screen.width / 2 - x * UNIT * s;
    this.camera.y = this.app.screen.height / 2 - y * UNIT * s;
  }

  private fit(scene: MapScene): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const size = `${scene.width}x${scene.height}:${w}x${h}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
    const s = Math.min(w / ((scene.width + 2) * UNIT), h / ((scene.height + 2) * UNIT));
    this.camera.scale.set(s);
    this.focus(scene.width / 2, scene.height / 2);
    this.drawBackdrop(scene);
  }

  private drawBackdrop(scene: MapScene): void {
    const g = this.backdrop.clear();
    // Faint distant stars; a fixed pattern so the sky doesn't flicker between renders.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = (scene.width + 20) * UNIT;
    const h = (scene.height + 20) * UNIT;
    for (let i = 0; i < 900; i++) {
      g.circle(rand() * w - 10 * UNIT, rand() * h - 10 * UNIT, rand() * 1.4 + 0.3).fill({ color: 0xffffff, alpha: 0.08 + rand() * 0.25 });
    }
  }

  render(scene: MapScene): void {
    if (!this.mounted) {
      this.pending = scene;
      return;
    }
    this.fit(scene);
    for (const child of this.world.removeChildren()) child.destroy({ children: true });

    const lines = new Graphics();
    this.world.addChild(lines);
    for (const f of scene.fleets) {
      if (!f.dest) continue;
      lines.moveTo(f.x * UNIT, f.y * UNIT).lineTo(f.dest.x * UNIT, f.dest.y * UNIT);
      lines.stroke({ width: 1.5, color: hex(f.color), alpha: f.id === scene.selectedFleetId ? 0.9 : 0.45 });
    }

    for (const s of scene.stars) {
      const node = new Container();
      node.position.set(s.x * UNIT, s.y * UNIT);
      const g = new Graphics();
      const r = s.special === "orion" ? 9 : s.special === "raiderHome" ? 10 : 6;
      if (scene.reachable.has(s.id)) g.circle(0, 0, r + 12).fill({ color: 0x3b82f6, alpha: 0.12 });
      g.circle(0, 0, r * 2.2).fill({ color: hex(s.color), alpha: 0.12 });
      g.circle(0, 0, r).fill({ color: hex(s.color), alpha: s.explored ? 1 : 0.55 });
      s.owners.forEach((c, i) => {
        g.circle(0, 0, r + 4 + i * 3).stroke({ width: 2, color: hex(c), alpha: 0.9 });
      });
      if (s.guarded) g.star(r + 8, -r - 6, 4, 4, 2).fill({ color: 0xff4d4d });
      if (s.id === scene.selectedStarId) g.circle(0, 0, r + 14).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      node.addChild(g);
      const label = new Text({
        text: s.name,
        style: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fill: s.explored ? 0xd7def0 : 0x6b7590 },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, r + 6);
      label.resolution = 2;
      node.addChild(label);
      node.eventMode = "static";
      node.cursor = "pointer";
      node.hitArea = new Circle(0, 0, r + 14);
      node.on("pointertap", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.input.onStar(s.id, "select");
      });
      node.on("pointerdown", (e) => {
        if (e.button !== 2) return;
        e.stopPropagation();
        this.input.onStar(s.id, "order");
      });
      this.world.addChild(node);
    }

    // Fleets orbiting a star are stacked beside it; fleets in transit sit on their path.
    const orbitIndex = new Map<string, number>();
    for (const f of scene.fleets) {
      let x = f.x * UNIT;
      let y = f.y * UNIT;
      if (f.starId) {
        const i = orbitIndex.get(f.starId) ?? 0;
        orbitIndex.set(f.starId, i + 1);
        x += 16 + (i % 3) * 11;
        y += -10 + Math.floor(i / 3) * 11;
      }
      const g = new Graphics();
      g.position.set(x, y);
      const color = hex(f.color);
      if (f.kind === "empire") g.poly([-5, -5, 6, 0, -5, 5]).fill({ color }).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
      else g.poly([0, -6, 6, 0, 0, 6, -6, 0]).fill({ color: f.kind === "monsters" ? 0xff4d4d : 0xb04dff });
      if (f.id === scene.selectedFleetId) g.circle(0, 0, 9).stroke({ width: 1.5, color: 0xffffff });
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new Circle(0, 0, 8);
      g.on("pointertap", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.input.onFleet(f.id);
      });
      g.on("pointerdown", (e) => {
        if (e.button !== 2 || !f.starId) return;
        e.stopPropagation();
        this.input.onStar(f.starId, "order");
      });
      this.world.addChild(g);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.mounted) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.placeNebula);
    this.app.destroy(true, { children: true });
    this.mounted = false;
  }
}
