import {
  BUILDINGS_BY_ID, DEBUG, RACES, Rng, FIELD_HEIGHT, FIELD_WIDTH, HULLS, MAX_ROUNDS, TECH_TIERS, checkInvariants, grantTech, hasArmedDefenses, newGame, playerView,
  processTurn, seedRng, setStatus, spawn,
  type CombatReport, type GameState, type HullSize, type PlayerId, type ShipDesign, type StationHull,
} from "@starlord/sim";
import { bestWarship } from "./design.js";

/**
 * Combat lab: sets up a battle between two generic empires (ships built to
 * the best design a tech level allows, an armed planet, an orbital station)
 * and fights it with the real turn code, then checks the result for
 * anything that should never happen. The debug menu runs it; tests fuzz it.
 */

export type LabArms = "beam" | "missile" | "bomb";

export interface LabShips {
  hull: HullSize;
  arms: LabArms;
  count: number;
}

/** Planet defense buildings the lab can put on the defender's planet. */
export const LAB_DEFENSES = ["groundBatteries", "missileBase", "fighterGarrison", "artemisSystemNet", "planetaryStellarConverter"] as const;
export type LabDefense = (typeof LAB_DEFENSES)[number];
export const LAB_PLANET_SHIELDS = ["radiationShield", "fluxShield", "barrierShield"] as const;
export type LabPlanetShield = (typeof LAB_PLANET_SHIELDS)[number];
export const LAB_STATIONS: StationHull[] = ["starBase", "battlestation", "starFortress"];

export interface LabSide {
  raceId: string;
  /** Every field up to this MoO2 tech level (1 = the general fields, 17 = the whole tree) is known, with all its applications. */
  techLevel: number;
  ships: LabShips[];
}

export interface LabDefender extends LabSide {
  station: StationHull | null;
  defenses: LabDefense[];
  planetShield: LabPlanetShield | null;
}

export interface CombatLabSpec {
  seed: string;
  attacker: LabSide & {
    /** Attack stance: the fleet also goes for the planet and station, not only the defending ships. */
    attacksPlanet: boolean;
  };
  defender: LabDefender;
  nebula?: boolean;
  shipInitiative?: boolean;
}

export const MAX_TECH_LEVEL = 17;
const MIRROR_COLORS = ["#d94a2a", "#7ab32a"] as const;

export interface LabSetup {
  state: GameState;
  starId: string;
  attackerId: PlayerId;
  defenderId: PlayerId;
  /** Ships asked for that no design at that tech level can carry. */
  notes: string[];
  /** Ships of each side as set up, by design id. */
  ships: Record<PlayerId, Record<string, number>>;
}

export interface LabResult {
  setup: LabSetup;
  /** The turn's battles at the lab's star, in order. */
  reports: CombatReport[];
  after: GameState | null;
  /** Bugs: things that should never happen. Empty when all is well. */
  problems: string[];
  summary: LabSummary | null;
}

export interface LabSummary {
  winner: PlayerId | null;
  rounds: number;
  /** The battle ran out of time with both sides still standing. */
  timedOut: boolean;
  sides: { id: PlayerId; name: string; ships: number; shipsLeft: number; shipsLost: number; damageDealt: number; shots: number; stationLost: boolean; planetSilenced: boolean }[];
}

const HULL_LETTER: Record<HullSize, string> = { frigate: "F", destroyer: "D", cruiser: "C", battleship: "B", titan: "T", doomStar: "X" };
const ARMS_NAME: Record<LabArms, string> = { beam: "Beam", missile: "Missile", bomb: "Bomber" };

function teach(state: GameState, id: PlayerId, level: number): void {
  const p = state.players[id]!;
  for (const tier of TECH_TIERS) {
    if (tier.hyper || tier.level > level) continue;
    if (!p.tiers.includes(tier.id)) p.tiers.push(tier.id);
    for (const t of tier.techs) grantTech(p, t);
  }
  p.research.tierId = null;
  p.research.techChoice = null;
}

