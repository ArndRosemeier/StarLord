import { designStyle, findDesign, population, raceShipStyle, type HullSize, type PlanetSize, type PlanetType, type PlayerView, type Star } from "@starlord/sim";
import { STAR_COLORS } from "../../map/scene";
import type { StationTierId } from "../models/stations";
import { colonizeOption, type ColonizeOption } from "../../game/colonize";
import { leadMonster, monsterBehavior, monsterName, monsterSpecies, type MonsterSpecies } from "../../game/monsters";

/**
 * What a star system looks like from the viewer's seat, independent of how it
 * is drawn: the star, the planets in orbit order with their colonies and
 * stations, and the fleets parked there. The 3D system view renders this; a
 * later 3D galaxy can reuse it for close-ups.
 */

export interface SystemPlanet {
  id: string;
  /** Orbit slot, 1 (innermost) to 5. */
  orbit: number;
  type: PlanetType;
  size: PlanetSize;
  special: string;
  colony: {
    name: string;
    ownerName: string;
    color: string;
    mine: boolean;
    outpost: boolean;
    population: number;
    station: StationTierId | null;
  } | null;
  /** How the viewer could settle this planet with a ship already here; null when they can't. */
  settle: ColonizeOption | null;
}

export interface SystemFleet {
  id: string;
  name: string;
  color: string;
  mine: boolean;
  kind: "empire" | "monsters" | "raiders";
  ships: number;
  /** Largest hull class in the fleet, for its model; null when unknown. */
  hull: HullSize | null;
  /** Ship style of that largest ship, or the owner's race style. */
  style: string;
  /** Under orders to leave. */
  leaving: boolean;
  /** Which monster this is, for its model; null for other fleets. */
  species: MonsterSpecies | null;
  /** What a monster does to ships that come in, for its label. */
  behavior: string | null;
}

export interface SystemModel {
  starId: string;
  name: string;
  /** Spectral class, or "blackHole". */
  starClass: Star["color"];
  color: string;
  explored: boolean;
  special: Star["special"];
  nebula: boolean;
  wormhole: boolean;
  planets: SystemPlanet[];
  fleets: SystemFleet[];
}

const HULL_ORDER: HullSize[] = ["frigate", "destroyer", "cruiser", "battleship", "titan", "doomStar"];
const STATIONS: StationTierId[] = ["starFortress", "battlestation", "starBase"];

export function buildSystemModel(view: PlayerView, starId: string, preferFleetId?: string | null, canOrder = true): SystemModel | null {
  const star = view.galaxy.stars.find((s) => s.id === starId);
  if (!star) return null;
  const me = view.players[view.viewer]!;
  const explored = me.explored.includes(star.id);
  const planets: SystemPlanet[] = [];
  if (explored) {
    for (const pid of star.planetIds) {
      const p = view.planets[pid];
      if (!p) continue;
      const c = p.colonyId ? view.colonies[p.colonyId] : undefined;
      const owner = c ? view.players[c.ownerId] : undefined;
      planets.push({
        id: p.id,
        orbit: p.orbit,
        type: p.type,
        size: p.size,
        special: p.special,
        colony: c && owner ? {
          name: c.name,
          ownerName: owner.name,
          color: owner.color,
          mine: owner.id === view.viewer,
          outpost: c.outpost,
          population: population(c),
          station: STATIONS.find((s) => c.buildings.includes(s)) ?? null,
        } : null,
        settle: canOrder ? colonizeOption(view, p.id, preferFleetId) : null,
      });
    }
    planets.sort((a, b) => a.orbit - b.orbit);
  }
  const fleets: SystemFleet[] = Object.values(view.fleets)
    .filter((f) => f.starId === star.id)
    .map((f) => {
      const owner = view.players[f.ownerId]!;
      let hull: HullSize | null = null;
      let style: string = raceShipStyle(owner.raceId);
      for (const s of f.ships) {
        const d = findDesign(owner, s.designId);
        const h = d?.hull;
        if (h && (!hull || HULL_ORDER.indexOf(h) > HULL_ORDER.indexOf(hull))) {
          hull = h;
          style = designStyle(owner, d);
        }
      }
      const lead = owner.kind === "monsters" ? leadMonster(f) : undefined;
      return {
        id: f.id,
        name: f.ownerId === view.viewer ? f.name : lead ? monsterName(lead) : owner.name,
        species: monsterSpecies(lead),
        behavior: lead ? monsterBehavior(lead) : null,
        color: owner.color,
        style,
        mine: f.ownerId === view.viewer,
        kind: owner.kind,
        ships: f.ships.reduce((n, s) => n + s.count, 0),
        hull,
        leaving: !!f.destStarId && f.destStarId !== star.id,
      };
    });
  return {
    starId: star.id,
    name: star.name,
    starClass: star.color,
    color: STAR_COLORS[star.color] ?? "#ffffff",
    explored,
    special: star.special,
    nebula: !!star.nebula,
    wormhole: !!star.wormholeTo,
    planets,
    fleets,
  };
}
