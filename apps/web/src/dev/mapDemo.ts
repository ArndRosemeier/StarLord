import { Simulation } from "@starlord/ai";
import { playerView, type GalaxySize } from "@starlord/sim";
import { PixiMapRenderer } from "../map/pixiRenderer";
import { buildScene } from "../map/scene";
import { turnFlashes } from "../map/flashes";
import "../styles.css";

/**
 * Development page for the galaxy map (dev server only: /dev/map.html): an all-AI game played
 * `?turns=` turns (default 60) on `?size=` (default medium), seen by the first empire.
 * `?fleet` selects its first fleet, `?overlays` shows fuel and scan range, `?flash` fires the turn's flashes.
 */

const q = new URLSearchParams(location.search);
const sim = new Simulation({ seed: q.get("seed") ?? "map-demo", galaxySize: (q.get("size") ?? "medium") as GalaxySize, playerCount: Number(q.get("players") ?? 6), maxTurns: 1000 });
for (let i = 0; i < Number(q.get("turns") ?? 60) && sim.step(); i++);
const viewer = sim.state.players.find((p) => p.kind === "empire")!.id;
const view = playerView(sim.state, viewer);
const fleet = q.has("fleet") ? Object.values(view.fleets).find((f) => f.ownerId === viewer)?.id ?? null : null;
const map = new PixiMapRenderer();
const root = document.getElementById("root")!;
const noop = () => {};
await map.mount(root, { onStar: noop, onFleet: noop, onBackground: noop });
const scene = buildScene(view, null, fleet, true, { fuel: q.has("overlays"), scan: q.has("overlays") });
if (q.has("move")) {
  // Put the viewer's fleets in flight halfway to a neighbouring star, to see trails and arrival ripples.
  const stars = scene.stars;
  scene.fleets.filter((f) => f.mine).forEach((f, i) => {
    const to = stars[(i * 7 + 3) % stars.length]!;
    Object.assign(f, { dest: { x: to.x, y: to.y }, eta: 3, starId: i % 2 ? f.starId : null, x: i % 2 ? f.x : (f.x + to.x) / 2, y: i % 2 ? f.y : (f.y + to.y) / 2 });
  });
}
map.render(scene);
if (q.has("zoom")) {
  const home = Object.values(view.colonies).find((c) => c.ownerId === viewer)!;
  const star = view.galaxy.stars.find((s) => s.id === view.planets[home.planetId]!.starId)!;
  (map as unknown as { camera: { scale: { set(v: number): void } } }).camera.scale.set(Number(q.get("zoom")));
  const at = q.get("at")?.split(",").map(Number);
  map.focus(at?.[0] ?? star.x, at?.[1] ?? star.y);
}
if (q.has("flash")) map.flash(turnFlashes(view, sim.state.events), false);
Object.assign(window, { ready: true, map, view });