/** Builds the battle: both empires at war, the attacker's fleet in orbit over the defender's homeworld. */
export function setupCombatLab(spec: CombatLabSpec): LabSetup {
  const state = newGame({
    seed: `lab:${spec.seed}`, galaxySize: "small", races: [spec.attacker.raceId, spec.defender.raceId], humanPlayers: [],
    monsters: false, raiders: false, council: false, randomEvents: false, techLevel: "preWarp", debug: true,
    ...(spec.shipInitiative ? { shipInitiative: true } : {}),
  });
  const attackerId = 0;
  const defenderId = 1;
  const def = state.players[defenderId]!;
  const star = state.galaxy.stars.find((s) => s.id === def.homeStarId)!;
  star.nebula = !!spec.nebula;
  for (const id of Object.keys(state.fleets)) delete state.fleets[id];
  setStatus(state, attackerId, defenderId, "war");
  // A mirror match needs two names and two colors to tell the sides apart.
  if (spec.attacker.raceId === spec.defender.raceId) {
    def.name = `${def.name} II`;
    def.color = state.players[attackerId]!.color === MIRROR_COLORS[0] ? MIRROR_COLORS[1] : MIRROR_COLORS[0];
  }
  for (const p of state.players) {
    p.explored = state.galaxy.stars.map((s) => s.id);
    p.contacts = state.players.filter((o) => o.id !== p.id).map((o) => o.id);
    // Enough money that upkeep never scraps ships mid-test.
    p.bc = 1_000_000;
  }

  // The defender's homeworld carries exactly the chosen defenses.
  const colony = Object.values(state.colonies).find((c) => c.ownerId === defenderId && state.planets[c.planetId]!.starId === star.id)!;
  colony.buildings = colony.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.defense);
  if (spec.defender.station) colony.buildings.push(spec.defender.station);
  for (const d of spec.defender.defenses) colony.buildings.push(d);
  if (spec.defender.planetShield) colony.buildings.push(spec.defender.planetShield);
  colony.queue = [];

  const notes: string[] = [];
  const ships: LabSetup["ships"] = { [attackerId]: {}, [defenderId]: {} };
  const sides: [PlayerId, LabSide][] = [[attackerId, spec.attacker], [defenderId, spec.defender]];
  for (const [id, side] of sides) {
    teach(state, id, side.techLevel);
    const player = state.players[id]!;
    const stacks: { designId: string; count: number }[] = [];
    for (const s of side.ships) {
      const count = Math.max(0, Math.min(DEBUG.maxSpawn, Math.floor(s.count)));
      if (count === 0) continue;
      const designId = `lab-${s.hull}-${s.arms}`;
      if (!player.designs.some((d) => d.id === designId)) {
        const design = bestWarship(playerView(state, id), s.hull, s.arms, designId);
        if (!design) {
          notes.push(`${player.name} can't build a ${s.arms} ${s.hull} at tech level ${side.techLevel}`);
          continue;
        }
        const full: ShipDesign = { ...design, name: `${ARMS_NAME[s.arms]} ${HULLS.find((h) => h.id === s.hull)!.name} ${HULL_LETTER[s.hull]}${side.techLevel}` };
        player.designs.push(full);
      }
      const stack = stacks.find((x) => x.designId === designId);
      if (stack) stack.count += count;
      else stacks.push({ designId, count });
      ships[id]![designId] = (ships[id]![designId] ?? 0) + count;
    }
    if (stacks.length > 0) {
      const f = spawn(state, id, star, stacks, id === attackerId ? "Strike Force" : "Home Guard");
      f.stance = id === attackerId && spec.attacker.attacksPlanet ? "attack" : "defend";
    }
  }
  return { state, starId: star.id, attackerId, defenderId, notes, ships };
}

/** Fights the lab battle once. `run` varies the dice without rebuilding the setup. */
export function runCombatLab(setup: LabSetup, run = 0): LabResult {
  const state = structuredClone(setup.state);
  state.rng = seedRng(`${state.seed}:run${run}`);
  let after: GameState | null = null;
  const problems: string[] = [];
  try {
    after = processTurn(state, {});
  } catch (e) {
    problems.push(`the turn crashed: ${(e as Error).message}`);
    return { setup, reports: [], after: null, problems, summary: null };
  }
  const reports = after.combats.filter((r) => r.starId === setup.starId);
  for (const p of checkInvariants(after)) problems.push(p);
  for (const r of reports) for (const p of reportProblems(setup, r)) problems.push(p);
  problems.push(...outcomeProblems(setup, after, reports));
  return { setup, reports, after, problems, summary: reports[0] ? summarize(setup, after, reports) : null };
}

