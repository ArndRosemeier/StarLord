import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { WEAPONS, type WeaponDef } from "./data/components.js";
import { ALL_WEAPONS, designStats, findDesign } from "./designs.js";
import { knows } from "./empire.js";
import type { Rng } from "./rng.js";
import type {
  Colony, CombatReport, CombatRoundEvent, CombatShipSnapshot, Fleet, GameState, LeaderSkills, PlayerId, ShipStack,
} from "./types.js";

/**
 * Tactical space combat on a 30x20 battlefield. Ships move toward targets and
 * fire every round; each side follows its owner's combat doctrine (target
 * focus and when to retreat). Planets fight with their orbital defenses.
 * The whole battle is recorded so the UI can replay it.
 */

export const FIELD_WIDTH = 30;
export const FIELD_HEIGHT = 20;
export const MAX_ROUNDS = 10;

export interface CombatSide {
  ownerId: PlayerId;
  fleets: Fleet[];
  /** The colony this side defends at this star, if any. */
  colony?: Colony;
  /** Whether this side will target the enemy's planet. */
  attacksPlanet: boolean;
}

export interface CombatOutcome {
  report: CombatReport;
  /** Ships left in each fleet (destroyed ones removed). */
  survivors: Map<string, ShipStack[]>;
  retreated: Set<PlayerId>;
  /** Fleets whose surviving ships all fled; they leave the system. */
  fled: Set<string>;
  /** True when a defending planet ends the battle with no working defenses. */
  planetSilenced: Map<PlayerId, boolean>;
}

interface Mount {
  weapon: WeaponDef;
  count: number;
  ammo: number;
}

interface Unit {
  key: string;
  side: 0 | 1;
  ownerId: PlayerId;
  fleetId: string | null;
  designId: string;
  name: string;
  x: number;
  y: number;
  hits: number;
  maxHits: number;
  shield: number;
  attack: number;
  defense: number;
  speed: number;
  mounts: Mount[];
  missileEvasion: number;
  pointDefense: number;
  repair: number;
  damageBonus: number;
  shieldPierce: number;
  displacement: number;
  strength: number;
  isPlanet: boolean;
  alive: boolean;
  retreated: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function captainSkills(state: GameState, fleetId: string): LeaderSkills {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "captain" && l.assignedTo === fleetId) return l.skills;
  }
  return {};
}

function shipUnits(state: GameState, side: CombatSide, sideIdx: 0 | 1): Unit[] {
  const units: Unit[] = [];
  const player = state.players[side.ownerId]!;
  let n = 0;
  for (const f of side.fleets) {
    const cap = captainSkills(state, f.id);
    for (const stack of f.ships) {
      const design = findDesign(player, stack.designId);
      if (!design) continue;
      const s = designStats(player, design);
      for (let i = 0; i < stack.count; i++) {
        const row = n++;
        units.push({
          key: `${f.id}:${stack.designId}:${i}`,
          side: sideIdx,
          ownerId: side.ownerId,
          fleetId: f.id,
          designId: stack.designId,
          name: design.name,
          x: sideIdx === 0 ? 2 + (row % 3) : FIELD_WIDTH - 3 - (row % 3),
          y: 2 + ((row * 3) % (FIELD_HEIGHT - 4)),
          hits: s.hits,
          maxHits: s.hits,
          shield: s.shield,
          attack: s.attack + (cap.attack ?? 0),
          defense: s.defense + (cap.defense ?? 0),
          speed: s.combatSpeed + (cap.combatSpeed ?? 0),
          mounts: s.weapons
            .map((m) => ({ weapon: ALL_WEAPONS[m.weaponId]!, count: m.count, ammo: ALL_WEAPONS[m.weaponId]?.ammo ?? Infinity }))
            .filter((m) => m.weapon && m.weapon.kind !== "bomb" && m.weapon.kind !== "spores"),
          missileEvasion: s.missileEvasion,
          pointDefense: s.pointDefense,
          repair: s.repair,
          damageBonus: s.damageBonus,
          shieldPierce: s.shieldPierce,
          displacement: s.displacement,
          strength: s.strength,
          isPlanet: false,
          alive: true,
          retreated: false,
        });
      }
    }
  }
  return units;
}

