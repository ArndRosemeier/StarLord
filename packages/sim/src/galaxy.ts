import { STAR_NAMES } from "./data/names.js";
import {
  CLIMATES, MINERAL_WEIGHTS_BY_STAR, PLANET_SIZE_WEIGHTS, PLANET_TYPE_WEIGHTS, PLANETS_PER_STAR,
  STAR_COLOR_WEIGHTS, gravityOf, type Minerals, type PlanetSize, type PlanetType,
} from "./data/planets.js";
import { Rng } from "./rng.js";
import type { GalaxySize, Id, Planet, Star } from "./types.js";

export const STAR_COUNTS: Record<GalaxySize, number> = { small: 20, medium: 36, large: 54, huge: 72 };

/** Minimum distance between stars, in parsecs. */
const MIN_STAR_GAP = 2.2;
/** Square parsecs of space per star. */
const AREA_PER_STAR = 14;

export interface GeneratedGalaxy {
  width: number;
  height: number;
  stars: Star[];
  planets: Record<Id, Planet>;
}

export function generateGalaxy(rng: Rng, size: GalaxySize, newId: (prefix: string) => Id): GeneratedGalaxy {
  const count = STAR_COUNTS[size];
  const width = Math.round(Math.sqrt((count * AREA_PER_STAR) / 0.75));
  const height = Math.round(width * 0.75);
  const names = rng.shuffle([...STAR_NAMES]);

  const stars: Star[] = [];
  let attempts = 0;
  while (stars.length < count && attempts < count * 500) {
    attempts++;
    const x = 1 + rng.next() * (width - 2);
    const y = 1 + rng.next() * (height - 2);
    if (stars.some((s) => Math.hypot(s.x - x, s.y - y) < MIN_STAR_GAP)) continue;
    stars.push({
      id: newId("s"),
      name: names[stars.length % names.length]!,
      x: round1(x),
      y: round1(y),
      color: rng.weighted(STAR_COLOR_WEIGHTS),
      planetIds: [],
      special: null,
    });
  }

  const planets: Record<Id, Planet> = {};
  for (const star of stars) {
    const [min, max] = PLANETS_PER_STAR[star.color];
    const n = rng.int(min, max);
    const orbits = rng.shuffle([1, 2, 3, 4, 5]).slice(0, n).sort((a, b) => a - b);
    for (const orbit of orbits) {
      const p = rollPlanet(rng, star, orbit, newId("p"));
      planets[p.id] = p;
      star.planetIds.push(p.id);
    }
  }
  return { width, height, stars, planets };
}

function rollPlanet(rng: Rng, star: Star, orbit: number, id: Id): Planet {
  const type = rng.weighted(PLANET_TYPE_WEIGHTS[star.color]) as PlanetType;
  const size: PlanetSize = type === "asteroids" ? "small" : type === "gasGiant" ? "huge" : rng.weighted(PLANET_SIZE_WEIGHTS);
  const minerals = rng.weighted(MINERAL_WEIGHTS_BY_STAR[star.color]) as Minerals;
  const special = CLIMATES[type].habitable && rng.chance(0.06) ? rng.pick(["artifacts", "gold", "gems"] as const) : "none";
  return { id, starId: star.id, orbit, type, size, minerals, gravity: gravityOf(size, minerals), special, colonyId: null };
}

/**
 * Picks spread-out home stars: start from a random star, then repeatedly take
 * the star farthest from all chosen ones.
 */
export function pickHomeStars(rng: Rng, stars: Star[], count: number): Star[] {
  const candidates = stars.filter((s) => s.color !== "blackHole");
  if (candidates.length < count) throw new Error("galaxy too small for player count");
  const chosen: Star[] = [rng.pick(candidates)];
  while (chosen.length < count) {
    let best: Star | null = null;
    let bestDist = -1;
    for (const s of candidates) {
      if (chosen.includes(s)) continue;
      const d = Math.min(...chosen.map((c) => Math.hypot(c.x - s.x, c.y - s.y)));
      if (d > bestDist) {
        bestDist = d;
        best = s;
      }
    }
    chosen.push(best!);
  }
  return chosen;
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