const isNum = (v: unknown) => typeof v === "number";

/** Checks one battle's report for things the combat code must never produce. */
export function reportProblems(setup: LabSetup, r: CombatReport): string[] {
  const out: string[] = [];
  const bad = (m: string) => { if (out.length < 30) out.push(`${r.id}: ${m}`); };
  const units = new Map(r.ships.map((s) => [s.key, s]));
  if (units.size !== r.ships.length) bad("two units share a key");
  if (r.winner !== null && !r.sides.includes(r.winner)) bad(`winner ${r.winner} did not fight`);
  if (r.rounds.length > MAX_ROUNDS) bad(`${r.rounds.length} rounds, more than the limit of ${MAX_ROUNDS}`);
  for (const s of r.ships) {
    for (const [k, v] of Object.entries(s)) if (isNum(v) && !Number.isFinite(v as number)) bad(`${s.name} starts with ${k} = ${v}`);
    if (s.maxHits <= 0 && s.kind !== "planet") bad(`${s.name} starts with ${s.maxHits} hit points`);
    if (!r.sides.includes(s.ownerId)) bad(`${s.name} belongs to a player outside the battle`);
  }
  const destroyed = new Set<string>();
  const retreated = new Set<string>();
  r.rounds.forEach((round, i) => {
    for (const e of round) {
      const where = `round ${i + 1}, ${e.kind}`;
      for (const [k, v] of Object.entries(e)) if (isNum(v) && !Number.isFinite(v as number)) bad(`${where}: ${k} = ${v}`);
      const u = units.get(e.ship);
      if (!u) { bad(`${where}: unknown unit ${e.ship}`); continue; }
      const t = e.target ? units.get(e.target) : undefined;
      if (e.target && !t) bad(`${where}: unknown target ${e.target}`);
      if (t && t.ownerId === u.ownerId && e.kind !== "repair") bad(`${where}: ${u.name} targets its own side's ${t.name}`);
      for (const k of ["damage", "absorbed", "armorDamage", "structureDamage"] as const) {
        const v = e[k];
        if (isNum(v) && v! < 0) bad(`${where}: negative ${k} ${v}`);
      }
      if (e.kind === "fire" && e.hit === false && (e.damage ?? 0) > 0) bad(`${where}: ${u.name} missed but did ${e.damage} damage`);
      if (e.kind === "move") {
        if (u.kind !== "ship" && u.kind !== "monster") bad(`${where}: immobile ${u.name} moved`);
        if (destroyed.has(e.ship)) bad(`${where}: ${u.name} moved after being destroyed`);
        if (retreated.has(e.ship)) bad(`${where}: ${u.name} moved after retreating`);
        if (e.x! < -1 || e.x! > FIELD_WIDTH + 1 || e.y! < -1 || e.y! > FIELD_HEIGHT + 1) bad(`${where}: ${u.name} left the field to ${e.x}, ${e.y}`);
      }
      if (e.kind === "destroyed") {
        if (destroyed.has(e.ship)) bad(`${where}: ${u.name} destroyed twice`);
        destroyed.add(e.ship);
      }
      if (e.kind === "retreat") {
        if (u.kind !== "ship") bad(`${where}: ${u.name} (${u.kind}) retreated`);
        retreated.add(e.ship);
      }
    }
  });
  if (r.winner !== null) {
    const left = r.ships.filter((s) => s.ownerId === r.winner && !destroyed.has(s.key) && !retreated.has(s.key));
    if (left.length === 0) bad("the winner has nothing left on the field");
  }
  void setup;
  return out;
}