export interface PlanetDefenseStats {
  hits: number;
  shield: number;
  beams: number;
  missiles: number;
  attack: number;
}

export function planetDefense(colony: Colony): PlanetDefenseStats {
  const d: PlanetDefenseStats = { hits: 0, shield: 0, beams: 0, missiles: 0, attack: 0 };
  for (const id of colony.buildings) {
    const def = BUILDINGS_BY_ID[id]?.effects.defense;
    if (!def) continue;
    d.hits += def.hits ?? 0;
    d.shield = Math.max(d.shield, def.shield ?? 0);
    d.beams += def.beams ?? 0;
    d.missiles += def.missiles ?? 0;
    d.attack += def.attack ?? 0;
  }
  return d;
}

function bestKnown(state: GameState, ownerId: PlayerId, kind: "beam" | "missile"): WeaponDef {
  const player = state.players[ownerId]!;
  const options = WEAPONS.filter((w) => w.kind === kind && knows(player, w.requires));
  return options.at(-1) ?? WEAPONS.find((w) => w.kind === kind)!;
}

function planetUnit(state: GameState, side: CombatSide, sideIdx: 0 | 1): Unit | null {
  if (!side.colony) return null;
  const d = planetDefense(side.colony);
  if (d.hits <= 0 && d.beams <= 0 && d.missiles <= 0) return null;
  const mounts: Mount[] = [];
  if (d.beams > 0) mounts.push({ weapon: bestKnown(state, side.ownerId, "beam"), count: d.beams, ammo: Infinity });
  if (d.missiles > 0) mounts.push({ weapon: bestKnown(state, side.ownerId, "missile"), count: d.missiles, ammo: Infinity });
  const hits = Math.max(30, d.hits);
  return {
    key: `planet:${side.colony.id}`,
    side: sideIdx,
    ownerId: side.ownerId,
    fleetId: null,
    designId: "planet",
    name: side.colony.name,
    x: sideIdx === 0 ? 0.5 : FIELD_WIDTH - 0.5,
    y: FIELD_HEIGHT / 2,
    hits,
    maxHits: hits,
    shield: d.shield,
    attack: 25 + d.attack,
    defense: 0,
    speed: 0,
    mounts,
    missileEvasion: 0,
    pointDefense: 0.2,
    repair: 0,
    damageBonus: 0,
    shieldPierce: 0,
    displacement: 0,
    strength: Math.sqrt(hits * (d.beams * 6 + d.missiles * 8)) * (1 + d.shield / 5),
    isPlanet: true,
    alive: true,
    retreated: false,
  };
}

const armed = (u: Unit) => u.alive && !u.retreated && u.mounts.length > 0;
const active = (u: Unit) => u.alive && !u.retreated;

