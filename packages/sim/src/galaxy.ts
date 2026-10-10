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
/** Every home star gets at least this many other stars within HOME_NEIGHBOR_RANGE... */
const HOME_NEIGHBORS = 2;
/** ...which is inside the starting fuel range (4 parsecs), so the first ships always have somewhere to go. */
const HOME_NEIGHBOR_RANGE = 3.5;

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
 * the star farthest from all chosen ones. Farthest-first favours lonely stars,
 * so only stars with neighbours in reach qualify, and any home still short of
 * neighbours has the nearest stars drawn in.
 */
export function pickHomeStars(rng: Rng, stars: Star[], count: number): Star[] {
  const all = stars.filter((s) => s.color !== "blackHole");
  if (all.length < count) throw new Error("galaxy too small for player count");
  const roomy = all.filter((s) => neighbours(stars, s).length >= HOME_NEIGHBORS);
  const candidates = roomy.length >= count ? roomy : all;
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
  for (const home of chosen) drawInNeighbours(stars, home, chosen);
  return chosen;
}

function neighbours(stars: Star[], home: Star): Star[] {
  return stars.filter((s) => s !== home && distance(s, home) <= HOME_NEIGHBOR_RANGE);
}

/** Moves the nearest stars toward a home until it has enough within reach, keeping the minimum gap. */
function drawInNeighbours(stars: Star[], home: Star, homes: Star[]): void {
  let missing = HOME_NEIGHBORS - neighbours(stars, home).length;
  const outside = stars
    .filter((s) => !homes.includes(s) && distance(s, home) > HOME_NEIGHBOR_RANGE)
    .sort((a, b) => distance(a, home) - distance(b, home));
  for (const star of outside) {
    if (missing <= 0) return;
    const d = distance(star, home);
    const target = HOME_NEIGHBOR_RANGE - 0.2;
    const x = round1(home.x + ((star.x - home.x) / d) * target);
    const y = round1(home.y + ((star.y - home.y) / d) * target);
    if (stars.some((o) => o !== star && Math.hypot(o.x - x, o.y - y) < MIN_STAR_GAP)) continue;
    star.x = x;
    star.y = y;
    missing--;
  }
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