/** Checks the state after the turn against the setup: no ship appears from nowhere, losses match the report. */
function outcomeProblems(setup: LabSetup, after: GameState, reports: CombatReport[]): string[] {
  const out: string[] = [];
  for (const id of [setup.attackerId, setup.defenderId]) {
    const owner = after.players[id]!;
    const before = Object.values(setup.ships[id]!).reduce((n, c) => n + c, 0);
    const now = Object.values(after.fleets).filter((f) => f.ownerId === id).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
    // Unit keys are only unique within one battle.
    let destroyed = 0;
    for (const r of reports) {
      const mine = new Set(r.ships.filter((s) => s.ownerId === id && s.kind === "ship").map((s) => s.key));
      destroyed += new Set(r.rounds.flat().filter((e) => e.kind === "destroyed" && mine.has(e.ship)).map((e) => e.ship)).size;
    }
    const captured = Object.values(after.fleets).filter((f) => f.ownerId !== id)
      .reduce((n, f) => n + f.ships.filter((s) => s.designId.startsWith(`cap${id}-`)).reduce((m, s) => m + s.count, 0), 0);
    const capturedFromOthers = Object.values(after.fleets).filter((f) => f.ownerId === id)
      .reduce((n, f) => n + f.ships.filter((s) => s.designId.startsWith("cap")).reduce((m, s) => m + s.count, 0), 0);
    const expected = before - destroyed - captured + capturedFromOthers;
    if (now !== expected) out.push(`${owner.name} has ${now} ships after the battle; ${before} went in, ${destroyed} were destroyed, ${captured} captured and ${capturedFromOthers} taken, so ${expected} should be left`);
    for (const f of Object.values(after.fleets)) {
      if (f.ownerId !== id) continue;
      for (const s of f.ships) {
        if (s.count <= 0) out.push(`${owner.name}'s fleet ${f.name} keeps an empty stack of ${s.designId}`);
        if ((s.damage?.length ?? 0) > s.count) out.push(`${owner.name}'s ${s.designId} stack lists more damaged ships than ships`);
        for (const d of s.damage ?? []) if (!(d > 0)) out.push(`${owner.name}'s ${s.designId} has damage ${d}`);
      }
    }
  }
  // Both sides armed and facing each other, yet nobody fired a shot: the battle didn't really happen.
  const r = reports[0];
  if (r) {
    const shots = r.rounds.flat().filter((e) => e.kind === "fire").length;
    const armedShips = (id: PlayerId) => Object.values(setup.state.fleets).some((f) => f.ownerId === id && f.ships.length > 0);
    const fled = r.rounds.flat().some((e) => e.kind === "retreat");
    if (shots === 0 && !fled && armedShips(setup.attackerId) && armedShips(setup.defenderId)) out.push(`${r.id}: two armed fleets met and nobody fired`);
  } else {
    const has = (id: PlayerId) => Object.values(setup.state.fleets).some((f) => f.ownerId === id);
    const colony = Object.values(setup.state.colonies).find((c) => c.ownerId === setup.defenderId && setup.state.planets[c.planetId]!.starId === setup.starId);
    if (has(setup.attackerId) && (has(setup.defenderId) || hasArmedDefenses(colony))) out.push("no battle took place");
  }
  return out;
}

function summarize(setup: LabSetup, after: GameState, reports: CombatReport[]): LabSummary {
  const r = reports[0]!;
  const events = reports.flatMap((x) => x.rounds.flat().map((e) => ({ e, ships: x.ships })));
  const ownerOf = (ships: CombatReport["ships"], key: string) => ships.find((s) => s.key === key);
  const sides = [setup.attackerId, setup.defenderId].map((id) => {
    const ships = Object.values(setup.ships[id]!).reduce((n, c) => n + c, 0);
    const shipsLeft = Object.values(after.fleets).filter((f) => f.ownerId === id).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
    const fire = events.filter(({ e, ships: s }) => e.kind === "fire" && ownerOf(s, e.ship)?.ownerId === id);
    const stationLost = events.some(({ e, ships: s }) => e.kind === "destroyed" && ownerOf(s, e.ship)?.ownerId === id && ownerOf(s, e.ship)?.kind === "station");
    const colony = Object.values(setup.state.colonies).find((c) => c.ownerId === id && setup.state.planets[c.planetId]!.starId === setup.starId);
    const planetKey = colony ? `planet:${colony.id}` : null;
    const planetSilenced = !!planetKey && events.some(({ e }) => e.kind === "destroyed" && e.ship === planetKey);
    return {
      id, name: after.players[id]!.name, ships, shipsLeft, shipsLost: Math.max(0, ships - shipsLeft),
      damageDealt: Math.round(fire.reduce((n, { e }) => n + (e.damage ?? 0), 0)),
      shots: fire.length, stationLost, planetSilenced,
    };
  });
  return { winner: r.winner, rounds: r.rounds.length, timedOut: r.rounds.length >= MAX_ROUNDS, sides };
}

