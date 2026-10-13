import { getRace } from "./data/races.js";
import { findDesign } from "./designs.js";
import type { GameState } from "./types.js";

/**
 * Consistency checks on a game state, for headless test runs: every problem
 * found is described in one line. An empty list means the state looks sound.
 * They catch bugs that leave games running but broken (orphaned colonies,
 * NaN treasuries, fleets of unknown ships) long before anyone notices.
 */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const bad = (msg: string) => { if (problems.length < 50) problems.push(msg); };

  // Every number anywhere in the state must be finite.
  const walk = (v: unknown, path: string, depth: number): void => {
    if (typeof v === "number") {
      // Infinity is the "never" of a game without raiders.
      if (!Number.isFinite(v) && !(path === "state.raiders.nextRaid" && v === Infinity)) bad(`${path} is ${v}`);
    } else if (v && typeof v === "object" && depth < 12) {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, depth + 1);
    }
  };
  walk({ ...state, events: [], combats: [] }, "state", 0);

  const stars = new Set(state.galaxy.stars.map((s) => s.id));
  const player = (id: number) => state.players[id];

  for (const p of state.players) {
    if (p.kind !== "empire") continue;
    if (p.alive && p.eliminatedTurn !== null) bad(`${p.name} is alive but was eliminated on turn ${p.eliminatedTurn}`);
    if (p.research.progress < 0) bad(`${p.name} has negative research progress ${p.research.progress}`);
    if (new Set(p.designs.map((d) => d.id)).size !== p.designs.length) bad(`${p.name} has duplicate design ids`);
  }

  for (const c of Object.values(state.colonies)) {
    const planet = state.planets[c.planetId];
    const owner = player(c.ownerId);
    if (!planet) { bad(`colony ${c.name} is on missing planet ${c.planetId}`); continue; }
    if (planet.colonyId !== c.id) bad(`planet ${c.planetId} doesn't point back to colony ${c.name}`);
    if (!owner) bad(`colony ${c.name} has unknown owner ${c.ownerId}`);
    else if (!owner.alive) bad(`colony ${c.name} belongs to eliminated ${owner.name}`);
    for (const job of ["farmers", "workers", "scientists"] as const) {
      if (c[job] < 0 || !Number.isInteger(c[job])) bad(`colony ${c.name} has ${c[job]} ${job}`);
    }
    if (c.outpost && c.farmers + c.workers + c.scientists > 0) bad(`outpost ${c.name} has population`);
    if (c.growthK < 0) bad(`colony ${c.name} has negative growth ${c.growthK}`);
    if (c.progress < 0) bad(`colony ${c.name} has negative build progress ${c.progress}`);
    if (!c.outpost) {
      try { getRace(c.raceId); } catch { bad(`colony ${c.name} has unknown race ${c.raceId}`); }
    }
    if (owner) {
      for (const item of c.queue) {
        if ((item.kind === "ship" || item.kind === "refit") && !findDesign(owner, item.designId)) bad(`colony ${c.name} builds unknown design ${item.designId}`);
      }
    }
  }
  for (const pl of Object.values(state.planets)) {
    if (pl.colonyId && !state.colonies[pl.colonyId]) bad(`planet ${pl.id} points to missing colony ${pl.colonyId}`);
    if (!stars.has(pl.starId)) bad(`planet ${pl.id} orbits missing star ${pl.starId}`);
  }

  for (const f of Object.values(state.fleets)) {
    const owner = player(f.ownerId);
    if (!owner) { bad(`fleet ${f.id} has unknown owner ${f.ownerId}`); continue; }
    if (owner.kind === "empire" && !owner.alive) bad(`fleet ${f.name} belongs to eliminated ${owner.name}`);
    if (f.ships.length === 0) bad(`fleet ${f.name} of ${owner.name} has no ships`);
    if (f.starId !== null && !stars.has(f.starId)) bad(`fleet ${f.name} orbits missing star ${f.starId}`);
    if (f.destStarId !== null && !stars.has(f.destStarId)) bad(`fleet ${f.name} heads to missing star ${f.destStarId}`);
    if (f.starId === null && f.destStarId === null) bad(`fleet ${f.name} of ${owner.name} is lost in space`);
    for (const s of f.ships) {
      if (s.count <= 0 || !Number.isInteger(s.count)) bad(`fleet ${f.name} has a stack of ${s.count} ships`);
      if (!findDesign(owner, s.designId)) bad(`fleet ${f.name} of ${owner.name} has unknown design ${s.designId}`);
      if (s.damage && s.damage.length > s.count) bad(`fleet ${f.name} has more damaged ships than ships`);
    }
  }

  for (const l of Object.values(state.leaders)) {
    if (l.status === "hired" && (l.ownerId === null || !player(l.ownerId)?.alive)) bad(`leader ${l.name} serves no living empire`);
  }

  if (state.over && state.winner === null) bad("game is over without a winner");
  if (state.over && !state.victory) bad("game is over without a victory kind");
  return problems;
}