export function resolveCombat(state: GameState, rng: Rng, starId: string, a: CombatSide, b: CombatSide, reportId: string): CombatOutcome {
  const sides = [a, b] as const;
  const units: Unit[] = [...shipUnits(state, a, 0), ...shipUnits(state, b, 1)];
  for (const [i, s] of sides.entries()) {
    const p = planetUnit(state, s, i as 0 | 1);
    if (p) units.push(p);
  }

  const snapshots: CombatShipSnapshot[] = units.map((u) => ({
    key: u.key, ownerId: u.ownerId, designId: u.designId, name: u.name, maxHits: u.maxHits, x: u.x, y: u.y, isPlanet: u.isPlanet,
  }));
  const rounds: CombatRoundEvent[][] = [];
  const retreated = new Set<PlayerId>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const log: CombatRoundEvent[] = [];
    rounds.push(log);
    // Faster ships act first; random tiebreak.
    const order = units.filter(active).map((u) => ({ u, r: rng.next() }));
    order.sort((x, y) => y.u.speed - x.u.speed || x.r - y.r);

    for (const { u } of order) {
      if (!active(u)) continue;
      const enemies = units.filter((e) => e.side !== u.side && active(e));
      if (enemies.length === 0) break;

      // Unarmed ships try to slip away.
      if (!u.isPlanet && u.mounts.length === 0) {
        if (rng.chance(0.5)) {
          u.retreated = true;
          log.push({ kind: "retreat", ship: u.key });
        }
        continue;
      }

      const target = chooseTarget(state, u, enemies, sides[u.side]!);
      if (!target) continue;

      if (u.speed > 0) {
        const want = preferredRange(u);
        const d = dist(u, target);
        if (d > want) {
          const step = Math.min(u.speed, d - want);
          u.x = round1(u.x + ((target.x - u.x) / d) * step);
          u.y = round1(u.y + ((target.y - u.y) / d) * step);
          log.push({ kind: "move", ship: u.key, x: u.x, y: u.y });
        }
      }
      fire(rng, u, target, log);
    }

    for (const u of units) {
      if (active(u) && u.repair > 0) u.hits = Math.min(u.maxHits, u.hits + Math.round(u.maxHits * u.repair));
    }

    // Retreat by doctrine once the first exchange shows how the fight is going.
    if (round >= 1) {
      for (const idx of [0, 1] as const) {
        const side = sides[idx]!;
        const owner = state.players[side.ownerId]!;
        if (owner.kind !== "empire") continue;
        const mine = units.filter((x) => x.side === idx && active(x));
        if (mine.length === 0 || mine.some((x) => x.isPlanet)) continue;
        const myStrength = sideStrength(mine);
        const theirStrength = sideStrength(units.filter((x) => x.side !== idx && active(x)));
        if (theirStrength > 0 && myStrength < owner.doctrine.retreatBelow * theirStrength) {
          for (const x of mine) {
            x.retreated = true;
            log.push({ kind: "retreat", ship: x.key });
          }
          retreated.add(side.ownerId);
        }
      }
    }

    const armedA = units.some((x) => x.side === 0 && armed(x));
    const armedB = units.some((x) => x.side === 1 && armed(x));
    const anyA = units.some((x) => x.side === 0 && active(x));
    const anyB = units.some((x) => x.side === 1 && active(x));
    if (!anyA || !anyB || (!armedA && !armedB)) break;
  }

  const aliveArmed = (idx: 0 | 1) => units.some((x) => x.side === idx && armed(x));
  const winnerIdx = aliveArmed(0) && !aliveArmed(1) ? 0 : aliveArmed(1) && !aliveArmed(0) ? 1 : null;

  const survivors = new Map<string, ShipStack[]>();
  for (const s of sides) {
    for (const f of s.fleets) {
      const counts = new Map<string, number>();
      for (const u of units) if (u.fleetId === f.id && u.alive) counts.set(u.designId, (counts.get(u.designId) ?? 0) + 1);
      survivors.set(f.id, [...counts].map(([designId, count]) => ({ designId, count })));
    }
  }
  const losses: Record<string, number> = {};
  for (const u of units) if (!u.alive && !u.isPlanet) losses[u.ownerId] = (losses[u.ownerId] ?? 0) + 1;

  const fled = new Set<string>();
  for (const s of sides) {
    for (const f of s.fleets) {
      const mine = units.filter((u) => u.fleetId === f.id && u.alive);
      if (mine.length > 0 && mine.every((u) => u.retreated)) fled.add(f.id);
    }
  }

  const planetSilenced = new Map<PlayerId, boolean>();
  for (const [i, s] of sides.entries()) {
    if (!s.colony) continue;
    const p = units.find((u) => u.isPlanet && u.side === i);
    planetSilenced.set(s.ownerId, !p || !p.alive);
  }

  return {
    report: {
      id: reportId,
      turn: state.turn,
      starId,
      sides: [a.ownerId, b.ownerId],
      ships: snapshots,
      rounds,
      winner: winnerIdx === null ? null : sides[winnerIdx]!.ownerId,
      losses,
    },
    survivors,
    retreated,
    fled,
    planetSilenced,
  };
}