export interface LabBatch {
  runs: number;
  wins: Record<PlayerId, number>;
  draws: number;
  avgRounds: number;
  /** Average ships each side lost. */
  avgLost: Record<PlayerId, number>;
  /** Each distinct problem and how many runs showed it. */
  problems: { message: string; runs: number; firstRun: number }[];
}

/** Fights the same setup `runs` times with different dice and adds up the results. */
export function batchCombatLab(setup: LabSetup, runs: number, from = 0): LabBatch {
  const batch: LabBatch = { runs: 0, wins: { [setup.attackerId]: 0, [setup.defenderId]: 0 }, draws: 0, avgRounds: 0, avgLost: { [setup.attackerId]: 0, [setup.defenderId]: 0 }, problems: [] };
  for (let i = from; i < from + runs; i++) addToBatch(batch, runCombatLab(setup, i), i);
  return finishBatch(batch);
}

/** Adds one run to a running batch (finishBatch turns the sums into averages). */
export function addToBatch(batch: LabBatch, res: LabResult, run: number): void {
  batch.runs++;
  const w = res.summary?.winner ?? null;
  if (w === null) batch.draws++;
  else batch.wins[w] = (batch.wins[w] ?? 0) + 1;
  batch.avgRounds += res.summary?.rounds ?? 0;
  for (const s of res.summary?.sides ?? []) batch.avgLost[s.id] = (batch.avgLost[s.id] ?? 0) + s.shipsLost;
  // Numbers in messages differ from run to run; group by the wording.
  for (const p of res.problems) {
    const key = p.replace(/^cb\d+: /, "").replace(/-?\d+(\.\d+)?/g, "#");
    const found = batch.problems.find((x) => x.message.replace(/^cb\d+: /, "").replace(/-?\d+(\.\d+)?/g, "#") === key);
    if (found) found.runs++;
    else batch.problems.push({ message: p, runs: 1, firstRun: run });
  }
}

export function finishBatch(batch: LabBatch): LabBatch {
  const n = Math.max(1, batch.runs);
  return {
    ...batch,
    avgRounds: Math.round((batch.avgRounds / n) * 10) / 10,
    avgLost: Object.fromEntries(Object.entries(batch.avgLost).map(([k, v]) => [k, Math.round((v / n) * 10) / 10])),
  };
}

export interface LabPreset {
  id: string;
  name: string;
  description: string;
  spec: Omit<CombatLabSpec, "seed">;
}

const side = (raceId: string, techLevel: number, ships: LabShips[]): LabSide => ({ raceId, techLevel, ships });
const noDefenses: Pick<LabDefender, "station" | "defenses" | "planetShield"> = { station: null, defenses: [], planetShield: null };

/** Ready-made battles covering ships, stations, armed planets and every weapon family. */
export const LAB_PRESETS: LabPreset[] = [
  {
    id: "fleets", name: "Fleet vs fleet", description: "Two identical beam fleets of the same race over an unarmed planet.",
    spec: {
      attacker: { ...side("terran", 6, [{ hull: "cruiser", arms: "beam", count: 4 }, { hull: "destroyer", arms: "beam", count: 4 }]), attacksPlanet: false },
      defender: { ...side("terran", 6, [{ hull: "cruiser", arms: "beam", count: 4 }, { hull: "destroyer", arms: "beam", count: 4 }]), ...noDefenses },
    },
  },
  {
    id: "missiles", name: "Missiles vs beams", description: "A missile fleet against a beam fleet with point defense.",
    spec: {
      attacker: { ...side("terran", 8, [{ hull: "cruiser", arms: "missile", count: 6 }]), attacksPlanet: false },
      defender: { ...side("terran", 8, [{ hull: "cruiser", arms: "beam", count: 6 }]), ...noDefenses },
    },
  },
  {
    id: "planet", name: "Fleet vs fortified planet", description: "A strike fleet with bombers (they bomb the planet after the battle) attacks a planet with batteries, a missile base, a shield and a Star Base.",
    spec: {
      attacker: { ...side("terran", 8, [{ hull: "battleship", arms: "beam", count: 5 }, { hull: "cruiser", arms: "bomb", count: 3 }]), attacksPlanet: true },
      defender: { ...side("terran", 8, []), station: "starBase", defenses: ["groundBatteries", "missileBase"], planetShield: "radiationShield" },
    },
  },
  {
    id: "fortress", name: "Siege of a Star Fortress", description: "A late-game armada against a Star Fortress, fighters, mines and a guard fleet.",
    spec: {
      attacker: { ...side("terran", 14, [{ hull: "titan", arms: "beam", count: 2 }, { hull: "battleship", arms: "missile", count: 4 }]), attacksPlanet: true },
      defender: { ...side("terran", 14, [{ hull: "battleship", arms: "beam", count: 2 }]), station: "starFortress", defenses: ["groundBatteries", "fighterGarrison", "artemisSystemNet"], planetShield: "fluxShield" },
    },
  },
  {
    id: "outpost", name: "Raid on a lone station", description: "Early frigates and destroyers against a Star Base and nothing else.",
    spec: {
      attacker: { ...side("terran", 2, [{ hull: "destroyer", arms: "beam", count: 5 }, { hull: "frigate", arms: "beam", count: 5 }]), attacksPlanet: true },
      defender: { ...side("terran", 2, []), station: "starBase", defenses: [], planetShield: null },
    },
  },
  {
    id: "doom", name: "Doom Stars", description: "Top-tech doom stars against a Star Fortress with every planet defense.",
    spec: {
      attacker: { ...side("terran", MAX_TECH_LEVEL, [{ hull: "doomStar", arms: "beam", count: 2 }, { hull: "titan", arms: "missile", count: 2 }]), attacksPlanet: true },
      defender: { ...side("terran", MAX_TECH_LEVEL, [{ hull: "doomStar", arms: "beam", count: 1 }]), station: "starFortress", defenses: [...LAB_DEFENSES], planetShield: "barrierShield" },
    },
  },
];

/** A random but reproducible lab battle, for fuzzing the combat code. */
export function randomLabSpec(seed: string): CombatLabSpec {
  const rng = new Rng(seedRng(`labspec:${seed}`));
  const races = RACES.map((r) => r.id);
  const hulls = HULLS.map((h) => h.id);
  const arms: LabArms[] = ["beam", "beam", "missile", "bomb"];
  const ships = (max: number): LabShips[] =>
    Array.from({ length: rng.int(0, 3) }, () => ({ hull: rng.pick(hulls), arms: rng.pick(arms), count: rng.int(1, max) }));
  const aLevel = rng.int(1, MAX_TECH_LEVEL);
  const dLevel = rng.chance(0.5) ? aLevel : rng.int(1, MAX_TECH_LEVEL);
  const attackerShips = ships(12);
  return {
    seed,
    nebula: rng.chance(0.15),
    shipInitiative: rng.chance(0.3),
    attacker: { raceId: rng.pick(races), techLevel: aLevel, ships: attackerShips.length ? attackerShips : [{ hull: "cruiser", arms: "beam", count: 3 }], attacksPlanet: rng.chance(0.6) },
    defender: {
      raceId: rng.pick(races), techLevel: dLevel, ships: ships(8),
      station: rng.chance(0.5) ? rng.pick(LAB_STATIONS) : null,
      defenses: LAB_DEFENSES.filter(() => rng.chance(0.35)),
      planetShield: rng.chance(0.4) ? rng.pick([...LAB_PLANET_SHIELDS]) : null,
    },
  };
}