function sideStrength(units: Unit[]): number {
  return units.reduce((sum, u) => sum + (u.mounts.length ? u.strength * (u.hits / u.maxHits) : 0), 0);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function preferredRange(u: Unit): number {
  const beams = u.mounts.filter((m) => m.weapon.kind === "beam");
  if (beams.length > 0) return Math.max(1, Math.min(...beams.map((m) => m.weapon.range)) / 2);
  return 8;
}

function chooseTarget(state: GameState, u: Unit, enemies: Unit[], side: CombatSide): Unit | undefined {
  // Planets are only shot at by sides that came to attack them, and only once their ships are gone.
  const ships = enemies.filter((e) => !e.isPlanet);
  // Planets never duel each other; ships go after a planet only when they came to attack it.
  const pool = ships.length > 0 || u.isPlanet ? ships : side.attacksPlanet ? enemies : [];
  if (pool.length === 0) return undefined;
  const owner = state.players[u.ownerId]!;
  const focus = owner.kind === "empire" ? owner.doctrine.focus : "nearest";
  const by = (f: (e: Unit) => number) => pool.reduce((best, e) => (f(e) < f(best) ? e : best), pool[0]!);
  if (focus === "weakest") return by((e) => e.hits);
  if (focus === "strongest") return by((e) => -e.strength);
  return by((e) => dist(u, e));
}

function fire(rng: Rng, u: Unit, target: Unit, log: CombatRoundEvent[]): void {
  const d = dist(u, target);
  for (const m of u.mounts) {
    if (!target.alive) return;
    if (m.ammo <= 0 || d > m.weapon.range + 0.01) continue;
    const isMissile = m.weapon.kind === "missile" || m.weapon.kind === "torpedo";
    if (isMissile) m.ammo -= 1;
    let total = 0;
    let hits = 0;
    for (let i = 0; i < m.count; i++) {
      if (target.displacement > 0 && rng.chance(target.displacement)) continue;
      if (isMissile) {
        if (rng.chance(target.pointDefense)) continue;
        const evasion = m.weapon.kind === "torpedo" ? target.missileEvasion / 2 : target.missileEvasion;
        if (rng.chance(evasion)) continue;
      } else {
        const chance = Math.max(0.05, Math.min(0.95, 0.5 + (u.attack - target.defense) / 100));
        if (!rng.chance(chance)) continue;
      }
      let dmg = rng.int(m.weapon.damageMin, m.weapon.damageMax) + (isMissile ? 0 : u.damageBonus);
      if (!isMissile && d > m.weapon.range / 2) dmg = Math.floor(dmg * 0.75);
      const shield = Math.max(0, target.shield * (1 - u.shieldPierce) - (m.weapon.pierce ?? 0));
      dmg = Math.max(0, dmg - (isMissile ? Math.ceil(shield / 2) : shield));
      if (dmg <= 0) continue;
      hits++;
      total += dmg;
      target.hits -= dmg;
      if (target.hits <= 0) break;
    }
    log.push({ kind: "fire", ship: u.key, target: target.key, weapon: m.weapon.id, damage: total, hit: hits > 0 });
    if (target.hits <= 0 && target.alive) {
      target.alive = false;
      target.hits = 0;
      log.push({ kind: "destroyed", ship: target.key });
    }
  }
}

/** Damage an attack-stance fleet's bombs do to an undefended colony in one turn. */
export function bombardment(state: GameState, fleet: Fleet): { bombs: number; spores: number } {
  const player = state.players[fleet.ownerId]!;
  let bombs = 0;
  let spores = 0;
  for (const s of fleet.ships) {
    const d = findDesign(player, s.designId);
    if (!d) continue;
    const stats = designStats(player, d);
    for (const m of stats.weapons) {
      const w = ALL_WEAPONS[m.weaponId];
      if (!w) continue;
      if (w.kind === "bomb") bombs += ((w.damageMin + w.damageMax) / 2) * m.count * s.count * (1 + stats.bombBonus);
      if (w.kind === "spores") spores += w.damageMax * m.count * s.count;
    }
  }
  return { bombs, spores };
}
