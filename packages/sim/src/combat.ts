import { BUILDINGS_BY_ID, FIGHTER_GARRISON } from "./data/buildings.js";
import { fighterGarrison } from "./economy.js";
import {
  ARCS, HULLS, HULLS_BY_ID, MOD_EFFECTS, SCANNER_ECCM, SPECIALS_BY_ID, STATION_HULLS, UNHITTABLE_SPECIALS, WEAPONS,
  hullIndex, type FiringArc, type HullDef, type StationHull, type WeaponDef, type WeaponModId, type WeaponTrait,
} from "./data/components.js";
import {
  ANTI_MISSILE, ARTEMIS, BEAM_HIT, BLACK_HOLE_TURNS, BOARDING, CRAFT, CRAFT_ARMOR_STEP, CRAFT_SPEED_PER_DRIVE, CREW,
  DEFENSE_CREW_LEVEL, DEFENSE_PER_SPEED, DEPLOY, DIE, EXPLOSION, FIELD_HEIGHT, FIELD_WIDTH, IMMOBILE_DEFENSE, MAX_BAND,
  MAX_ROUNDS, MISSILE_DEFENSE_BONUS, MISSILE_DEFENSE_PER_SPEED, MISSILE_HP, MISSILE_SPEED, PLANET_BEAM_DAMAGE,
  PLANET_INSTALLATION_ARMOR_STEP, PLANET_INSTALLATION_HP, PLANET_SIZE_INDEX, PLANET_TORPEDO_DAMAGE, PLASMA_WEB_DECAY,
  RANGE_BANDS, RETREAT, SHIELD_FACINGS, SHIELD_REGEN, SIDE_ATTACK_BY_IMMOBILE_SIZE, SQUADRON_SIZE, STATION_FREE_SPECIALS,
  STATION_HEAVY_ARMOR_MULT, STATION_MAX_SPECIALS, STATION_REINFORCED_MULT, STATION_TURN_DEG, TORPEDO_DISSIPATION,
  TORPEDO_HP, TURN_COST_PER_STEP, REPAIR, AREA_BLAST_PROJECTILE, AREA_BLAST_RADIUS, BOMBARD_ROUNDS, COMBAT_BOMB_RANGE,
  DAMAGE, FOOTPRINT, PHASING_TURNS, PLANET_POPULATION_HP,
} from "./data/combat.js";
import { ARMORS, DRIVES } from "./data/components.js";
import { crewLevel } from "./crew.js";
import {
  ALL_WEAPONS, bestArmor, bestBeam, bestComputer, bestDrive, bestShield, designStats, findDesign, groundBatteryWeapons,
  mergeEffects, missileBaseWeapons, mountFirepower, noEffects, rackShots, stationWeapons, strengthOf, supportDesign, weaponHP,
  weaponUnitCost, type MergedEffects,
} from "./designs.js";
import { empireBonus, knows } from "./empire.js";
import { getRace, hasTrait } from "./data/races.js";
import { troopUnit } from "./ground.js";
import { designStyle } from "./data/shipStyles.js";
import {
  raceCombatRepair, raceCombatSpeedBonus, raceGroundBonus, shipAttackPickBonus, shipDefensePickBonus,
} from "./raceEffects.js";
import type { Rng } from "./rng.js";
import type {
  Colony, CombatReport, CombatRoundEvent, CombatShipSnapshot, Fleet, GameState, LeaderSkills, Player, PlayerId, TacticalOrder,
  ShipStack, WeaponMount,
} from "./types.js";

export { FIELD_HEIGHT, FIELD_WIDTH, MAX_ROUNDS, MISSILE_SPEED, PLANET_INSTALLATION_HP };
export {
  ANTI_MISSILE, AREA_BLAST_RADIUS, BLACK_HOLE_TURNS, BOARDING, BOMBARD_ROUNDS, COMBAT_BOMB_RANGE, CRAFT, DAMAGE, DEFENSE_CREW_LEVEL, DEPLOY,
  EXPLOSION, FOOTPRINT, GROUND_BATTERY_SPACE, MISSILE_BASE, PHASING_TURNS, PLANET_POPULATION_HP, RETREAT, SIDE_ATTACK_BY_IMMOBILE_SIZE,
  STATION_ARMS,
} from "./data/combat.js";

/** Squares per combat turn of a missile or torpedo an empire fires (before the Fast mod). */
export function missileSpeed(player: Player, w: WeaponDef): number {
  if (w.kind !== "missile") return w.speed ?? MISSILE_SPEED.base;
  return MISSILE_SPEED.base + MISSILE_SPEED.perDrive * DRIVES.indexOf(bestDrive(player));
}

/** Squares per combat turn of an empire's fighters, bombers or shuttles from a bay. */
export function craftSpeed(player: Player, w: WeaponDef): number {
  return (w.speed ?? 0) + CRAFT_SPEED_PER_DRIVE * DRIVES.indexOf(bestDrive(player)) + raceCombatSpeedBonus(getRace(player.raceId));
}

/** Armor classes above Titanium: craft hit points and planetary installations grow with it. */
function armorClass(player: Player): number {
  return Math.max(0, ARMORS.findIndex((a) => a.id === bestArmor(player).id));
}

/**
 * Tactical space combat with the original's rules. Ships carry armor,
 * structure and internal systems (drive, computer, shield generator, each
 * weapon and special); shields take a fixed amount off every hit and soak
 * the rest on the facing that was hit. Beams roll against beam defense with
 * range bands, and their damage scales with how well the roll went.
 * Missiles and fighters fly across the field and can be shot down or
 * jammed. Orbital stations and the planet's ground defenses fight as
 * separate immobile units. Sides take turns; each ship turns, moves and
 * fires. Every event is recorded for the replay.
 */

export interface CombatSide {
  ownerId: PlayerId;
  fleets: Fleet[];
  /** The colony this side defends at this star, if any. */
  colony?: Colony;
  /** Whether this side will target the enemy's planet. */
  attacksPlanet: boolean;
  /** This side started the fight (it picked the target); it attacks unless it is at its own colony. */
  initiates?: boolean;
}

export interface CapturedShip {
  /** Player who boarded and took the ship, the fleet it joins (null: a new fleet at the star), and where it came from. */
  ownerId: PlayerId;
  fleetId: string | null;
  fromOwner: PlayerId;
  designId: string;
}

export interface CombatOutcome {
  report: CombatReport;
  /** Ships left in each fleet (destroyed and captured ones removed). */
  survivors: Map<string, ShipStack[]>;
  /** Players with at least one ship that retreated. */
  retreated: Set<PlayerId>;
  /** Fleets whose surviving ships all fled; they leave the system. */
  fled: Set<string>;
  /** Ships that retreated from fleets whose other survivors stayed: they split off and leave. */
  retreatedShips: Map<string, ShipStack[]>;
  /** Fleets whose captain was killed when boarders took the ship carrying them. */
  captainsKilled: string[];
  /** True when a defending colony ends the battle with no working defenses (planet and station). */
  planetSilenced: Map<PlayerId, boolean>;
  /** Colonies whose orbital station was destroyed; the building is lost. */
  stationsLost: Set<string>;
  /** Ships taken by boarding parties of a side that held the field. */
  captured: CapturedShip[];
  /** Experience the winner's surviving crews (and captains) gain, if anyone won. */
  crewXp: { ownerId: PlayerId; amount: number } | null;
  /** Which side attacked (0 or 1); the defender acts second and holds the field when time runs out. */
  attacker: 0 | 1;
  /** Bombing hits on colonies whose installations were gone (bombs and fire on the planet in battle). */
  colonyHits: Map<string, number>;
}

type UnitKind = "ship" | "station" | "planet" | "monster";

interface Mount {
  def: WeaponDef;
  mods: Set<WeaponModId>;
  traits: Set<WeaponTrait>;
  arc: FiringArc;
  /** Working weapons in this mount, and the damage on the next one to break. */
  count: number;
  hpEach: number;
  wound: number;
  /** Shots left this battle (missile racks, bombs, anti-missile rockets). */
  shots: number;
  /** Turns before it can fire again (torpedoes reload). */
  cooldown: number;
  /** Squadron in flight, and turns until a bay can launch again. */
  out: boolean;
  rearm: number;
  /** Planet weapons belong to an installation. */
  installation?: number;
  /** A Fighter Garrison's craft per launch; its losses are replaced every few combat turns. */
  garrison?: number;
  firedThisRound: boolean;
  /** Weapons the mount started with (in-battle repair can bring broken ones back). */
  maxCount: number;
  /** Hyper-X Capacitors or Fast Missile Racks: the next volley is a double one. */
  double: boolean;
}

interface System {
  id: string;
  hp: number;
  max: number;
  /** Index of the weapon mount this system is, if any. */
  mount?: number;
}

interface Installation {
  name: string;
  alive: boolean;
}

interface Unit {
  key: string;
  side: 0 | 1;
  ownerId: PlayerId;
  player: Player;
  fleetId: string | null;
  colonyId: string | null;
  designId: string;
  name: string;
  kind: UnitKind;
  hullId?: string;
  shipStyle?: string;
  sizeClass: number;
  x: number;
  y: number;
  heading: number;
  armor: number;
  maxArmor: number;
  structure: number;
  maxStructure: number;
  /** Damage taken off every hit, and each facing's pool. */
  shieldClass: number;
  shieldMax: number;
  shields: number[];
  hardShields: boolean;
  /** Planets block a flat amount per hit and hold their weapons in installations. */
  planetShield: number;
  installations: Installation[];
  /** Damage needed to knock out one installation, and the damage gathered toward the next. */
  installationHP: number;
  installationPool: number;
  /** Crew level and the beam attack, beam defense and boarding it adds. */
  crew: number;
  /**
   * Hull size the original keys many rules on: frigate 0 … doom star 5. Stations fight as a cruiser (Star
   * Base), battleship (Battlestation) or titan (Star Fortress), the planet as a battleship. Battle experience
   * for destroying a unit is this + 1; an explosion strikes a unit this + 1 times.
   */
  hullRank: number;
  drive: System | null;
  computer: System | null;
  shieldGen: System | null;
  specials: System[];
  /** Beam attack without the computer, the computer's bonus, and beam defense besides speed. */
  attackBase: number;
  computerAttack: number;
  defenseBonus: number;
  /** Stations and monsters have a set beam defense. */
  fixedDefense: number | null;
  speed: number;
  missileEvasion: number;
  fx: MergedEffects;
  mounts: Mount[];
  marines: number;
  immobile: boolean;
  noArmorPierce: boolean;
  alive: boolean;
  retreated: boolean;
  /** Ordered to retreat: the ship escapes at the start of its next activation unless it is stopped first. */
  retreatOrdered: boolean;
  /**
   * Taken by boarders. The ship changes hands; unless the captor is telepathic it does nothing more this
   * battle (and is out of the fight), and it is destroyed if the captor's side does not win.
   */
  captured: { by: Unit; fightsOn: boolean } | null;
  /** Side and owner the unit started the battle with. */
  origSide: 0 | 1;
  origOwner: PlayerId;
  /** Drive hit points of the hull row it fights as, which set the size of its explosion. */
  blastDriveHP: number;
  /** The fleet's captain rides on this ship (the first of its fleet). */
  flagship: boolean;
  // Per-battle state.
  firedThisRound: boolean;
  firedLastRound: boolean;
  /** Own turns a phasing cloak still keeps the ship phased out (while it holds its fire). */
  phasingLeft: number;
  tractor: number;
  /** Held in a stasis field by this unit: it cannot act or be touched until released. */
  held: Unit | null;
  /** Caught by a black hole generator; the counter starts at 1 and the ship is lost when it reaches BLACK_HOLE_TURNS. */
  blackHole: { by: Unit; turns: number } | null;
  /** Energy stored by an Energy Absorber, fired back with the ship's next shot. */
  absorbed: number;
  /** Beam attack and defense of the unit's fighters and bombers. */
  craftAttack: number;
  craftDefenseBonus: number;
  /** A planet's own shield, which alone protects its people once its installations are gone. */
  popShield: number;
  /** Damage gathered toward the next bombing hit on a planet's colony, and the hits so far. */
  popPool: number;
  popHits: number;
  web: { by: Unit; damage: number } | null;
  moved: boolean;
  strength: number;
  craftBeam: WeaponDef;
  craftBomb: WeaponDef | null;
  scannerEccm: number;
}

interface Projectile {
  owner: Unit;
  mount: number;
  weapon: WeaponDef;
  mods: Set<WeaponModId>;
  target: Unit;
  x: number;
  y: number;
  speed: number;
  /** Beam defense of each missile or craft against point defense. */
  defense: number;
  /** Missiles, torpedoes or craft still flying, and the hit points of each. */
  count: number;
  hp: number;
  frontDamage: number;
  damage: number;
  travelled: number;
  craft: "fighters" | "bombers" | "heavyFighters" | "shuttles" | null;
  /** Attack passes a squadron has left: one a combat turn once it reaches its target. */
  passes?: number;
}

interface Hit {
  absorbed: number;
  armor: number;
  structure: number;
  system?: string;
}

interface HitOptions {
  shieldPiercing?: boolean;
  ignoreShields?: boolean;
  armorPiercing?: boolean;
  bypassArmor?: boolean;
  emissions?: boolean;
  systemsOnly?: boolean;
  killsMarines?: boolean;
  extraStructural?: boolean;
  /** Straight to the structure: no shields, armor or systems (Gyro Destabilizer, Spatial Compressor). */
  structureOnly?: boolean;
  /** Facing hit; enveloping weapons hit all four in turn. */
  facing?: number;
  fromShip?: boolean;
  isBeam?: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const TAU = Math.PI * 2;
const STEP = Math.PI / 8;

function normAngle(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
}

interface OfficerBonus {
  attack: number;
  defense: number;
  damagePct: number;
  fighters: number;
}

function noOfficers(): OfficerBonus {
  return { attack: 0, defense: 0, damagePct: 0, fighters: 0 };
}

function captainSkills(state: GameState, fleetId: string): LeaderSkills {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "captain" && l.ownerId !== null && l.assignedTo === fleetId) return l.skills;
  }
  return {};
}

/** Initiative from the owner's administrator with Tactics posted in the system (0 without one). */
export function tacticsAt(state: GameState, starId: string, ownerId: PlayerId): number {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "administrator" && l.ownerId === ownerId && l.assignedTo === starId) return l.skills.initiative ?? 0;
  }
  return 0;
}

/**
 * Advanced Damage Control, a cybernetic race or an Engineer captain repair
 * every ship completely after a battle (an Automated Repair Unit does it for
 * its own ship).
 */
function fullRepairAfterBattle(state: GameState, ownerId: PlayerId, fleetId: string): boolean {
  const player = state.players[ownerId]!;
  if (player.kind !== "empire") return true;
  if (knows(player, REPAIR.fullRepairTech) || raceCombatRepair(getRace(player.raceId)).hull > 0) return true;
  return (captainSkills(state, fleetId).shieldRecharge ?? 0) > 0;
}

function scannerEccm(player: Player): number {
  return Math.max(0, ...SCANNER_ECCM.filter((s) => knows(player, s.tech)).map((s) => s.value));
}

/** Craft carry the known beam that can be point-defense mounted with the highest top damage (a laser at first), and the hardest-hitting known bomb. */
function craftLoadout(player: Player): { beam: WeaponDef; bomb: WeaponDef | null } {
  const beams = WEAPONS.filter((w) => w.kind === "beam" && w.mods.includes("pointDefense") && knows(player, w.requires));
  const beam = beams.reduce((b, w) => (w.damageMax > b.damageMax ? w : b), beams[0] ?? WEAPONS.find((w) => w.id === "laserCannon")!);
  const bombs = WEAPONS.filter((w) => w.kind === "bomb" && knows(player, w.requires));
  const bomb = bombs.reduce<WeaponDef | null>((b, w) => (!b || w.damageMax > b.damageMax ? w : b), null);
  return { beam, bomb };
}

/** Craft beam attack (base + best computer + race ship attack) and defense bonus (race ship defense). */
function craftRatings(player: Player): { craftAttack: number; craftDefenseBonus: number } {
  if (player.kind !== "empire" && player.kind !== "raiders") return { craftAttack: CRAFT.attackBase, craftDefenseBonus: 0 };
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  return {
    craftAttack: CRAFT.attackBase + (bestComputer(player)?.attack ?? 0) + shipAttackPickBonus(race) + bonus.shipAttack,
    craftDefenseBonus: shipDefensePickBonus(race) + bonus.shipDefense,
  };
}

function makeMounts(player: Player, weapons: WeaponMount[], unlimited: boolean, allRound: boolean, installation?: number): Mount[] {
  const out: Mount[] = [];
  for (const m of weapons) {
    const def = ALL_WEAPONS[m.weaponId];
    // Bombs drop on the planet in battle; biological weapons are only used after it.
    if (!def || def.kind === "spores" || (def.kind === "bomb" && unlimited)) continue;
    const space = def.requires === "never" ? 10 : weaponUnitCost(player, m).space;
    out.push({
      def,
      mods: new Set(m.mods ?? []),
      traits: new Set(def.traits ?? []),
      arc: allRound || def.kind !== "beam" ? "full" : (m.arc ?? "forward"),
      count: m.count,
      hpEach: weaponHP(space),
      wound: 0,
      // Station and planet beams never run dry; missiles keep their racks (20 shots on a station, 125 in a missile base).
      shots: unlimited && def.kind !== "missile" ? Infinity : rackShots(def, m),
      cooldown: 0,
      out: false,
      rearm: 0,
      installation,
      firedThisRound: false,
      maxCount: m.count,
      double: true,
    });
  }
  return out;
}

function baseUnit(player: Player, side: 0 | 1): Omit<Unit, "key" | "designId" | "name" | "kind" | "sizeClass" | "x" | "y" | "armor" | "maxArmor" | "structure" | "maxStructure" | "mounts" | "attackBase" | "computerAttack" | "defenseBonus" | "speed" | "strength"> {
  const craft = craftLoadout(player);
  return {
    side, ownerId: player.id, player, fleetId: null, colonyId: null, heading: side === 0 ? 0 : Math.PI,
    shieldClass: 0, shieldMax: 0, shields: [0, 0, 0, 0], hardShields: false, planetShield: 0, installations: [],
    installationHP: 0, installationPool: 0, crew: 0, hullRank: 0,
    drive: null, computer: null, shieldGen: null, specials: [], fixedDefense: null, missileEvasion: 0, fx: noEffects(),
    marines: 0, immobile: false, noArmorPierce: false, alive: true, retreated: false, retreatOrdered: false, captured: null,
    origSide: side, origOwner: player.id, blastDriveHP: 0, flagship: false,
    firedThisRound: false, firedLastRound: true, phasingLeft: 0, tractor: 0,
    held: null, blackHole: null, web: null, moved: false, craftBeam: craft.beam, craftBomb: craft.bomb,
    scannerEccm: scannerEccm(player), absorbed: 0, ...craftRatings(player), popShield: 0, popPool: 0, popHits: 0,
  };
}

function shipUnits(state: GameState, side: CombatSide, sideIdx: 0 | 1): Unit[] {
  const units: Unit[] = [];
  const player = state.players[side.ownerId]!;
  for (const f of side.fleets) {
    const cap = captainSkills(state, f.id);
    const cyber = raceCombatRepair(getRace(player.raceId));
    let first = true;
    for (const stack of f.ships) {
      const stored = findDesign(player, stack.designId);
      if (!stored) continue;
      const design = stored.module ? supportDesign(player, stored) : stored;
      const s = designStats(player, design);
      const monster = !!design.fixed;
      // A fixed design that never moves (the raiders' citadel) fights like an orbital station.
      const fortress = !!design.fixed?.immobile;
      // Damaged ships come last in a stack; they start with the armor, then structure, they lost.
      const intact = stack.count - (stack.damage?.length ?? 0);
      for (let i = 0; i < stack.count; i++) {
        const lost = i < intact ? 0 : stack.damage![i - intact]!;
        const mounts = makeMounts(player, s.weapons, false, false);
        const u: Unit = {
          ...baseUnit(player, sideIdx),
          key: `${f.id}:${stack.designId}:${i}`,
          fleetId: f.id,
          designId: stack.designId,
          name: design.name,
          kind: fortress ? "station" : monster ? "monster" : "ship",
          hullId: fortress ? "starFortress" : monster ? undefined : design.hull,
          shipStyle: fortress || monster ? undefined : designStyle(player, design),
          sizeClass: s.sizeClass,
          // Placed by deploy() once every unit is known.
          x: DEPLOY.leftColumn,
          y: DEPLOY.centreRow,
          armor: Math.max(0, s.armor - lost), maxArmor: s.armor,
          structure: Math.max(1, s.structure - Math.max(0, lost - s.armor)), maxStructure: s.structure,
          shieldClass: s.shield, shieldMax: s.shieldStrength, shields: Array(SHIELD_FACINGS).fill(s.shieldStrength),
          hardShields: s.effects.hardShields > 0,
          mounts,
          attackBase: s.attack - (design.computer && !monster ? computerBonus(design.computer) : 0),
          computerAttack: design.computer && !monster ? computerBonus(design.computer) : 0,
          defenseBonus: monster ? 0 : s.defense - s.combatSpeed * DEFENSE_PER_SPEED,
          fixedDefense: monster ? s.defense : null,
          speed: s.combatSpeed,
          missileEvasion: s.missileEvasion,
          // Captains' Engineer and Security skills; cybernetic races patch their ships up mid-battle.
          fx: monster ? s.effects : {
            ...s.effects,
            shieldRegen: s.effects.shieldRegen + (cap.shieldRecharge ?? 0) / 100,
            boardingDefense: s.effects.boardingDefense + (cap.boardingDefense ?? 0),
            // The original adds the repair shares up: an Automated Repair Unit's 20% and a cybernetic race's 10%.
            repair: s.effects.repair + cyber.hull,
            repairSystems: s.effects.repairSystems + cyber.systems,
          },
          marines: s.marines,
          immobile: fortress,
          noArmorPierce: design.specials.includes("heavyArmor") || design.armor === "xentroniumArmor",
          phasingLeft: s.effects.phasing > 0 ? PHASING_TURNS : 0,
          strength: s.strength,
          crew: design.fixed?.crew ?? (monster ? 0 : crewLevel(player.kind === "raiders" ? Math.max(stack.xp ?? 0, CREW.raiderXp) : stack.xp ?? 0, player)),
          hullRank: fortress ? hullIndex(HULLS_BY_ID.starFortress.asHull!) : hullIndex(design.hull),
          blastDriveHP: monster ? 0 : HULLS_BY_ID[design.hull].driveHP,
          flagship: first,
        };
        first = false;
        if (!monster) {
          if (s.driveHP > 0) u.drive = { id: "drive", hp: s.driveHP, max: s.driveHP };
          if (s.computerHP > 0) u.computer = { id: "computer", hp: s.computerHP, max: s.computerHP };
          if (s.shieldGenHP > 0) u.shieldGen = { id: "shield", hp: s.shieldGenHP, max: s.shieldGenHP };
          for (const id of design.specials) {
            const def = SPECIALS_BY_ID[id];
            if (!def || UNHITTABLE_SPECIALS.has(id)) continue;
            const hp = Math.max(1, Math.floor(Math.max(0, def.space[hullIndex(design.hull)]!) / 10));
            u.specials.push({ id, hp, max: hp });
          }
        }
        units.push(u);
      }
    }
  }
  return units;
}

function computerBonus(id: string): number {
  return ({ electronicComputer: 25, optronicComputer: 50, positronicComputer: 75, cyberneticComputer: 100, moleculartronicComputer: 125 } as Record<string, number>)[id] ?? 0;
}

export interface ColonyDefense {
  station: StationHull | null;
  installations: ("groundBatteries" | "missileBase" | "stellarConverter" | "fighterGarrison")[];
  mines: boolean;
  shield: number;
}

export function planetDefense(colony: Colony): ColonyDefense {
  const d: ColonyDefense = { station: null, installations: [], mines: false, shield: 0 };
  for (const id of colony.buildings) {
    const def = BUILDINGS_BY_ID[id]?.effects.defense;
    if (!def) continue;
    if (def.station) {
      const rank = (s: StationHull | null) => (s ? STATION_HULLS.findIndex((h) => h.id === s) : -1);
      if (rank(def.station) > rank(d.station)) d.station = def.station;
    }
    if (def.installation && !d.installations.includes(def.installation)) d.installations.push(def.installation);
    if (def.fighters && !d.installations.includes("fighterGarrison")) d.installations.push("fighterGarrison");
    if (def.mines) d.mines = true;
    d.shield = Math.max(d.shield, def.shield ?? 0);
  }
  return d;
}

/** Whether a colony has anything that shoots: a station, ground batteries, a missile base or mines. */
export function hasArmedDefenses(colony: Colony | undefined): boolean {
  if (!colony) return false;
  const d = planetDefense(colony);
  return d.station !== null || d.installations.length > 0 || d.mines;
}

/** Specials a station gets for free: each the owner knows, in the original's order, up to eight. */
export function stationSpecials(player: Player): string[] {
  const out: string[] = [];
  for (const entry of STATION_FREE_SPECIALS) {
    if (out.length >= STATION_MAX_SPECIALS) break;
    const pick = (typeof entry === "string" ? [entry] : entry).find((id) => knows(player, SPECIALS_BY_ID[id]?.requires ?? id));
    if (pick) out.push(pick);
  }
  return out;
}

/**
 * An orbital station fights as the ship hull of its size (Star Base a
 * cruiser, Battlestation a battleship, Star Fortress a titan): shields, its
 * internal systems and the experience for destroying it come from that hull.
 * It carries the owner's best armor, shield and computer, a Regular crew, its
 * hull's marines and the free specials the owner knows.
 */
function stationUnit(player: Player, colony: Colony, hull: HullDef<StationHull>, sideIdx: 0 | 1): Unit {
  const armor = bestArmor(player);
  const shield = bestShield(player);
  const computer = bestComputer(player);
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  const weapons = stationWeapons(player, hull);
  const specials = stationSpecials(player);
  const fx = mergeEffects(specials);
  const size = hullIndex(hull.asHull ?? "titan");
  const shieldClass = shield ? shield.absorb + fx.hardShields : 0;
  const shieldMax = shield ? Math.round(shield.absorb * 5 * hull.sizeClass * fx.shieldStrengthMult) : 0;
  // Race ship attack counts; race ship defense needs a drive, so stations go without it.
  const attackBase = shipAttackPickBonus(race) + bonus.shipAttack + fx.beamAttack;
  const maxArmor = hull.armor * armor.mult * (specials.includes("heavyArmor") ? STATION_HEAVY_ARMOR_MULT : 1);
  const maxStructure = hull.structure * armor.mult * (specials.includes("reinforcedHull") ? STATION_REINFORCED_MULT : 1);
  const u: Unit = {
    ...baseUnit(player, sideIdx),
    key: `station:${colony.id}`,
    colonyId: colony.id,
    designId: hull.id,
    name: `${colony.name} ${hull.name}`,
    kind: "station",
    hullId: hull.id,
    sizeClass: hull.sizeClass,
    x: DEPLOY.leftColumn,
    y: DEPLOY.stationRow,
    hullRank: size,
    blastDriveHP: HULLS[size]!.driveHP,
    armor: maxArmor, maxArmor,
    structure: maxStructure, maxStructure,
    shieldClass, shieldMax, shields: Array(SHIELD_FACINGS).fill(shieldMax),
    hardShields: fx.hardShields > 0,
    mounts: makeMounts(player, weapons, true, true),
    attackBase,
    computerAttack: computer?.attack ?? 0,
    defenseBonus: 0,
    // Beam defense of a ship that cannot move (-20) plus the Regular crew's.
    fixedDefense: (hull.fixedDefense ?? IMMOBILE_DEFENSE) + CREW.defense[DEFENSE_CREW_LEVEL]!,
    crew: DEFENSE_CREW_LEVEL,
    speed: 0,
    missileEvasion: fx.missileEvasion,
    fx,
    marines: hull.marines,
    immobile: true,
    noArmorPierce: armor.id === "xentroniumArmor" || specials.includes("heavyArmor"),
    strength: 0,
  };
  if (computer) u.computer = { id: "computer", hp: hull.computerHP, max: hull.computerHP };
  if (shield) u.shieldGen = { id: "shield", hp: hull.shieldGenHP, max: hull.shieldGenHP };
  for (const id of specials) {
    const def = SPECIALS_BY_ID[id];
    if (!def || UNHITTABLE_SPECIALS.has(id)) continue;
    const hp = Math.max(1, Math.floor(Math.max(0, def.space[size]!) / 10));
    u.specials.push({ id, hp, max: hp });
  }
  u.strength = strengthOf({
    weapons, attack: attackBase + (computer?.attack ?? 0) + CREW.attack[DEFENSE_CREW_LEVEL]!, defense: u.fixedDefense!,
    hits: u.maxArmor + u.maxStructure, shield: u.shieldClass, shieldStrength: shieldMax, missileEvasion: fx.missileEvasion, effects: fx,
  });
  return u;
}

/**
 * The planet's ground defenses as one immobile unit: a Regular crew, the
 * owner's best computer and (with any weapon) Battle Scanner. Damage to its
 * installations is cut by the planetary shield plus the owner's best ship
 * shield class. It fights as a battleship-sized unit (the original resizes it
 * when it deploys).
 */
function planetUnit(player: Player, colony: Colony, d: ColonyDefense, sideIdx: 0 | 1): Unit {
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  const mounts: Mount[] = [];
  const installations: Installation[] = [];
  const weapons: WeaponMount[] = [];
  for (const inst of d.installations) {
    const id = installations.length;
    if (inst === "fighterGarrison") {
      const g = fighterGarrison(player, colony);
      if (!g) continue;
      const bay = ALL_WEAPONS[g.kind === "heavyFighter" ? "heavyFighterBays" : g.kind === "bomber" ? "bomberBays" : "fighterBays"]!;
      // Two slots of bays; each bay sends up a squadron, and lost craft are replaced every few combat turns.
      for (let slot = 0; slot < g.slots; slot++) {
        const m = makeMounts(player, [{ weaponId: bay.id, count: g.bays }], true, true, id)[0]!;
        m.garrison = g.bays * SQUADRON_SIZE;
        mounts.push(m);
      }
      installations.push({ name: BUILDINGS_BY_ID.fighterGarrison?.name ?? inst, alive: true });
      continue;
    }
    const w = inst === "groundBatteries" ? groundBatteryWeapons(player)
      : inst === "missileBase" ? missileBaseWeapons(player)
      : [{ weaponId: "stellarConverter", count: 1 }];
    weapons.push(...w);
    mounts.push(...makeMounts(player, w, true, true, id));
    installations.push({ name: BUILDINGS_BY_ID[inst === "stellarConverter" ? "planetaryStellarConverter" : inst]?.name ?? inst, alive: true });
  }
  const computer = bestComputer(player);
  const scanner = mounts.length > 0 && knows(player, SPECIALS_BY_ID.battleScanner!.requires) ? SPECIALS_BY_ID.battleScanner!.effects.beamAttack ?? 0 : 0;
  const installationHP = PLANET_INSTALLATION_HP + armorClass(player) * PLANET_INSTALLATION_ARMOR_STEP;
  const hp = installationHP * installations.length;
  const attackBase = shipAttackPickBonus(race) + bonus.shipAttack + scanner;
  const shield = d.shield + (bestShield(player)?.absorb ?? 0);
  const u: Unit = {
    ...baseUnit(player, sideIdx),
    key: `planet:${colony.id}`,
    colonyId: colony.id,
    designId: "planet",
    name: colony.name,
    kind: "planet",
    // Size 3 (a battleship): what size-scaled weapons such as the Pulsar and Gyro Destabilizer see (likely).
    sizeClass: PLANET_SIZE_INDEX + 1,
    hullRank: PLANET_SIZE_INDEX,
    x: DEPLOY.leftColumn,
    y: DEPLOY.planetRow,
    armor: 0, maxArmor: 0, structure: hp, maxStructure: hp,
    planetShield: shield,
    popShield: d.shield,
    installations,
    installationHP,
    mounts,
    attackBase,
    computerAttack: computer?.attack ?? 0,
    defenseBonus: 0,
    // -20 for not moving, +15 for the Regular crew; race ship defense needs a drive.
    fixedDefense: IMMOBILE_DEFENSE + CREW.defense[DEFENSE_CREW_LEVEL]!,
    crew: DEFENSE_CREW_LEVEL,
    speed: 0,
    immobile: true,
    strength: 0,
  };
  u.strength = strengthOf({
    weapons,
    attack: attackBase + (computer?.attack ?? 0) + CREW.attack[DEFENSE_CREW_LEVEL]!, defense: 0, hits: Math.max(1, hp), shield, shieldStrength: 0, missileEvasion: 0,
  });
  return u;
}

/** Rough combat value of a colony's station and ground defenses, for planning attacks. */
export function colonyDefenseStrength(state: GameState, colony: Colony): number {
  const player = state.players[colony.ownerId];
  if (!player) return 0;
  const d = planetDefense(colony);
  let total = 0;
  if (d.station) total += stationUnit(player, colony, HULLS_BY_ID[d.station], 1).strength;
  if (d.installations.length > 0) total += planetUnit(player, colony, d, 1).strength;
  return total;
}

/** In the fight: not destroyed, not escaped, and not a prize sitting out the battle. */
const active = (u: Unit) => u.alive && !u.retreated && (!u.captured || u.captured.fightsOn);
const hasWeapons = (u: Unit) => u.mounts.some((m) => m.count > 0 && m.shots > 0 && m.def.effect !== "antiMissile");
const armed = (u: Unit) => active(u) && hasWeapons(u);

/** One battle per pair of enemies per star per turn, so this names a battle for the orders a human hands in. */
export function battleKey(turn: number, starId: string, a: PlayerId, b: PlayerId): string {
  return `${turn}:${starId}:${Math.min(a, b)}:${Math.max(a, b)}`;
}

/** A battle set up at a star, ready to fight. */
export function createBattle(state: GameState, rng: Rng, starId: string, a: CombatSide, b: CombatSide): Battle {
  const battle = new Battle(state, rng, a, b);
  // Ionized nebula gas stops deflector shields unless they are hard shields.
  battle.nebula = !!state.galaxy.stars.find((s) => s.id === starId)?.nebula;
  for (const side of [0, 1] as const) battle.tactics[side] = tacticsAt(state, starId, battle.sides[side].ownerId);
  return battle;
}

/**
 * Fights a battle. `orders` holds what human players commanded, by player;
 * a side without orders is played by the computer.
 */
export function resolveCombat(
  state: GameState, rng: Rng, starId: string, a: CombatSide, b: CombatSide, reportId: string,
  orders?: ReadonlyMap<PlayerId, TacticalOrder[] | "auto">,
): CombatOutcome {
  const battle = createBattle(state, rng, starId, a, b);
  for (const side of [0, 1] as const) {
    const o = orders?.get(battle.sides[side].ownerId);
    if (o) battle.setOrders(side, o);
  }
  return battle.run(starId, reportId);
}

/** A unit of a commanded side whose turn it is: the battle waits for its order. */
export interface BattleDecision {
  unit: string;
  side: 0 | 1;
}

/** What a commanded unit may do on its turn, for the battle screen. */
export interface UnitOptions {
  /** Enemies it may fire at, with whether any of its weapons reach each from where it stands. */
  targets: { key: string; inRange: boolean }[];
  /** Squares it can still move this turn (0 for stations, planets and ships that already moved). */
  reach: number;
  canRetreat: boolean;
  /** The target the computer would pick. */
  suggested: string | null;
  /** Its weapons: how many work, shots left (null: unlimited) and whether each is ready to fire this turn. */
  weapons: { id: string; name: string; count: number; shots: number | null; ready: boolean; arc: string }[];
}

/**
 * Sets up a battle without fighting it, so tests and tools can look at how the
 * rules place, arm and rate the units.
 */
export function prepareBattle(state: GameState, rng: Rng, a: CombatSide, b: CombatSide): Battle {
  return new Battle(state, rng, a, b);
}

export type { Unit as BattleUnit };

export class Battle {
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  log: CombatRoundEvent[] = [];
  round = 0;
  /** Flat beam attack each side gets from its station or defended planet, recomputed every combat turn. */
  sideAttack = [0, 0];
  /** Scout labs give the whole fleet an attack bonus against monsters. */
  monsterBonus = [0, 0];
  /**
   * The best ship officers' combat skills on each side, as in the original:
   * Weaponry (beam attack), Helmsman (beam defense, half against missiles),
   * Ordnance (% weapon damage), Fighter Pilot (fighters' attack and defense).
   * Only officers whose fleet still has a ship in the battle count.
   */
  officers: OfficerBonus[] = [noOfficers(), noOfficers()];
  fleetEvasion = [0, 0];
  /** The battle is inside a nebula: only hard shields work. */
  nebula = false;
  /**
   * Initiative each side gets from a Tactics administrator of its owner in the
   * battle's system; it only matters with the ship initiative option.
   */
  tactics: [number, number] = [0, 0];
  /** Computer empires that may pull out of this battle at all, and those that decided to this combat turn. */
  mayRetreat: [boolean, boolean] = [false, false];
  pullOut: [boolean, boolean] = [false, false];
  /** Fleets whose captain died with the ship boarders took. */
  captainsKilled: string[] = [];
  /** Sides a human commands: their units wait for orders on their turns, and they only pull out when ordered. */
  manual: [boolean, boolean] = [false, false];
  /** Orders handed in for commanded sides, used up in turn order by `run`. */
  private queued: [TacticalOrder[], TacticalOrder[]] = [[], []];
  /** Units as they started, and every combat turn's events so far. */
  snapshots: CombatShipSnapshot[] = [];
  rounds: CombatRoundEvent[][] = [];
  readonly sides: readonly [CombatSide, CombatSide];
  /** The side that came to fight: whoever picked the target, unless the battle is at the other side's colony. */
  readonly attacker: 0 | 1;
  /** Which side deploys on the left of the field. */
  readonly leftSide: 0 | 1;

  constructor(readonly state: GameState, readonly rng: Rng, a: CombatSide, b: CombatSide) {
    this.sides = [a, b];
    const attacking = (x: CombatSide) => x.fleets.some((f) => f.stance === "attack") || state.players[x.ownerId]?.kind === "raiders";
    // The colony's owner defends; otherwise the side that started the fight attacks (likely: in the original the
    // attacker is the player whose turn in the combat phase picked the target).
    this.attacker = a.colony && !b.colony ? 1 : b.colony && !a.colony ? 0
      : a.initiates && !b.initiates ? 0 : b.initiates && !a.initiates ? 1
      : attacking(b) && !attacking(a) ? 1 : 0;
    // The attacker deploys on the right unless it is a human player, who is always drawn on the left (likely: the
    // original swaps the columns for the local human, presumably to draw them on the left).
    const attackerHuman = !!state.players[this.sides[this.attacker].ownerId]?.isHuman;
    this.leftSide = attackerHuman ? this.attacker : (1 - this.attacker) as 0 | 1;
    this.units = [...shipUnits(state, a, 0), ...shipUnits(state, b, 1)];
    for (const [i, s] of this.sides.entries()) {
      if (!s.colony) continue;
      const player = state.players[s.ownerId]!;
      const d = planetDefense(s.colony);
      if (d.installations.length > 0 || d.mines) {
        const p = planetUnit(player, s.colony, d, i as 0 | 1);
        // A planet with only mines is not a target and does not hold the field.
        if (d.installations.length === 0) p.alive = false;
        this.units.push(p);
      }
      if (d.station) this.units.push(stationUnit(player, s.colony, HULLS_BY_ID[d.station], i as 0 | 1));
    }
    this.deploy();
    for (const side of [0, 1] as const) {
      const mine = this.units.filter((u) => u.side === side);
      this.monsterBonus[side] = Math.max(0, ...mine.filter((u) => u.fx.scoutLab).map((u) => u.fx.monsterAttackPerSize * u.sizeClass))
        // Captains with Galactic Lore know how monsters fight: the best one in the battle counts.
        + Math.max(0, ...this.sides[side].fleets.map((f) => captainSkills(state, f.id).monsterBonus ?? 0));
      this.mayRetreat[side] = this.retreatAllowed(side);
    }
  }

  /** Hands a side's recorded orders in; "auto" leaves the side to the computer. */
  setOrders(side: 0 | 1, orders: TacticalOrder[] | "auto"): void {
    this.manual[side] = orders !== "auto";
    this.queued[side] = orders === "auto" ? [] : [...orders];
  }

  /**
   * Computer empires only pull out of a battle between two empires, and only
   * when they own a colony other than the one fought over.
   */
  retreatAllowed(side: 0 | 1): boolean {
    const me = this.state.players[this.sides[side].ownerId]!;
    const them = this.state.players[this.sides[1 - side]!.ownerId]!;
    if (me.kind !== "empire" || them.kind !== "empire") return false;
    const contested = new Set(this.sides.map((x) => x.colony?.id).filter((id): id is string => !!id));
    return Object.values(this.state.colonies).some((c) => c.ownerId === me.id && !contested.has(c.id));
  }

  /**
   * Sets up the field as the original does: the planet behind its side's
   * column with the station in front of it, then each side's ships, largest
   * first, filling the column outward from the centre row, alternately below
   * and above, and stepping back a column when it is full. Defending ships
   * skip squares that overlap their planet or station.
   */
  deploy(): void {
    const D = DEPLOY;
    for (const side of [0, 1] as const) {
      const left = side === this.leftSide;
      const col = left ? D.leftColumn : D.rightColumn;
      const heading = left ? 0 : Math.PI;
      const planetX = col + (left ? D.planetOffset.left : D.planetOffset.right);
      const fixed = this.units.filter((u) => u.side === side && (u.kind === "planet" || (u.kind === "station" && !u.fleetId)));
      for (const u of fixed) {
        u.heading = heading;
        if (u.kind === "planet") {
          u.x = planetX;
          u.y = D.planetRow;
        } else {
          u.x = planetX + (left ? D.stationOffset.left : D.stationOffset.right);
          u.y = D.stationRow;
        }
      }
      const blockers = fixed.filter((u) => u.alive);
      const ships = this.units.filter((u) => u.side === side && !fixed.includes(u)).sort((x, y) => y.hullRank - x.hullRank);
      let x = col;
      let down = D.centreRow;
      let up = D.centreRow;
      let placed = 0;
      for (const u of ships) {
        u.heading = heading;
        const step = D.rowStep[Math.min(D.rowStep.length - 1, Math.max(0, u.hullRank))]!;
        for (let tries = 0; tries < 200; tries++) {
          let y: number;
          if (placed === 0) y = D.centreRow;
          else if (placed % 2 === 1) y = down += step;
          else y = up -= step;
          placed++;
          if (y > D.maxRow || y < D.minRow) {
            // The column is full: start another one further back.
            x += left ? -D.columnStepBack : D.columnStepBack;
            down = up = D.centreRow;
            placed = 0;
            continue;
          }
          u.x = Math.min(FIELD_WIDTH - 0.5, Math.max(0.5, x));
          u.y = y;
          if (blockers.some((b) => this.edge(u, b) < 0.5)) continue;
          break;
        }
      }
    }
  }

  /**
   * Beam attack a side gets from its immobile units (stations and the
   * planet): flat points by the unit's size, the last one in battle order
   * counting, as in the original.
   */
  updateSideAttack(): void {
    this.updateOfficers();
    for (const side of [0, 1] as const) {
      let bonus = 0;
      for (const u of this.units) {
        if (u.side !== side || !active(u) || (u.kind !== "station" && u.kind !== "planet")) continue;
        bonus = SIDE_ATTACK_BY_IMMOBILE_SIZE[u.hullRank] ?? 0;
      }
      this.sideAttack[side] = bonus;
    }
  }

  /** Recomputes each side's best officer skills from the fleets that still have a ship in the battle. */
  updateOfficers(): void {
    for (const side of [0, 1] as const) {
      const o = noOfficers();
      for (const f of this.sides[side].fleets) {
        if (!this.units.some((u) => u.fleetId === f.id && active(u))) continue;
        const cap = captainSkills(this.state, f.id);
        o.attack = Math.max(o.attack, cap.attack ?? 0);
        o.defense = Math.max(o.defense, cap.defense ?? 0);
        o.damagePct = Math.max(o.damagePct, cap.maxDamage ?? 0);
        o.fighters = Math.max(o.fighters, cap.fighters ?? 0);
      }
      this.officers[side] = o;
    }
  }

  /** Fights the battle to the end, taking commanded sides' orders from what was handed in. */
  run(starId: string, reportId: string): CombatOutcome {
    const fight = this.fight(starId, reportId);
    let step = fight.next();
    while (!step.done) {
      // Orders run out only when the player let the computer finish; it then plays the rest.
      step = fight.next(this.queued[step.value.side].shift() ?? { kind: "auto" });
    }
    return step.value;
  }

  /**
   * The battle, step by step: it pauses at each turn of a commanded side's
   * unit and goes on with the order sent in (`next(order)`), until it returns
   * the outcome.
   */
  *fight(starId: string, reportId: string): Generator<BattleDecision, CombatOutcome, TacticalOrder> {
    const { units, state, sides } = this;
    const snapshots: CombatShipSnapshot[] = this.snapshots = units.map((u) => ({
      key: u.key, ownerId: u.ownerId, designId: u.designId, name: u.name, maxHits: u.maxArmor + u.maxStructure,
      x: u.x, y: u.y, isPlanet: u.kind === "planet", kind: u.kind, hullId: u.hullId, sizeClass: u.sizeClass,
      ...(u.shipStyle ? { shipStyle: u.shipStyle } : {}),
      maxArmor: u.maxArmor, maxStructure: u.maxStructure, maxShield: u.shieldMax,
      ...(u.kind === "ship" && u.armor + u.structure < u.maxArmor + u.maxStructure ? { armor: u.armor, structure: u.structure } : {}),
    }));
    const rounds: CombatRoundEvent[][] = this.rounds = [];
    // The attacker acts first every round; raiders defending their home strike first instead.
    const att = this.attacker;
    const def = (1 - att) as 0 | 1;
    const order: (0 | 1)[] = this.state.players[sides[def].ownerId]?.kind === "raiders" ? [def, att] : [att, def];
    // A side stands while it has any ship or station left, or a planet with working installations.
    const standing = (idx: 0 | 1) => units.some((x) => x.side === idx && active(x) && (x.kind !== "planet" || x.installations.some((i) => i.alive)));

    for (this.round = 0; this.round < MAX_ROUNDS; this.round++) {
      this.log = [];
      rounds.push(this.log);
      if (this.round === 0) this.mines();
      this.startRound();
      if (state.settings.shipInitiative) {
        // Ship initiative: everyone in one list, fastest and best-aimed first (combat speed + beam attack / 10).
        for (const side of order) this.decideRetreat(side);
        const initiative = (u: Unit) => this.currentSpeed(u) + this.attackOf(u, u) / 10 + this.tactics[u.side]!;
        const all = units.filter((u) => active(u)).sort((a, b) => initiative(b) - initiative(a));
        for (const u of all) if (active(u)) yield* this.unitTurn(u);
        for (const side of order) this.moveProjectiles(side);
      } else {
        for (const side of order) {
          // Each side weighs retreat as its phase begins; then its units act in their fixed order.
          this.decideRetreat(side);
          const mine = units.filter((u) => u.side === side && active(u));
          for (const u of mine) yield* this.unitTurn(u);
          this.moveProjectiles(side);
        }
      }
      // Time Warp Facilitators give their ships an extra turn once both sides have moved.
      for (const side of order) {
        for (const u of units) if (u.side === side && u.fx.extraTurn && active(u)) yield* this.unitTurn(u);
      }

      this.endRound(order);
      // The original fights on until one side is gone or time runs out. When nobody has anything left to shoot
      // with and nothing is in flight or trapped, nothing can change any more, so time runs out at once.
      if (!standing(0) || !standing(1)) break;
      const armedA = units.some((x) => x.side === 0 && armed(x));
      const armedB = units.some((x) => x.side === 1 && armed(x));
      if (!armedA && !armedB && this.projectiles.length === 0 && !units.some((x) => active(x) && (x.blackHole || x.web || x.retreatOrdered))) break;
    }

    // The side left standing wins; if both stand when time runs out, the defender holds the field.
    const winnerIdx: 0 | 1 | null = standing(def) ? def : standing(att) ? att : null;

    // A prize is only kept if its captor's side wins; otherwise it is lost with all hands. Telepaths' prizes join
    // them at once and are kept whoever wins.
    for (const u of units) {
      if (!u.captured || !u.alive || u.side === winnerIdx || u.captured.fightsOn) continue;
      u.alive = false;
      u.structure = 0;
      this.log.push({ kind: "destroyed", ship: u.key });
    }

    const captured: CapturedShip[] = [];
    const survivors = new Map<string, ShipStack[]>();
    const retreatedShips = new Map<string, ShipStack[]>();
    const fled = new Set<string>();
    const retreated = new Set<PlayerId>();
    for (const s of sides) {
      for (const f of s.fleets) {
        // Damage stays on the survivors unless something repairs it all after the battle.
        const repairs = fullRepairAfterBattle(state, s.ownerId, f.id);
        const counts = new Map<string, { count: number; damage: number[] }>();
        const mine = units.filter((u) => u.fleetId === f.id && u.alive && !u.captured);
        for (const u of mine) {
          const c = counts.get(u.designId) ?? { count: 0, damage: [] };
          c.count++;
          const lost = u.maxArmor - u.armor + u.maxStructure - u.structure;
          if (lost > 0 && u.kind === "ship" && !repairs && u.fx.repair <= 0) c.damage.push(Math.round(lost));
          counts.set(u.designId, c);
        }
        survivors.set(f.id, [...counts].map(([designId, { count, damage }]) => {
          const xp = f.ships.find((x) => x.designId === designId)?.xp;
          return { designId, count, ...(xp ? { xp } : {}), ...(damage.length > 0 ? { damage } : {}) };
        }));
        const gone = mine.filter((u) => u.retreated);
        if (gone.length > 0) retreated.add(s.ownerId);
        if (gone.length > 0 && gone.length === mine.length) fled.add(f.id);
        else if (gone.length > 0) {
          const stacks: ShipStack[] = [];
          for (const u of gone) {
            const st = stacks.find((x) => x.designId === u.designId);
            if (st) st.count++;
            else stacks.push({ designId: u.designId, count: 1 });
          }
          retreatedShips.set(f.id, stacks);
        }
      }
    }
    // The winner's crews learn from the enemy ships they destroyed or took: half the sum of (hull size + 1), at least 1.
    let crewXp: CombatOutcome["crewXp"] = null;
    if (winnerIdx !== null) {
      const sizes = units
        .filter((u) => u.origSide !== winnerIdx && u.kind !== "planet" && (!u.alive || u.captured))
        .reduce((n, u) => n + u.hullRank + 1, 0);
      crewXp = { ownerId: sides[winnerIdx].ownerId, amount: Math.max(1, Math.floor(sizes / 2)) };
    }
    for (const u of units) {
      if (!u.captured || !u.alive || !u.fleetId) continue;
      // The prize joins one of the captor's fleets still here, or forms a new one.
      const home = units.find((x) => x.ownerId === u.ownerId && !x.captured && active(x) && x.fleetId && x.kind === "ship");
      captured.push({ ownerId: u.ownerId, fleetId: home?.fleetId ?? null, fromOwner: u.origOwner, designId: u.designId });
    }
    const losses: Record<string, number> = {};
    for (const u of units) {
      if ((!u.alive || u.captured) && (u.kind === "ship" || u.kind === "monster" || (u.kind === "station" && u.fleetId))) {
        losses[u.origOwner] = (losses[u.origOwner] ?? 0) + 1;
      }
    }

    const planetSilenced = new Map<PlayerId, boolean>();
    const stationsLost = new Set<string>();
    for (const [i, s] of sides.entries()) {
      if (!s.colony) continue;
      const planet = units.find((u) => u.kind === "planet" && u.origSide === i && u.installations.length > 0);
      const station = units.find((u) => u.kind === "station" && u.origSide === i && !u.fleetId);
      // A station that is destroyed or taken is lost as a building.
      const stationDown = !station || !station.alive || !!station.captured;
      if (station && stationDown) stationsLost.add(s.colony.id);
      const planetDown = !planet || !planet.alive || !hasWeapons(planet);
      planetSilenced.set(s.ownerId, planetDown && stationDown);
    }

    return {
      report: {
        id: reportId,
        turn: state.turn,
        starId,
        sides: [sides[0].ownerId, sides[1].ownerId],
        ships: snapshots,
        rounds,
        winner: winnerIdx === null ? null : sides[winnerIdx]!.ownerId,
        losses,
      },
      survivors,
      retreated,
      fled,
      retreatedShips,
      captainsKilled: this.captainsKilled,
      planetSilenced,
      stationsLost,
      captured,
      crewXp,
      attacker: this.attacker,
      colonyHits: new Map(units.filter((u) => u.kind === "planet" && u.colonyId && u.popHits > 0).map((u) => [u.colonyId!, u.popHits])),
    };
  }

  // ------------------------------------------------------------ round upkeep

  startRound(): void {
    this.updateSideAttack();
    for (const u of this.units) {
      if (!active(u)) continue;
      // A ship that can no longer move cannot get away: its retreat order lapses.
      if (u.retreatOrdered && this.currentSpeed(u) <= 0) u.retreatOrdered = false;
      u.firedLastRound = u.firedThisRound;
      u.firedThisRound = false;
      u.tractor = 0;
      u.moved = false;
      for (const m of u.mounts) {
        // A turn without firing charges Hyper-X Capacitors and Fast Missile Racks for another double volley.
        if (!m.firedThisRound) m.double = true;
        m.firedThisRound = false;
        if (m.cooldown > 0) m.cooldown--;
        if (!m.out && m.rearm > 0) m.rearm--;
      }
      // Shields recover a share of one facing's strength every turn, handed out a point at a time over the weakened facings.
      if (this.shieldWorks(u)) {
        let pool = Math.floor(u.shieldMax * Math.min(1, SHIELD_REGEN + u.fx.shieldRegen));
        for (let gave = true; pool > 0 && gave;) {
          gave = false;
          for (let f = 0; f < SHIELD_FACINGS && pool > 0; f++) {
            if (u.shields[f]! >= u.shieldMax) continue;
            u.shields[f] = Math.min(u.shieldMax, u.shields[f]! + 1);
            pool--;
            gave = true;
          }
        }
      }
      if (u.fx.repair > 0) this.repair(u);
      if (u.web) {
        const web = u.web;
        this.applyHit(web.by, u, web.damage, {}, "plasmaWeb");
        web.damage -= PLASMA_WEB_DECAY;
        if (web.damage <= 0) u.web = null;
      }
    }
    for (const side of [0, 1]) {
      this.fleetEvasion[side] = Math.max(0, ...this.units.filter((u) => u.side === side && active(u)).map((u) => u.fx.fleetMissileEvasion));
    }
  }

  /**
   * In-battle repair (Automated Repair Unit, cybernetic crews): a share of the
   * armor and structure, structure first, and half that share of all internal
   * systems' hit points, handed out to the drive, computer, weapons, shield
   * generator and specials in that order, broken ones included.
   */
  repair(u: Unit): void {
    let heal = Math.max(1, Math.floor((u.maxArmor + u.maxStructure) * u.fx.repair));
    const before = u.armor + u.structure;
    const s = Math.min(heal, u.maxStructure - u.structure);
    u.structure += s;
    heal -= s;
    u.armor = Math.min(u.maxArmor, u.armor + heal);
    if (u.kind === "ship" || u.kind === "station") {
      const weaponMax = u.kind === "ship" ? u.mounts.reduce((n, m) => n + m.maxCount * m.hpEach, 0) : 0;
      const total = (u.drive?.max ?? 0) + (u.computer?.max ?? 0) + weaponMax + (u.shieldGen?.max ?? 0) + u.specials.reduce((n, x) => n + x.max, 0);
      let pool = Math.max(1, Math.floor(total * u.fx.repairSystems));
      const mend = (sys: System | null) => {
        if (!sys || pool <= 0 || sys.hp >= sys.max) return;
        const give = Math.min(pool, sys.max - sys.hp);
        sys.hp += give;
        pool -= give;
      };
      mend(u.drive);
      mend(u.computer);
      if (u.kind === "ship") {
        for (const m of u.mounts) {
          const hp = m.count * m.hpEach - m.wound;
          const max = m.maxCount * m.hpEach;
          if (pool <= 0 || hp >= max) continue;
          const now = hp + Math.min(pool, max - hp);
          pool -= now - hp;
          m.count = Math.ceil(now / m.hpEach);
          m.wound = m.count * m.hpEach - now;
        }
      }
      const shieldWasDown = !!u.shieldGen && u.shieldGen.hp <= 0;
      mend(u.shieldGen);
      if (shieldWasDown && u.shieldGen!.hp > 0) u.shields.fill(0);
      for (const sp of u.specials) mend(sp);
    }
    const healed = u.armor + u.structure - before;
    if (healed > 0) this.log.push({ kind: "repair", ship: u.key, damage: healed });
  }

  /**
   * End of a combat turn: phasing cloaks count down while the ship holds its
   * fire, black holes tighten (a trapped ship is lost when its counter
   * reaches the limit), and stasis fields let go of ships their holder can no
   * longer hold. A side whose every remaining enemy is held in stasis lets the
   * smallest one go, as the original's AI does.
   */
  endRound(order: (0 | 1)[]): void {
    for (const u of this.units) {
      if (!active(u)) continue;
      if (u.phasingLeft > 0 && !u.firedThisRound && !u.firedLastRound) u.phasingLeft--;
    }
    for (const side of order) {
      for (const u of this.units) {
        if (u.side !== side || !active(u) || !u.blackHole) continue;
        const by = u.blackHole.by;
        if (!active(by) || !by.mounts.some((m) => m.def.effect === "blackHole" && m.count > 0)) {
          u.blackHole = null;
          continue;
        }
        if (++u.blackHole.turns >= BLACK_HOLE_TURNS) {
          this.log.push({ kind: "fire", ship: by.key, target: u.key, weapon: "blackHoleGenerator", hit: true, damage: u.armor + u.structure, armorDamage: u.armor, structureDamage: u.structure });
          u.armor = 0;
          u.structure = 0;
          this.destroy(u);
        }
      }
    }
    this.checkStasis();
    for (const side of [0, 1] as const) {
      const enemies = this.units.filter((e) => e.side !== side && active(e) && e.kind !== "planet");
      if (enemies.length === 0 || !enemies.every((e) => e.held && e.held.side === side)) continue;
      const smallest = enemies.reduce((a, b) => (b.hullRank < a.hullRank ? b : a));
      smallest.held = null;
    }
  }

  /** Releases ships whose stasis holder is gone or has lost the weapons to hold them (one each). */
  checkStasis(): void {
    for (const holder of this.units) {
      const held = this.units.filter((t) => t.held === holder);
      if (held.length === 0) continue;
      const can = active(holder) ? holder.mounts.filter((m) => m.def.effect === "stasis").reduce((n, m) => n + m.count, 0) : 0;
      for (const t of held.slice(can)) t.held = null;
    }
  }

  /** Mines of an Artemis System Net strike the attacking ships as the battle opens. */
  mines(): void {
    for (const [i, s] of this.sides.entries()) {
      if (!s.colony || !planetDefense(s.colony).mines) continue;
      const source = this.units.find((u) => u.kind === "planet" && u.side === i);
      if (!source) continue;
      for (const u of this.units) {
        if (u.side === i || u.immobile || !active(u)) continue;
        const chance = ARTEMIS.chanceByHull[Math.min(ARTEMIS.chanceByHull.length - 1, Math.max(0, u.hullRank))]!;
        if (this.rng.int(1, 100) > chance) continue;
        this.applyHit(source, u, this.rng.int(ARTEMIS.damage[0], ARTEMIS.damage[1]), {}, "artemisSystemNet");
      }
    }
  }

  // ------------------------------------------------------------ derived values

  shieldWorks(u: Unit): boolean {
    if (this.nebula && !u.hardShields && u.kind !== "planet") return false;
    return u.shieldClass > 0 && (u.shieldGen === null || u.shieldGen.hp > 0);
  }

  systems(u: Unit): System[] {
    const out: System[] = [];
    if (u.drive && u.drive.hp > 0) out.push(u.drive);
    if (u.computer && u.computer.hp > 0) out.push(u.computer);
    if (u.shieldGen && u.shieldGen.hp > 0) out.push(u.shieldGen);
    for (const s of u.specials) if (s.hp > 0) out.push(s);
    u.mounts.forEach((m, i) => {
      if (m.count > 0 && u.kind === "ship") out.push({ id: m.def.id, hp: m.count * m.hpEach - m.wound, max: m.count * m.hpEach, mount: i });
    });
    return out;
  }

  currentSpeed(u: Unit): number {
    if (u.immobile || u.held || u.blackHole) return 0;
    let speed = u.speed;
    if (u.drive) {
      if (u.drive.hp <= 0) return 0;
      if (u.drive.hp < u.drive.max / 2) speed *= u.drive.hp / (u.drive.max / 2);
    }
    if (u.tractor > 0) speed *= Math.max(0, 1 - u.tractor / u.sizeClass);
    return Math.max(0, Math.floor(speed));
  }

  attackOf(u: Unit, target: Unit): number {
    let ba = u.attackBase + this.sideAttack[u.side]! + this.officers[u.side]!.attack + CREW.attack[u.crew]!;
    if (u.computer === null || u.computer.hp > 0) ba += u.computerAttack;
    // Scout labs and Galactic Lore count only in battles against space monsters (not the raiders), as in the original.
    if (target.player.kind === "monsters") ba += this.monsterBonus[u.side]!;
    return ba;
  }

  defenseOf(u: Unit): number {
    if (u.fixedDefense !== null) return u.fixedDefense + this.officers[u.side]!.defense;
    const speed = this.currentSpeed(u);
    let bd = speed > 0 ? speed * DEFENSE_PER_SPEED : IMMOBILE_DEFENSE;
    bd += u.defenseBonus + this.officers[u.side]!.defense + CREW.defense[u.crew]!;
    if (this.cloaked(u)) bd += u.fx.cloakDefense;
    return bd;
  }

  cloaked(u: Unit): boolean {
    return u.fx.cloakDefense > 0 && !u.firedLastRound && !u.firedThisRound && this.specialWorks(u, u.fx.phasing > 0 ? "phasingCloak" : "cloakingDevice");
  }

  /**
   * Phased-out ships cannot be seen or shot: a phasing cloak keeps its ship out
   * of reach for ten of its own turns, but firing brings it back for that turn
   * and the next. Ships held in stasis cannot be touched either.
   */
  untouchable(u: Unit): boolean {
    return (u.phasingLeft > 0 && !u.firedThisRound && !u.firedLastRound && this.specialWorks(u, "phasingCloak")) || !!u.held;
  }

  specialWorks(u: Unit, id: string): boolean {
    const s = u.specials.find((x) => x.id === id);
    return !s || s.hp > 0;
  }

  missileEvasionOf(u: Unit): number {
    // Trained crews dodge missiles too, with half their beam defense bonus.
    // A Helmsman helps against missiles with half his skill.
    return Math.max(u.missileEvasion, this.fleetEvasion[u.side]!) + Math.floor(CREW.defense[u.crew]! / 2)
      + Math.floor(this.officers[u.side]!.defense / 2);
  }

  // ------------------------------------------------------------ geometry

  dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Half the width of a unit's square footprint, from its centre to the centre of its outermost square. */
  radius(u: Unit): number {
    const side = u.kind === "planet" ? FOOTPRINT.planet : FOOTPRINT.byHull[Math.min(FOOTPRINT.byHull.length - 1, Math.max(0, u.hullRank))]!;
    return (side - 1) / 2;
  }

  /**
   * Squares between the nearest squares of two units' footprints, measured as
   * the original does: the longer leg plus half the shorter.
   */
  edge(a: Unit, b: Unit): number {
    const reach = this.radius(a) + this.radius(b);
    const dx = Math.max(0, Math.abs(a.x - b.x) - reach);
    const dy = Math.max(0, Math.abs(a.y - b.y) - reach);
    return Math.max(dx, dy) + Math.min(dx, dy) / 2;
  }

  /** Squares between two points (centre to centre), in the original's metric. */
  squares(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.max(dx, dy) + Math.min(dx, dy) / 2;
  }

  band(a: Unit, b: Unit): number {
    return Math.floor((this.edge(a, b) + 2) / 3);
  }

  /** Which shield facing of the target faces a point: 0 front, 1 right, 2 back, 3 left. */
  facingToward(target: Unit, from: { x: number; y: number }): number {
    const rel = normAngle(Math.atan2(from.y - target.y, from.x - target.x) - target.heading);
    const q = Math.round(rel / (Math.PI / 2));
    return ((q % 4) + 4) % 4;
  }

  inArc(u: Unit, m: Mount, target: Unit): boolean {
    const arc = ARCS[m.arc];
    if (arc.half >= 180) return true;
    const rel = normAngle(Math.atan2(target.y - u.y, target.x - u.x) - u.heading - (arc.back ? Math.PI : 0));
    return Math.abs(rel) <= (arc.half * Math.PI) / 180 + 1e-6;
  }

  // ------------------------------------------------------------ targeting

  /** Enemies a unit may shoot at. Planets are only attacked by sides that came for them, once their defenders are gone. */
  targets(u: Unit): Unit[] {
    const enemies = this.units.filter((e) => e.side !== u.side && active(e) && !this.untouchable(e));
    const ships = enemies.filter((e) => e.kind !== "planet");
    if (u.immobile) return ships.filter((e) => e.kind !== "station");
    if (ships.length > 0) return ships;
    // Off attack stance a fleet leaves the planet alone, but it shoots back at guns firing on it.
    return this.sides[u.side]!.attacksPlanet ? enemies : enemies.filter(hasWeapons);
  }

  chooseTarget(u: Unit): Unit | undefined {
    const pool = this.targets(u);
    if (pool.length === 0) return undefined;
    const owner = u.player;
    const focus = owner.kind === "empire" ? owner.doctrine.focus : "nearest";
    const by = (f: (e: Unit) => number) => pool.reduce((best, e) => (f(e) < f(best) ? e : best), pool[0]!);
    if (focus === "weakest") return by((e) => e.armor + e.structure);
    if (focus === "strongest") return by((e) => -e.strength);
    return by((e) => this.dist(u, e));
  }

  // ------------------------------------------------------------ a unit's turn

  /** A unit's turn, the computer playing it even on a commanded side. Returns whether the unit did anything. */
  act(u: Unit): boolean {
    const turn = this.unitTurn(u);
    let step = turn.next();
    while (!step.done) step = turn.next({ kind: "ai" });
    return step.value;
  }

  /**
   * Turns, moves and fires; a commanded side's unit first waits for its
   * order. Returns whether the unit did anything.
   */
  *unitTurn(u: Unit): Generator<BattleDecision, boolean, TacticalOrder> {
    if (!active(u) || u.held) return false;

    // A retreat ordered on an earlier turn takes effect as the ship's next turn begins.
    if (u.retreatOrdered) {
      u.retreatOrdered = false;
      u.retreated = true;
      this.log.push({ kind: "retreat", ship: u.key });
      for (const p of [...this.projectiles]) if (p.owner === u && p.craft) this.removeProjectile(p);
      return true;
    }
    if (this.manual[u.side]) {
      const order: TacticalOrder = yield { unit: u.key, side: u.side };
      if (order.kind === "auto") this.manual[u.side] = false;
      else if (order.kind === "retreat") {
        if (!this.canRetreat(u)) return false;
        u.retreatOrdered = true;
        return true;
      } else if (order.kind === "act") return this.actAsOrdered(u, order);
      // "ai" and "auto": the computer plays this turn.
    }
    return this.autoAct(u);
  }

  /** What a unit may do on its turn, for a player commanding it. */
  options(key: string): UnitOptions | null {
    const u = this.units.find((x) => x.key === key);
    if (!u || !active(u)) return null;
    const reaches = (t: Unit) => u.mounts.some((m) => m.count > 0 && m.shots > 0 && m.cooldown <= 0 && m.def.effect !== "antiMissile"
      && (m.def.kind === "beam" ? this.band(u, t) < MAX_BAND : m.def.kind !== "bomb" || t.kind === "planet"));
    return {
      targets: this.targets(u).map((t) => ({ key: t.key, inRange: reaches(t) })),
      reach: u.immobile || u.moved ? 0 : Math.max(0, this.currentSpeed(u)),
      canRetreat: this.canRetreat(u),
      suggested: this.chooseTarget(u)?.key ?? null,
      weapons: u.mounts.filter((m) => m.count > 0).map((m) => ({
        id: m.def.id, name: m.def.name, count: m.count, shots: Number.isFinite(m.shots) ? m.shots : null,
        ready: m.shots > 0 && m.cooldown <= 0 && !m.firedThisRound && !(m.def.kind === "bay" && (m.out || m.rearm > 0)), arc: m.arc,
      })),
    };
  }

  /** A commanded unit's turn: move toward the ordered square (or turn to face the target), then fire at the target. */
  actAsOrdered(u: Unit, order: Extract<TacticalOrder, { kind: "act" }>): boolean {
    const target = order.target ? this.targets(u).find((t) => t.key === order.target) : undefined;
    let did = false;
    if (u.kind === "station") this.stationTurn(u);
    else if (!u.immobile && !u.moved) {
      const to = order.moveTo;
      if (to && Number.isFinite(to.x) && Number.isFinite(to.y)) {
        const x = Math.min(FIELD_WIDTH - 0.5, Math.max(0.5, to.x));
        const y = Math.min(FIELD_HEIGHT - 0.5, Math.max(0.5, to.y));
        did = this.steer(u, Math.atan2(y - u.y, x - u.x), this.dist(u, { x, y }));
      } else if (target) this.steer(u, Math.atan2(target.y - u.y, target.x - u.x), 0);
    }
    u.moved = true;
    if (!target) return did;
    if (this.fire(u, target)) did = true;
    if (this.boardSomeone(u, target)) did = true;
    return did;
  }

  /** The computer's play for a unit's turn. */
  autoAct(u: Unit): boolean {
    // Ordering a retreat takes the ship's turn (likely, as the original's retreat button ends it).
    if (this.wantsOut(u) && this.canRetreat(u)) {
      u.retreatOrdered = true;
      return true;
    }
    const target = this.chooseTarget(u);
    if (!target) {
      if (u.kind === "station") this.stationTurn(u);
      return false;
    }
    let did = false;
    if (u.kind === "station") this.stationTurn(u);
    else if (!u.immobile && !u.moved) did = this.move(u, target);
    u.moved = true;
    if (this.fire(u, target)) did = true;
    if (this.boardSomeone(u, target)) did = true;
    return did;
  }

  /** Stations swing their best shield toward the nearest enemy. */
  stationTurn(u: Unit): void {
    const enemy = this.units.filter((e) => e.side !== u.side && active(e) && !e.immobile).sort((x, y) => this.dist(u, x) - this.dist(u, y))[0];
    if (!enemy) return;
    const step = (STATION_TURN_DEG * Math.PI) / 180;
    let best = u.heading;
    let bestShield = -1;
    for (const h of [u.heading - step, u.heading, u.heading + step]) {
      const save = u.heading;
      u.heading = h;
      const f = this.facingToward(u, enemy);
      u.heading = save;
      if (u.shields[f]! > bestShield + 1e-9) {
        bestShield = u.shields[f]!;
        best = h;
      }
    }
    u.heading = normAngle(best);
  }

  /** Distance a unit wants to keep from its target: beam ships close in, missile boats stand off. */
  preferredRange(u: Unit): number {
    const close = u.mounts.some((m) => m.count > 0 && (m.def.kind === "beam" || m.def.kind === "special" || m.def.kind === "bay") && m.def.effect !== "antiMissile");
    return close ? 1 : 18;
  }

  move(u: Unit, target: Unit): boolean {
    const want = this.preferredRange(u);
    return this.steer(u, Math.atan2(target.y - u.y, target.x - u.x), this.edge(u, target) - want);
  }

  /** Turns toward `goal` (radians) and flies up to `gap` squares that way, as far as its movement allows. */
  steer(u: Unit, goal: number, gap: number): boolean {
    let mp = this.currentSpeed(u);
    if (mp <= 0) return false;
    // Turning costs movement: two points per 22.5 degrees, less with inertial systems.
    const turnCost = TURN_COST_PER_STEP * u.fx.turnCost;
    const steps = Math.ceil(Math.abs(normAngle(goal - u.heading)) / STEP - 1e-9);
    if (turnCost === 0 || mp >= steps * turnCost) {
      u.heading = goal;
      mp -= steps * turnCost;
    } else {
      const can = Math.floor(mp / turnCost);
      u.heading = normAngle(u.heading + Math.sign(normAngle(goal - u.heading)) * can * STEP);
      mp -= can * turnCost;
    }
    if (gap <= 0.05) return false;
    let step = Math.min(mp, gap);
    // Teleporters jump instead of flying when the gap is wide.
    if (u.fx.teleport > 0 && gap > mp && this.specialWorks(u, u.fx.teleport === 20 ? "subspaceTeleporter" : "phaseShifter")) {
      step = Math.min(gap, u.fx.teleport);
    }
    if (step <= 0) return false;
    u.x = round1(Math.min(FIELD_WIDTH - 0.5, Math.max(0.5, u.x + Math.cos(u.heading) * step)));
    u.y = round1(Math.min(FIELD_HEIGHT - 0.5, Math.max(0.5, u.y + Math.sin(u.heading) * step)));
    this.log.push({ kind: "move", ship: u.key, x: u.x, y: u.y });
    return true;
  }

  /**
   * Beams, launchers and special weapons fire at the target, then at whatever
   * else is in reach. Hyper-X Capacitors (beams) and Fast Missile Racks fire a
   * mount twice when it has rested a turn (and at the start of the battle),
   * once otherwise.
   */
  fire(u: Unit, primary: Unit): boolean {
    let did = false;
    const incoming = this.projectiles.some((p) => p.target === u && p.owner.side !== u.side);
    const hyper = u.fx.hyperX && this.specialWorks(u, "hyperXCapacitors");
    const fast = u.fx.fastRacks && this.specialWorks(u, "fastMissileRacks");
    if (this.discharge(u, primary)) did = true;
    u.mounts.forEach((m, mi) => {
      if (m.count <= 0 || m.shots <= 0 || m.cooldown > 0 || m.firedThisRound) return;
      const kind = m.def.kind;
      if (kind === "beam") {
        // Point-defense mounts hold their fire for incoming missiles and fighters.
        if (m.mods.has("pointDefense") && incoming) return;
        const volleys = hyper && m.double ? 2 : 1;
        let fired = false;
        for (let v = 0; v < volleys; v++) if (this.fireBeams(u, m, primary)) did = fired = true;
        if (fired) {
          m.firedThisRound = true;
          m.double = false;
        }
      } else if (kind === "missile" || kind === "torpedo") {
        if (!active(primary)) return;
        const volleys = kind === "missile" && fast && m.double ? 2 : 1;
        for (let v = 0; v < volleys && m.shots > 0; v++) {
          if (this.launch(u, mi, m, primary)) did = true;
        }
        m.firedThisRound = true;
        m.double = false;
      } else if (kind === "bomb") {
        if (this.dropBombs(u, m)) did = true;
      } else if (kind === "bay") {
        if (m.out || m.rearm > 0) return;
        // Craft go after the next enemy when the first target is already gone.
        const target = active(primary) ? primary : this.chooseTarget(u);
        if (target && this.launchCraft(u, mi, m, target)) did = true;
      } else if (kind === "special") {
        if (this.fireSpecial(u, m, primary)) did = true;
      }
    });
    if (did) u.firedThisRound = true;
    return did;
  }

  /**
   * An Energy Absorber fires what it has stored at the target with the ship's
   * shots, if the target is within beam range: no roll to hit (a Displacement
   * Device can still make it miss), weakened with range like a beam and halved
   * against a planet.
   */
  discharge(u: Unit, t: Unit): boolean {
    if (u.absorbed <= 0 || !active(t) || this.untouchable(t) || !this.specialWorks(u, "energyAbsorber")) return false;
    const band = this.band(u, t);
    if (band >= MAX_BAND) return false;
    let dmg = Math.floor((u.absorbed * (100 + RANGE_BANDS.damagePct[band]!)) / 100);
    u.absorbed = 0;
    if (t.kind === "planet") dmg = Math.floor(dmg / 2);
    const ev: CombatRoundEvent = { kind: "fire", ship: u.key, target: t.key, weapon: "energyAbsorber", hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    if (!(t.fx.displacement > 0 && this.specialWorks(t, "displacementDevice") && this.rng.int(1, DIE) <= t.fx.displacement * DIE) && dmg > 0) {
      this.tally(ev, this.hit(u, t, dmg, { facing: this.facingToward(t, u) }));
    }
    this.log.push(ev);
    return true;
  }

  /** Bombs drop only on an enemy planet the side came for, from close by (further with Transporters); each volley uses a shot. */
  dropBombs(u: Unit, m: Mount): boolean {
    if (!this.sides[u.side]!.attacksPlanet) return false;
    const reach = u.fx.transporters > 0 && this.specialWorks(u, "transporters") ? COMBAT_BOMB_RANGE.transporters : COMBAT_BOMB_RANGE.normal;
    const planet = this.units.find((t) => t.kind === "planet" && t.side !== u.side && active(t) && this.edge(u, t) <= reach);
    if (!planet) return false;
    m.shots--;
    m.firedThisRound = true;
    const ev: CombatRoundEvent = { kind: "fire", ship: u.key, target: planet.key, weapon: m.def.id, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    for (let i = 0; i < m.count && planet.alive; i++) {
      this.tally(ev, this.hit(u, planet, this.rng.int(m.def.damageMin, m.def.damageMax), { facing: this.facingToward(planet, u) }));
    }
    this.log.push(ev);
    return true;
  }

  /**
   * Whether a weapon may be aimed at a unit at all: ion (systems-only) weapons
   * ignore raiders and monsters, and of the special weapons only the Stellar
   * Converter works on a planet.
   */
  canAim(m: Mount, t: Unit): boolean {
    if (m.traits.has("systemsOnly") && (t.kind === "monster" || t.player.kind === "raiders" || t.player.kind === "monsters")) return false;
    if (t.kind === "planet" && m.def.kind === "special" && m.def.effect !== "stellarConverter") return false;
    return true;
  }

  /** Whether a beam mount can reach a target, and the bands it fires at. */
  beamBands(u: Unit, m: Mount, t: Unit): { hit: number; damage: number } | null {
    let band = this.band(u, t);
    if (m.mods.has("heavyMount")) band = Math.floor(band / 2);
    if (band > MAX_BAND) return null;
    if (m.mods.has("pointDefense")) band = Math.min(MAX_BAND, band * 2);
    const hit = u.fx.rangeDivisor > 1 && this.specialWorks(u, "rangemasterUnit") ? Math.floor(band / u.fx.rangeDivisor) : band;
    return { hit, damage: band };
  }

  fireBeams(u: Unit, m: Mount, primary: Unit): boolean {
    const shots = m.count * (m.mods.has("autoFire") ? MOD_EFFECTS.autoFireShots : 1);
    const tally = new Map<Unit, CombatRoundEvent>();
    let fired = false;
    for (let s = 0; s < shots; s++) {
      let target: Unit | undefined = primary;
      if (!active(target) || this.untouchable(target) || !this.inArc(u, m, target) || !this.beamBands(u, m, target) || !this.canAim(m, target)) {
        target = this.targets(u)
          .filter((e) => this.inArc(u, m, e) && this.beamBands(u, m, e) && this.canAim(m, e))
          .sort((x, y) => this.dist(u, x) - this.dist(u, y))[0];
      }
      if (!target) break;
      fired = true;
      const ev = tally.get(target) ?? { kind: "fire", ship: u.key, target: target.key, weapon: m.def.id, damage: 0, hit: false, absorbed: 0, armorDamage: 0, structureDamage: 0 };
      tally.set(target, ev);
      this.beamShot(u, m, target, ev);
    }
    for (const ev of tally.values()) this.log.push(ev);
    return fired;
  }

  /** One beam shot: roll against defense, scale damage by the margin, then apply it. */
  beamShot(u: Unit, m: Mount, t: Unit, ev: CombatRoundEvent): void {
    const bands = this.beamBands(u, m, t)!;
    const traits = m.traits;
    let penalty = RANGE_BANDS.toHit[bands.hit]!;
    if (traits.has("doubleRangePenalty")) penalty *= 2;
    const threshold = Math.min(BEAM_HIT.maxThreshold, BEAM_HIT.threshold - penalty);
    let diff = this.attackOf(u, t) - this.defenseOf(t);
    if (traits.has("continuous") || m.mods.has("continuous")) diff += MOD_EFFECTS.continuousToHit;
    if (m.mods.has("pointDefense")) diff += MOD_EFFECTS.pointDefenseToHit;
    if (m.mods.has("autoFire")) diff += MOD_EFFECTS.autoFireToHit;
    let r = this.rng.int(1, DIE);
    if (traits.has("alwaysHits")) r = DIE;
    else if (r <= BEAM_HIT.unmodifiedAbove) r = Math.min(100, r + diff);
    if (t.fx.displacement > 0 && this.specialWorks(t, "displacementDevice") && this.rng.int(1, DIE) <= t.fx.displacement * DIE) return;
    if (r < threshold) return;
    let pct = 100;
    if (!traits.has("noRangeDissipation") && !m.mods.has("noRangeDissipation")) pct += RANGE_BANDS.damagePct[bands.damage]!;
    if (m.mods.has("heavyMount")) pct += MOD_EFFECTS.heavyMountDamagePct;
    if (m.mods.has("pointDefense")) pct += MOD_EFFECTS.pointDefenseDamagePct;
    if (u.fx.beamDamagePct && this.specialWorks(u, "highEnergyFocus")) pct += u.fx.beamDamagePct;
    pct += this.officers[u.side]!.damagePct;
    const lo = Math.max(1, Math.round((m.def.damageMin * pct) / 100));
    const hi = Math.max(1, Math.round((m.def.damageMax * pct) / 100));
    let dmg = Math.min(hi, lo + Math.floor(((hi - lo + 1) * (r - threshold)) / Math.max(1, DIE - threshold)));
    // Reflection fields bounce some beams back at the shooter.
    if (t.fx.reflection > 0 && this.specialWorks(t, "reflectionField") && this.rng.chance(t.fx.reflection / (dmg + t.fx.reflection))) {
      this.applyHit(t, u, dmg, { isBeam: true }, m.def.id);
      return;
    }
    if (t.kind === "planet" && u.kind !== "planet") dmg = Math.max(1, Math.floor(dmg * PLANET_BEAM_DAMAGE));
    const opts: HitOptions = {
      shieldPiercing: traits.has("shieldPiercing") || m.mods.has("shieldPiercing"),
      armorPiercing: m.mods.has("armorPiercing"),
      systemsOnly: traits.has("systemsOnly"),
      killsMarines: traits.has("killsMarines"),
      extraStructural: traits.has("extraStructural"),
      fromShip: true,
      isBeam: true,
    };
    const env = traits.has("enveloping") || m.mods.has("enveloping");
    const facings = env ? [0, 1, 2, 3] : [this.facingToward(t, u)];
    for (const f of facings) {
      if (!t.alive) break;
      const h = this.hit(u, t, dmg, { ...opts, facing: f });
      this.tally(ev, h);
    }
  }

  tally(ev: CombatRoundEvent, h: Hit): void {
    ev.hit = true;
    ev.absorbed = (ev.absorbed ?? 0) + h.absorbed;
    ev.armorDamage = (ev.armorDamage ?? 0) + h.armor;
    ev.structureDamage = (ev.structureDamage ?? 0) + h.structure;
    ev.damage = (ev.damage ?? 0) + h.armor + h.structure;
    if (h.system) ev.systemHit = h.system;
  }

  // ------------------------------------------------------------ missiles, torpedoes and craft

  launch(u: Unit, mi: number, m: Mount, target: Unit): boolean {
    const w = m.def;
    let damage = w.damageMax;
    if (m.mods.has("overloaded")) damage = Math.round(damage * (1 + MOD_EFFECTS.overloadedDamagePct / 100));
    // An Ordnance officer adds his percentage to missiles and torpedoes too.
    damage = Math.round((damage * (100 + this.officers[u.side]!.damagePct)) / 100);
    m.shots -= 1;
    if (w.reload) m.cooldown = w.reload;
    const base = missileSpeed(u.player, w);
    const speed = base + (m.mods.has("fast") ? MOD_EFFECTS.fastSpeed : 0);
    // Point defense rolls against 5 x speed plus the missile type's bonus; armor does not toughen missiles.
    const hp = (w.kind === "torpedo" ? TORPEDO_HP : MISSILE_HP[w.id] ?? TORPEDO_HP) * (m.mods.has("armored") ? MOD_EFFECTS.armoredHpMult : 1);
    const p: Projectile = {
      owner: u, mount: mi, weapon: w, mods: m.mods, target, x: u.x, y: u.y, speed, count: m.count, hp,
      defense: base * MISSILE_DEFENSE_PER_SPEED + (MISSILE_DEFENSE_BONUS[w.id] ?? 0), frontDamage: 0, damage, travelled: 0, craft: null,
    };
    this.log.push({ kind: "launch", ship: u.key, target: target.key, weapon: w.id });
    if (!Number.isFinite(speed)) {
      // Proton torpedoes strike the moment they are fired, within their reach.
      if (this.edge(u, target) > (w.range ?? 24)) return true;
      this.impact(p);
      return true;
    }
    this.projectiles.push(p);
    return true;
  }

  launchCraft(u: Unit, mi: number, m: Mount, target: Unit): boolean {
    const effect = m.def.effect;
    const craft = effect === "bombers" ? "bombers" : effect === "heavyFighters" ? "heavyFighters" : effect === "shuttles" ? "shuttles" : "fighters";
    if (craft === "shuttles" && (target.kind !== "ship" || u.marines <= 0)) return false;
    if (craft === "bombers" && !u.craftBomb) return false;
    m.out = true;
    const speed = craftSpeed(u.player, m.def);
    const hp = Math.floor((CRAFT[craft].hp * (100 + CRAFT_ARMOR_STEP * armorClass(u.player))) / 100);
    this.projectiles.push({
      owner: u, mount: mi, weapon: m.def, mods: new Set(), target, x: u.x, y: u.y, speed,
      defense: speed * MISSILE_DEFENSE_PER_SPEED + u.craftDefenseBonus + this.officers[u.side]!.fighters,
      count: m.garrison ?? SQUADRON_SIZE * m.count, hp, frontDamage: 0, damage: 0, travelled: 0, craft, passes: CRAFT[craft].shots,
    });
    this.log.push({ kind: "launch", ship: u.key, target: target.key, weapon: m.def.id });
    return true;
  }

  /** Projectiles of a side fly toward their targets; those that arrive strike. */
  moveProjectiles(side: 0 | 1): boolean {
    let any = false;
    const flying = this.projectiles.filter((p) => p.owner.side === side);
    for (const p of flying) {
      if (!active(p.target) || this.untouchable(p.target)) {
        // Guidance systems pick a new target when the first one is gone.
        const next = knows(p.owner.player, "dauntlessGuidance") || p.craft
          ? this.targets(p.owner).sort((x, y) => this.dist(p, x) - this.dist(p, y))[0]
          : undefined;
        if (!next) {
          this.removeProjectile(p);
          continue;
        }
        p.target = next;
      }
      const d = Math.max(0, this.dist(p, p.target) - this.radius(p.target));
      any = true;
      if (d <= p.speed) {
        p.travelled += d;
        p.x = p.target.x;
        p.y = p.target.y;
        if (p.craft && p.craft !== "shuttles") {
          // A squadron makes one pass a turn over its target until its passes are spent, then flies home.
          this.impact(p);
          p.passes = (p.passes ?? 1) - 1;
          if (p.passes <= 0 || p.count <= 0) this.removeProjectile(p);
          continue;
        }
        this.removeProjectile(p);
        this.impact(p);
      } else {
        const a = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        p.x += Math.cos(a) * p.speed;
        p.y += Math.sin(a) * p.speed;
        p.travelled += p.speed;
      }
    }
    return any;
  }

  removeProjectile(p: Projectile): void {
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
    if (p.craft) {
      const m = p.owner.mounts[p.mount];
      if (m) {
        m.out = false;
        // A garrison launches fresh craft every few combat turns; a carrier's bays need a short rearm.
        m.rearm = m.garrison ? FIGHTER_GARRISON.replenishRounds - (this.round % FIGHTER_GARRISON.replenishRounds) : CRAFT.rearm;
      }
    }
  }

  /**
   * Point defense, anti-missile rockets and lightning fields thin out incoming
   * missiles and craft. Point defense and rockets only bother with missiles
   * and craft whose damage would get through the target's shield class;
   * torpedoes cannot be shot down.
   */
  interceptions(p: Projectile): void {
    const t = p.target;
    const torpedo = p.weapon.kind === "torpedo";
    const shield = this.shieldWorks(t) ? t.shieldClass : 0;
    const threat = p.craft ? Math.max(p.owner.craftBeam.damageMax, p.owner.craftBomb?.damageMax ?? 0) : p.damage;
    if (!torpedo && threat > shield) {
      const defense = p.defense;
      for (const m of t.mounts) {
        if (p.count <= 0) break;
        if (m.count <= 0) continue;
        if (m.def.kind === "beam" && m.mods.has("pointDefense") && !m.firedThisRound) {
          m.firedThisRound = true;
          const ev: CombatRoundEvent = { kind: "fire", ship: t.key, target: p.owner.key, weapon: m.def.id, hit: false, damage: 0 };
          for (let i = 0; i < m.count && p.count > 0; i++) {
            const r = this.rng.int(1, DIE);
            const roll = r <= BEAM_HIT.unmodifiedAbove ? r + this.attackOf(t, p.owner) + MOD_EFFECTS.pointDefenseToHit - defense : DIE;
            if (roll < BEAM_HIT.threshold) continue;
            const pct = 100 + MOD_EFFECTS.pointDefenseDamagePct;
            const dmg = Math.max(1, Math.round((this.rng.int(m.def.damageMin, m.def.damageMax) * pct) / 100));
            p.frontDamage += dmg;
            if (p.frontDamage >= p.hp) {
              // One hit downs at most one missile; what is left over carries to the next.
              p.count--;
              p.frontDamage = Math.min(p.frontDamage - p.hp, p.hp - 1);
              ev.hit = true;
            }
          }
          this.log.push(ev);
        }
        if (m.def.effect === "antiMissile" && !p.craft && m.shots > 0) {
          // Missiles are met as they strike, at range band 0.
          const band = 0;
          const below = ANTI_MISSILE.base - Math.floor((band + 2) * ANTI_MISSILE.perBandStep);
          for (let i = 0; i < m.count && p.count > 0 && m.shots > 0; i++) {
            m.shots--;
            if (this.rng.int(1, DIE) < below) p.count--;
          }
        }
      }
    }
    if (t.fx.lightning > 0 && this.specialWorks(t, "lightningField")) {
      let kept = 0;
      for (let i = 0; i < p.count; i++) if (!this.rng.chance(t.fx.lightning)) kept++;
      p.count = kept;
    }
  }

  impact(p: Projectile): void {
    const t = p.target;
    const u = p.owner;
    if (!active(t)) return;
    this.interceptions(p);
    if (p.count <= 0) {
      this.log.push({ kind: "fire", ship: u.key, target: t.key, weapon: p.weapon.id, hit: false, damage: 0 });
      return;
    }
    if (p.craft) {
      this.craftAttack(p);
      return;
    }
    // Jammers send some missiles astray; the attacker's scanners and ECCM cut through.
    let jam = Math.max(0, this.missileEvasionOf(t) - u.scannerEccm);
    if (p.mods.has("eccm")) jam /= 2;
    if (this.cloaked(t)) jam = 100 - (100 - jam) / 2;
    const ev: CombatRoundEvent = { kind: "fire", ship: u.key, target: t.key, weapon: p.weapon.id, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    let damage = p.damage;
    if (p.weapon.traits?.includes("dissipates") && !p.mods.has("noRangeDissipation")) {
      damage = Math.max(0, damage - (p.weapon.dissipation ?? TORPEDO_DISSIPATION) * Math.max(0, Math.floor(p.travelled) - 1));
    }
    if (t.kind === "planet" && p.weapon.kind === "torpedo") damage = Math.floor(damage * PLANET_TORPEDO_DAMAGE);
    const warheads = p.mods.has("mirv") ? MOD_EFFECTS.mirvWarheads : 1;
    const env = p.mods.has("enveloping");
    const always = p.weapon.traits?.includes("alwaysHits");
    for (let i = 0; i < p.count && t.alive; i++) {
      if (!always && this.rng.int(1, DIE) <= jam) continue;
      if (!always && t.fx.displacement > 0 && this.specialWorks(t, "displacementDevice") && this.rng.chance(t.fx.displacement)) continue;
      for (let w = 0; w < warheads && t.alive; w++) {
        const facings = env ? [0, 1, 2, 3] : [this.facingToward(t, u)];
        for (const f of facings) {
          if (!t.alive || damage <= 0) break;
          this.tally(ev, this.hit(u, t, damage, { facing: f, emissions: p.mods.has("emissionsGuidance") }));
        }
      }
    }
    this.log.push(ev);
  }

  /** A squadron reaches its target: fighters strafe, bombers bomb, shuttles board. */
  craftAttack(p: Projectile): void {
    const t = p.target;
    const u = p.owner;
    if (p.craft === "shuttles") {
      // Shuttles land their marines whatever the odds; the game still picks capture or hit-and-run.
      if (t.captured || (t.kind !== "ship" && t.kind !== "station")) return;
      this.board(u, t, Math.min(u.marines, p.count), "assaultShuttles", this.boardingMode(u, t) === 2 ? 2 : 1);
      return;
    }
    const ev: CombatRoundEvent = { kind: "fire", ship: u.key, target: t.key, weapon: p.weapon.id, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    // Craft come in on the weakest shield.
    const facing = t.shields.indexOf(Math.min(...t.shields));
    const strafe = p.craft === "fighters" || p.craft === "heavyFighters";
    const bomb = (p.craft === "bombers" || p.craft === "heavyFighters") && u.craftBomb;
    const attack = u.craftAttack + this.sideAttack[u.side]! + this.officers[u.side]!.fighters;
    const beam = u.craftBeam;
    for (let c = 0; c < p.count && t.alive; c++) {
      if (strafe) {
        // One beam shot per craft and pass: d100 (above 95 is a sure hit) + attack - defense, hitting from 40 up.
        let r = this.rng.int(1, DIE);
        if (r > CRAFT.sureAbove) r = DIE;
        r += attack - this.defenseOf(t);
        if (r >= CRAFT.hitAt) {
          let dmg = Math.min(beam.damageMax, beam.damageMin + Math.floor(((r - CRAFT.hitAt) * (beam.damageMax - beam.damageMin + 1)) / (DIE - CRAFT.hitAt)));
          dmg = Math.round((dmg * (100 + this.officers[u.side]!.damagePct)) / 100);
          if (t.kind === "planet") dmg = Math.floor(dmg / 2);
          if (dmg > 0) this.tally(ev, this.hit(u, t, dmg, { facing, shieldPiercing: beam.traits?.includes("shieldPiercing") }));
        }
      }
      if (bomb && t.alive) this.tally(ev, this.hit(u, t, Math.round((this.rng.int(bomb.damageMin, bomb.damageMax) * (100 + this.officers[u.side]!.damagePct)) / 100), { facing }));
    }
    this.log.push(ev);
  }

  // ------------------------------------------------------------ special weapons

  fireSpecial(u: Unit, m: Mount, primary: Unit): boolean {
    const w = m.def;
    const reach = w.range ?? Infinity;
    const inReach = (t: Unit) => active(t) && !this.untouchable(t) && this.edge(u, t) <= reach;
    const ev = (t: Unit): CombatRoundEvent => ({ kind: "fire", ship: u.key, target: t.key, weapon: w.id, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 });
    const roll = (t: Unit) => this.rng.int(w.damageMin, w.damageMax) * (w.perSize ? Math.min(10, t.sizeClass) : 1);
    if (!this.canAim(m, primary)) return false;
    switch (w.effect) {
      case "antiMissile":
        return false;
      case "tractor": {
        if (!inReach(primary) || primary.immobile) return false;
        primary.tractor += m.count;
        this.log.push({ ...ev(primary), hit: true });
        return true;
      }
      case "gyro": {
        // Each destabilizer rolls its damage once per hull size step of the target (frigate 1 ... doom star 6),
        // straight to the structure: shields, armor and systems do not stop it.
        if (!inReach(primary)) return false;
        let dmg = 0;
        for (let i = 0; i < m.count; i++) dmg += this.rng.int(w.damageMin, w.damageMax) * (primary.hullRank + 1);
        const e = ev(primary);
        this.tally(e, this.hit(u, primary, dmg, { structureOnly: true }));
        this.log.push(e);
        return true;
      }
      case "plasmaWeb": {
        if (!inReach(primary)) return false;
        const dmg = Array.from({ length: m.count }, () => roll(primary)).reduce((s, x) => s + x, 0);
        const e = ev(primary);
        this.tally(e, this.hit(u, primary, dmg, { facing: this.facingToward(primary, u) }));
        this.log.push(e);
        if (primary.alive) primary.web = { by: u, damage: Math.max(primary.web?.damage ?? 0, dmg - PLASMA_WEB_DECAY) };
        return true;
      }
      case "pulsar":
      case "spatialCompressor": {
        // It goes off once an enemy is within reach, and strikes every other unit around the ship, friend or foe.
        if (!this.units.some((t) => t.side !== u.side && t.kind !== "planet" && inReach(t))) return false;
        let power = 0;
        for (let i = 0; i < m.count; i++) power += this.rng.int(w.damageMin, w.damageMax);
        for (const t of this.units) {
          if (t === u || t.kind === "planet" || !active(t) || this.untouchable(t) || this.edge(u, t) > AREA_BLAST_RADIUS) continue;
          const e = ev(t);
          if (w.effect === "pulsar") {
            // The blast strikes once per hull size step for 1 to its power each, as one hit on the facing toward the ship.
            let dmg = 0;
            for (let k = 0; k <= Math.max(0, t.hullRank); k++) dmg += this.rng.int(1, power);
            this.tally(e, this.hit(u, t, dmg, { facing: this.facingToward(t, u) }));
          } else {
            // The compressor crushes the structure directly.
            this.tally(e, this.hit(u, t, power, { structureOnly: true }));
          }
          this.log.push(e);
        }
        // Missiles and craft in the blast may be wrecked, more likely the weaker they are; craft are missed half the time.
        for (const p of [...this.projectiles]) {
          if (this.squares(p, u) > AREA_BLAST_RADIUS + this.radius(u) || p.weapon.kind === "torpedo") continue;
          if (p.craft && this.rng.chance(AREA_BLAST_PROJECTILE.craftSkip)) continue;
          const chance = Math.min(1, (power * AREA_BLAST_PROJECTILE.pctPerDamage) / Math.max(1, p.hp) / 100);
          let kept = 0;
          for (let i = 0; i < p.count; i++) if (!this.rng.chance(chance)) kept++;
          p.count = kept;
          if (p.count <= 0) this.removeProjectile(p);
        }
        return true;
      }
      case "stasis": {
        // Each stasis field holds one ship until it is let go, its holder is lost or the field is destroyed.
        const holding = this.units.filter((t) => t.held === u).length;
        const can = u.mounts.filter((x) => x.def.effect === "stasis").reduce((n, x) => n + x.count, 0);
        if (holding >= can || !inReach(primary) || primary.kind === "planet" || primary.held) return false;
        primary.held = u;
        for (const p of [...this.projectiles]) if (p.target === primary && p.craft) this.removeProjectile(p);
        this.log.push({ ...ev(primary), hit: true });
        return true;
      }
      case "blackHole": {
        // Stations can be caught too; the ship is lost two turns later unless the generator is lost first.
        if (!inReach(primary) || primary.kind === "planet" || primary.blackHole) return false;
        primary.blackHole = { by: u, turns: 1 };
        this.log.push({ ...ev(primary), hit: true });
        return true;
      }
      case "stellarConverter": {
        if (!active(primary)) return false;
        const e = ev(primary);
        for (let i = 0; i < m.count && primary.alive; i++) {
          for (let f = 0; f < SHIELD_FACINGS && primary.alive; f++) this.tally(e, this.hit(u, primary, w.damageMax, { facing: f }));
        }
        this.log.push(e);
        return true;
      }
      default:
        return false;
    }
  }

  // ------------------------------------------------------------ boarding

  /** Whether marines of `a` can reach `t` now, and whether that is by transporters beaming across a gap. */
  boardingReach(a: Unit, t: Unit): { transporters: boolean } | null {
    if (t.kind === "planet" || t.kind === "monster" || !active(t) || t.captured || this.untouchable(t)) return null;
    if (t.side === a.side || a.marines <= 0 || t.player.kind === "monsters" || a.player.kind === "monsters") return null;
    const band = this.band(a, t);
    const stuck = this.currentSpeed(t) <= 0;
    // Side by side with a ship that cannot move (drive gone, held by a tractor beam, a station), marines walk across, shields or not.
    if (band <= BOARDING.adjacentBand && stuck) return { transporters: false };
    if (a.fx.transporters <= 0 || !this.specialWorks(a, "transporters") || band > BOARDING.transporterBand) return null;
    // Transporters need the facing shield down and no hard shields.
    if (t.hardShields) return null;
    if (this.shieldWorks(t) && t.shields[this.facingToward(t, a)]! > 0) return null;
    return { transporters: true };
  }

  /**
   * One marine's strength: equipment, race picks (High-G and Low-G likely as decoded) and the AI difficulty bonus
   * as in ground combat, plus a Commando captain; defenders add Security Stations and a Security captain (both
   * captain skills likely, as decoded). Crew training counts only in the estimate and in raids, not in captures.
   */
  marineStrength(u: Unit, defending: boolean): { rating: number; hits: number } {
    const base = u.player.kind === "empire" || u.player.kind === "raiders"
      ? troopUnit(this.state, u.ownerId, u.player.raceId, "marines", false)
      : { rating: 0, hits: 1 };
    const commando = u.fleetId ? captainSkills(this.state, u.fleetId).groundCombat ?? 0 : 0;
    // Security Stations (+20) and a Security captain stand with the defenders.
    return { rating: base.rating + commando + (defending ? u.fx.boardingDefense : 0), hits: base.hits };
  }

  /**
   * The game's own estimate of a boarding, one marine against one: 0 means
   * hopeless, 1 hit-and-run, 2 capture. Telepaths always try to take the ship.
   */
  boardingMode(a: Unit, t: Unit): 0 | 1 | 2 {
    const att = this.marineStrength(a, false).rating + CREW.boarding[a.crew]!;
    const def = this.marineStrength(t, true).rating + CREW.boarding[t.crew]!;
    if (att <= def - BOARDING.hopelessBelow) return 0;
    if (a.player.kind === "empire" && hasTrait(getRace(a.player.raceId), "telepathic")) return 2;
    return a.marines >= t.marines && att > def - BOARDING.captureWithin ? 2 : 1;
  }

  /** After firing, a ship with marines boards the first enemy it can reach and has a chance against. */
  boardSomeone(u: Unit, primary: Unit): boolean {
    if (u.marines <= 0 || u.kind === "planet") return false;
    const others = this.units.filter((e) => e !== primary && e.side !== u.side).sort((x, y) => this.dist(u, x) - this.dist(u, y));
    for (const t of [primary, ...others]) {
      const reach = this.boardingReach(u, t);
      if (!reach) continue;
      const mode = this.boardingMode(u, t);
      if (mode === 0) continue;
      let party = Math.max(1, Math.floor(u.marines * BOARDING.partyShare));
      // Beaming into a Damper Field from a distance loses two thirds of the party.
      if (reach.transporters && !(this.band(u, t) <= BOARDING.adjacentBand && this.currentSpeed(t) <= 0)
        && t.fx.damageTaken < 1 && this.specialWorks(t, "damperField")) {
        party = Math.floor(party / BOARDING.damperDivisor);
        if (party <= 0) continue;
      }
      this.board(u, t, party, reach.transporters ? "transporters" : "marines", mode);
      return true;
    }
    return false;
  }

  /** Sends a boarding party across: a capture fight or a hit-and-run raid. */
  board(u: Unit, t: Unit, marines: number, via: string, mode: 1 | 2): void {
    if ((t.kind !== "ship" && t.kind !== "station") || !active(t) || marines <= 0) return;
    marines = Math.min(marines, u.marines);
    if (marines <= 0) return;
    u.marines -= marines;
    if (mode === 1) {
      this.raid(u, t, marines, via);
      return;
    }
    // The capture fight uses the ground-combat rules: both roll, the lower takes a hit and a tie hits both.
    const atk = this.marineStrength(u, false);
    const dfn = this.marineStrength(t, true);
    const attackers: number[] = Array(marines).fill(atk.hits);
    const defenders: number[] = Array(t.marines).fill(dfn.hits);
    while (attackers.length > 0 && defenders.length > 0) {
      const a = this.rng.int(1, DIE) + atk.rating;
      const d = this.rng.int(1, DIE) + dfn.rating;
      if (a >= d && --defenders[0]! <= 0) defenders.shift();
      if (d >= a && --attackers[0]! <= 0) attackers.shift();
    }
    const took = attackers.length > 0;
    this.log.push({ kind: "board", ship: u.key, target: t.key, weapon: via, hit: took, damage: marines - attackers.length });
    if (!took) {
      t.marines = defenders.length;
      return;
    }
    // The survivors hold the prize as its new marines; its captain dies. (StarLord's captains lead whole fleets; a
    // guess puts the captain aboard the fleet's first ship.)
    t.marines = attackers.length;
    if (t.flagship && t.fleetId) this.captainsKilled.push(t.fleetId);
    t.flagship = false;
    // A Quantum Detonator blows up half the ships boarders take.
    if (t.fx.detonator > 0 && this.rng.chance(BOARDING.detonatorChance)) {
      this.destroy(t, "detonator");
      return;
    }
    const telepath = u.player.kind === "empire" && hasTrait(getRace(u.player.raceId), "telepathic");
    // The original only says the prize does nothing more; here it also leaves the field so nobody wastes fire on it.
    t.captured = { by: u, fightsOn: telepath };
    t.side = u.side;
    t.ownerId = u.ownerId;
    t.player = u.player;
    t.retreatOrdered = false;
    t.heading = u.heading;
    for (const p of [...this.projectiles]) if (p.owner === t || p.target === t) this.removeProjectile(p);
    this.log.push({ kind: "captured", ship: t.key, target: u.key, hit: telepath });
  }

  /**
   * Hit-and-run: each marine rolls against the defenders. Beating them by
   * more than 20 wrecks two internal systems (50 damage each); by more than 50
   * a defender also dies; losing by more than 50 costs the marine. The rest
   * come back.
   */
  raid(u: Unit, t: Unit, marines: number, via: string): void {
    const R = BOARDING.raid;
    const att = this.marineStrength(u, false).rating + CREW.boarding[u.crew]!;
    const def = this.marineStrength(t, true).rating + CREW.boarding[t.crew]!;
    let back = marines;
    const h: Hit = { absorbed: 0, armor: 0, structure: 0 };
    let wrecked = 0;
    for (let i = 0; i < marines && t.alive; i++) {
      const diff = (att + this.rng.int(1, DIE)) - (def + this.rng.int(1, DIE));
      if (diff > R.sabotageAbove) {
        for (let k = 0; k < R.systems && t.alive; k++) {
          const sys = this.pickSystem(t, null);
          if (!sys) break;
          this.damageSystem(t, sys, R.systemDamage, h);
          wrecked++;
        }
      }
      if (diff > R.killAbove && t.marines > 0) t.marines--;
      if (diff < R.dieBelow) back--;
    }
    u.marines += back;
    this.log.push({ kind: "board", ship: u.key, target: t.key, weapon: via, hit: wrecked > 0, damage: marines - back, ...(h.system ? { systemHit: h.system } : {}) });
  }

  // ------------------------------------------------------------ damage

  /** Applies a hit and logs it as one shot. */
  applyHit(from: Unit, t: Unit, dmg: number, opts: HitOptions, weapon: string): void {
    const ev: CombatRoundEvent = { kind: "fire", ship: from.key, target: t.key, weapon, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    this.tally(ev, this.hit(from, t, dmg, { facing: this.facingToward(t, from), ...opts }));
    this.log.push(ev);
  }

  /**
   * The original's damage routine. An Energy Absorber takes a quarter of the
   * hit first (at least 1 point) and stores it; a Damper Field cuts the rest
   * to a quarter. Shields take a flat amount per hit, then the facing's pool.
   * A Structural Analyzer doubles what gets through. Graviton beams tear half
   * the damage out of the structure twice before armor. The rest is placed a
   * piece at a time: on armor while it lasts (unless something bypasses it),
   * then on an internal system or the structure (see DAMAGE). Every point on
   * structure or a system may kill a marine.
   */
  hit(from: Unit | null, t: Unit, raw: number, o: HitOptions): Hit {
    const h: Hit = { absorbed: 0, armor: 0, structure: 0 };
    if (!t.alive || raw <= 0) return h;
    let dmg = raw;
    if (t.kind === "planet") return this.hitPlanet(t, dmg, o, h);
    if (o.structureOnly) {
      const s = Math.min(t.structure, Math.round(dmg));
      t.structure -= s;
      h.structure += s;
      this.casualties(t, s);
      if (t.structure <= 0) this.destroy(t);
      return h;
    }
    if (t.fx.absorber > 0 && this.specialWorks(t, "energyAbsorber")) {
      const taken = Math.min(dmg, Math.max(1, Math.floor(dmg * DAMAGE.absorberShare)));
      h.absorbed += taken;
      t.absorbed += taken;
      dmg -= taken;
    }
    const damper = t.fx.damageTaken < 1 && this.specialWorks(t, "damperField");
    if (damper) {
      const kept = Math.floor(dmg * t.fx.damageTaken);
      h.absorbed += dmg - kept;
      dmg = kept;
    }
    const pierce = o.ignoreShields || (o.shieldPiercing && !t.hardShields);
    if (this.shieldWorks(t) && !pierce) {
      const flat = Math.min(dmg, t.shieldClass);
      dmg -= flat;
      h.absorbed += flat;
      const f = o.facing ?? 0;
      const pool = t.shields[f]!;
      const soak = Math.min(pool, dmg);
      t.shields[f] = pool - soak;
      dmg -= soak;
      h.absorbed += soak;
    }
    dmg = Math.round(dmg);
    if (dmg <= 0) return h;
    if (o.killsMarines && !damper) t.marines = Math.max(0, t.marines - Math.floor(dmg / 5));
    if (from && from.fx.penetratingMult > 1 && this.specialWorks(from, "structuralAnalyzer")) dmg *= from.fx.penetratingMult;
    const achilles = !!from && from.fx.achilles > 0 && this.specialWorks(from, "achillesTargetingUnit");
    if (o.systemsOnly) {
      // Raider ships cannot be aimed at with system-only weapons; this is only a safeguard.
      if (t.player.kind === "raiders") return h;
      if (t.kind === "monster") {
        dmg = Math.floor(dmg / 4);
        const s = Math.min(t.structure, dmg);
        t.structure -= s;
        h.structure += s;
        if (t.structure <= 0) this.destroy(t);
        return h;
      }
    }
    if (o.extraStructural) {
      // The original adds half the damage to the structure twice (a doubled macro), before armor.
      const half = Math.floor(dmg / 2);
      for (let k = 0; k < 2 && t.structure > 0; k++) {
        const s = Math.min(t.structure, half);
        t.structure -= s;
        h.structure += s;
      }
      if (t.structure <= 0) {
        this.destroy(t);
        return h;
      }
    }
    const skipArmor = o.bypassArmor || achilles || (o.armorPiercing && !t.noArmorPierce) || !!o.systemsOnly;
    let left = dmg;
    for (let guard = 0; left > 0 && t.alive && guard < 1000; guard++) {
      if (o.emissions && t.drive) {
        left = this.toSystem(t, t.drive, left, h);
        continue;
      }
      if (!skipArmor && t.armor > 0) {
        const a = Math.min(t.armor, left);
        t.armor -= a;
        h.armor += a;
        left -= a;
        continue;
      }
      const sys = this.internalHit(t, achilles, !!o.systemsOnly);
      if (sys === "none") break;
      if (sys === "structure") {
        const s = Math.min(t.structure, left);
        t.structure -= s;
        h.structure += s;
        this.casualties(t, s);
        left = 0;
        break;
      }
      left = this.toSystem(t, sys, left, h);
    }
    if (t.structure <= 0) this.destroy(t);
    return h;
  }

  /** Each point of damage on structure or a system kills one of the unit's marines with a small chance. */
  casualties(t: Unit, points: number): void {
    for (let i = 0; i < points && t.marines > 0; i++) if (this.rng.chance(DAMAGE.crewCasualty)) t.marines--;
  }

  /**
   * Where the next piece of damage past armor lands: a system, chosen by its
   * hit points (weapons and shield generator triple with an Achilles Targeting
   * Unit), with chance S / (structure + S); otherwise the structure. Systems-only
   * weapons always pick a system ("none" when none is left).
   */
  internalHit(t: Unit, achilles: boolean, systemsOnly: boolean): System | "structure" | "none" {
    const list = this.systems(t);
    const drive = t.drive && t.drive.hp > 0 ? t.drive.hp : 0;
    const s = list.reduce((n, x) => n + x.hp, 0) - drive + Math.floor(drive / 2);
    let chance = systemsOnly ? 100 : s + Math.max(0, t.structure) > 0 ? Math.floor((s * 100) / (Math.max(0, t.structure) + s)) : 0;
    if (t.kind === "monster") chance = Math.min(chance, DAMAGE.monsterSystemCap);
    if (this.rng.int(1, DIE) > chance || list.length === 0) return systemsOnly ? "none" : "structure";
    const weight = (x: System) => x.hp * (achilles && (x.mount !== undefined || x.id === "shield") ? 3 : 1);
    const total = list.reduce((n, x) => n + weight(x), 0);
    if (total <= 0) return systemsOnly ? "none" : "structure";
    let r = this.rng.int(1, total);
    for (const x of list) {
      r -= weight(x);
      if (r <= 0) return x;
    }
    return list.at(-1)!;
  }

  /**
   * Damage on one system. It takes what it has left (a weapon mount only the
   * weapon being hit) and returns the rest to be placed again; a drive passes
   * its excess to the structure.
   */
  toSystem(t: Unit, sys: System, dmg: number, h: Hit): number {
    let used: number;
    let left: number;
    if (sys.mount !== undefined) {
      const m = t.mounts[sys.mount]!;
      const need = m.hpEach - m.wound;
      used = Math.min(dmg, need);
      left = dmg - used;
      if (used >= need) {
        m.count--;
        m.wound = 0;
        h.system = m.def.id;
        if (m.def.effect === "stasis" || m.def.effect === "blackHole") this.checkStasis();
      } else m.wound += used;
    } else {
      used = Math.min(dmg, sys.hp);
      left = dmg - used;
      sys.hp -= used;
      if (sys.hp <= 0) {
        h.system = sys.id;
        if (sys.id === "shield") t.shields.fill(0);
      }
      if (sys.id === "drive" && left > 0) {
        const s = Math.min(t.structure, left);
        t.structure -= s;
        h.structure += s;
        used += s;
        left = 0;
      }
    }
    this.casualties(t, used);
    // A ship whose drive is destroyed explodes.
    if (sys.id === "drive" && sys.hp <= 0 && t.alive) this.destroy(t, "drive");
    return left;
  }

  /**
   * Planets have no armor. While installations stand, damage past the
   * planetary shield (plus the owner's ship shield class) gathers in a pool,
   * and every full installation's worth knocks one out at random. Once they
   * are all gone, damage past the planet's own shield falls on the colony:
   * every PLANET_POPULATION_HP is one bombing hit. Graviton beams count double
   * and ion weapons do nothing.
   */
  hitPlanet(t: Unit, raw: number, o: HitOptions, h: Hit): Hit {
    if (o.systemsOnly) return h;
    const standing = t.installations.some((i) => i.alive);
    let dmg = raw;
    if (!o.ignoreShields && !o.structureOnly) {
      const flat = Math.min(dmg, standing ? t.planetShield : t.popShield);
      dmg -= flat;
      h.absorbed += flat;
    }
    if (dmg <= 0) return h;
    if (o.extraStructural) dmg *= 2;
    if (!standing) {
      h.structure += dmg;
      t.popPool += dmg;
      while (t.popPool >= PLANET_POPULATION_HP) {
        t.popPool -= PLANET_POPULATION_HP;
        t.popHits++;
      }
      return h;
    }
    h.structure += Math.min(dmg, t.structure);
    t.installationPool += dmg;
    while (t.installationPool >= t.installationHP) {
      const up = t.installations.map((inst, i) => (inst.alive ? i : -1)).filter((i) => i >= 0);
      if (up.length === 0) break;
      const i = up[this.rng.int(0, up.length - 1)]!;
      t.installations[i]!.alive = false;
      t.installationPool -= t.installationHP;
      h.system = t.installations[i]!.name;
      for (const m of t.mounts) if (m.installation === i) m.count = 0;
    }
    const up = t.installations.filter((i) => i.alive).length;
    t.structure = Math.max(0, up * t.installationHP - t.installationPool);
    if (up === 0) {
      // The guns are silent, but the planet stays in the fight as a target for whoever came for it.
      t.installationPool = 0;
      this.log.push({ kind: "destroyed", ship: t.key });
    }
    return h;
  }

  pickSystem(t: Unit, from: Unit | null, list = this.systems(t)): System | undefined {
    if (list.length === 0) return undefined;
    const achilles = !!from && from.fx.achilles > 0;
    const weight = (s: System) => s.hp * (achilles && (s.mount !== undefined || s.id === "shield") ? from!.fx.achilles : 1);
    const total = list.reduce((sum, s) => sum + weight(s), 0);
    let r = this.rng.next() * total;
    for (const s of list) {
      r -= weight(s);
      if (r < 0) return s;
    }
    return list.at(-1);
  }

  damageSystem(t: Unit, sys: System, dmg: number, h: Hit): void {
    if (sys.mount !== undefined) {
      const m = t.mounts[sys.mount]!;
      let left = dmg;
      while (left > 0 && m.count > 0) {
        const need = m.hpEach - m.wound;
        if (left >= need) {
          left -= need;
          m.count--;
          m.wound = 0;
          h.system = m.def.id;
        } else {
          m.wound += left;
          left = 0;
        }
      }
      return;
    }
    sys.hp = Math.max(0, sys.hp - dmg);
    if (sys.hp > 0) return;
    h.system = sys.id;
    if (sys.id === "drive") {
      // A ship whose drive is destroyed explodes.
      this.destroy(t, "drive");
    } else if (sys.id === "shield") {
      t.shields.fill(0);
    }
  }

  /**
   * Removes a destroyed unit. A ship that loses its drive explodes, and so
   * does anything with a Quantum Detonator, however it died.
   */
  destroy(t: Unit, cause: "structure" | "drive" | "detonator" = "structure"): void {
    if (!t.alive) return;
    t.alive = false;
    t.retreatOrdered = false;
    t.armor = Math.max(0, t.armor);
    t.structure = 0;
    this.log.push({ kind: "destroyed", ship: t.key });
    for (const p of [...this.projectiles]) if (p.owner === t) this.removeProjectile(p);
    const detonator = t.fx.detonator > 0;
    if ((cause === "drive" && t.drive) || cause === "detonator" || detonator) this.explode(t, detonator);
  }

  /**
   * An explosion of 5 x the drive hit points of the unit's hull row (x3 with a
   * Quantum Detonator) strikes every unit and missile within the blast
   * radius, weaker with distance: D x (1 - d^2 / R^2), at least 1. A unit is
   * hit (its hull size + 1) times for 1 to that much each, summed into one hit
   * on the facing toward the blast. Anything it destroys may explode in turn.
   */
  explode(t: Unit, detonator: boolean): void {
    const D = EXPLOSION.perDriveHP * t.blastDriveHP * (detonator ? EXPLOSION.detonatorMult : 1);
    if (D <= 0) return;
    const R = EXPLOSION.radius;
    const strength = (d: number) => Math.max(1, Math.floor(D * (1 - (d * d) / (R * R))));
    for (const u of this.units) {
      if (u === t || !active(u) || u.held) continue;
      const d = this.squares(t, u);
      if (d >= R) continue;
      const each = strength(d);
      let dmg = 0;
      for (let i = 0; i <= Math.max(0, u.hullRank); i++) dmg += this.rng.int(1, each);
      this.applyHit(t, u, dmg, { facing: this.facingToward(u, t) }, "explosion");
    }
    // Missiles and craft caught in the blast are lost if it is stronger than they are (a guess at how the original treats them).
    for (const p of [...this.projectiles]) {
      const d = this.squares(t, p);
      if (d < R && strength(d) >= p.hp) this.removeProjectile(p);
    }
  }

  // ------------------------------------------------------------ retreat

  retreatBlocked(u: Unit): boolean {
    return this.units.some((e) => e.side !== u.side && active(e) && e.fx.warpDissipator && this.specialWorks(e, "warpDissipator"));
  }

  /**
   * Whether a ship may be ordered out: it needs a working drive and speed
   * left, its owner must be an empire, and no enemy Warp Dissipator may be
   * in the fight. Stations and planets never retreat.
   */
  canRetreat(u: Unit): boolean {
    if (u.kind !== "ship" || u.captured || u.retreatOrdered || !u.drive || u.player.kind !== "empire") return false;
    return this.currentSpeed(u) > 0 && !this.retreatBlocked(u);
  }

  /** Whether the ship's empire wants it out of the battle this turn. */
  wantsOut(u: Unit): boolean {
    if (u.kind !== "ship" || u.player.kind !== "empire") return false;
    if (this.pullOut[u.side]) return true;
    // Computer ships with nothing left to fire leave on their own, if their empire may retreat at all (likely, from the original's AI).
    return !u.player.isHuman && this.mayRetreat[u.side] && !hasWeapons(u);
  }

  /**
   * As a side's phase begins its empire decides whether to pull out. Human
   * players follow their doctrine: retreat once their side's strength falls
   * below the set share of the enemy's. Computer players do as the original's
   * AI: in a battle between empires, if they hold another colony, they leave
   * when one volley of the enemy would take more than five times the share of
   * their hit points that their own volley would take of the enemy's.
   */
  decideRetreat(side: 0 | 1): void {
    this.pullOut[side] = false;
    // A commanding player orders retreats ship by ship.
    if (this.manual[side]) return;
    const owner = this.state.players[this.sides[side].ownerId]!;
    if (owner.kind !== "empire") return;
    const mine = this.units.filter((x) => x.side === side && active(x));
    const theirs = this.units.filter((x) => x.side !== side && active(x));
    if (mine.length === 0 || theirs.length === 0 || !mine.some((x) => this.canRetreat(x))) return;
    if (owner.isHuman) {
      const myStrength = this.sideStrength(mine);
      const theirStrength = this.sideStrength(theirs);
      this.pullOut[side] = theirStrength > 0 && myStrength < owner.doctrine.retreatBelow * theirStrength;
      return;
    }
    if (!this.mayRetreat[side]) return;
    const myHP = mine.reduce((n, x) => n + this.hitPoints(x), 0);
    const theirHP = theirs.reduce((n, x) => n + this.hitPoints(x), 0);
    if (myHP <= 0 || theirHP <= 0) return;
    const volley = (from: Unit[], at: Unit[]) => from.reduce((n, x) => n + Math.max(0, ...at.map((e) => Math.min(this.expectedDamage(x, e), this.hitPoints(e)))), 0);
    const taken = volley(theirs, mine) / myHP;
    const dealt = volley(mine, theirs) / theirHP;
    this.pullOut[side] = taken > RETREAT.volleyRatio * dealt;
  }

  /** Hit points the AI weighs: armor, structure, internal systems and shields; an armed planet's installations count three times. */
  hitPoints(u: Unit): number {
    if (u.kind === "planet") return hasWeapons(u) ? u.structure * RETREAT.planetHpMult : 0;
    const systems = this.systems(u).reduce((n, x) => n + x.hp, 0);
    const shields = this.shieldWorks(u) ? u.shields.reduce((n, x) => n + x, 0) : 0;
    return u.armor + u.structure + systems + shields;
  }

  /**
   * Expected damage of one volley from a unit at an enemy, as the AI rates it
   * (likely: the original's rating; range is left out here, so the rating does
   * not swing as the fleets close in).
   */
  expectedDamage(u: Unit, t: Unit): number {
    let total = 0;
    const shield = this.shieldWorks(t) ? t.shieldClass : t.kind === "planet" ? t.planetShield : 0;
    for (const m of u.mounts) {
      if (m.count <= 0 || m.shots <= 0) continue;
      const w = m.def;
      if (w.kind === "beam") {
        let diff = this.attackOf(u, t) - this.defenseOf(t);
        if (m.traits.has("continuous") || m.mods.has("continuous")) diff += MOD_EFFECTS.continuousToHit;
        if (m.mods.has("pointDefense")) diff += MOD_EFFECTS.pointDefenseToHit;
        if (m.mods.has("autoFire")) diff += MOD_EFFECTS.autoFireToHit;
        const p = m.traits.has("alwaysHits") ? 1 : Math.min(0.95, Math.max(0.05, (DIE - BEAM_HIT.threshold + diff + 1) / DIE));
        let pct = 100;
        if (m.mods.has("heavyMount")) pct += MOD_EFFECTS.heavyMountDamagePct;
        if (m.mods.has("pointDefense")) pct += MOD_EFFECTS.pointDefenseDamagePct;
        if (u.fx.beamDamagePct) pct += u.fx.beamDamagePct;
        pct += this.officers[u.side]!.damagePct;
        let dmg = ((w.damageMin + w.damageMax) / 2) * pct / 100;
        if (t.kind === "planet") dmg *= PLANET_BEAM_DAMAGE;
        const pierce = m.traits.has("shieldPiercing") || m.mods.has("shieldPiercing");
        dmg = Math.max(0, dmg - (pierce ? 0 : shield));
        total += dmg * p * m.count * (m.mods.has("autoFire") ? MOD_EFFECTS.autoFireShots : 1);
      } else if (w.kind === "missile" || w.kind === "torpedo") {
        let jam = Math.max(0, this.missileEvasionOf(t) - u.scannerEccm);
        if (m.mods.has("eccm")) jam /= 2;
        const dmg = Math.max(0, w.damageMax * (t.kind === "planet" && w.kind === "torpedo" ? PLANET_TORPEDO_DAMAGE : 1) - shield);
        total += dmg * m.count * Math.max(0, 1 - jam / DIE) * (m.mods.has("mirv") ? MOD_EFFECTS.mirvWarheads : 1) / (w.reload ?? 1);
      } else {
        total += mountFirepower({ weaponId: w.id, count: m.count, mods: [...m.mods] }, this.attackOf(u, t), u.fx);
      }
    }
    return total;
  }

  sideStrength(units: Unit[]): number {
    return units.reduce((sum, u) => {
      if (!hasWeapons(u)) return sum;
      const max = u.maxArmor + u.maxStructure;
      return sum + u.strength * (max > 0 ? (u.armor + u.structure) / max : 1);
    }, 0);
  }
}

/**
 * Planet bombardment power of an attack-stance fleet against a colony whose
 * defenses are down, in one turn: as in the original, every weapon of the
 * fleet fires at the planet for BOMBARD_ROUNDS combat turns and the planet
 * does not answer. Beams roll to hit (point blank, against the planet's
 * beam defense) and are halved; missiles and bombs use up to that many shots,
 * torpedoes fire as they reload; every hit loses the planet's shield. The
 * total is the expected damage (the original rolls each shot). Bomber
 * squadrons are counted for two sorties (an estimate). Spores are counted
 * once, as before.
 */
export function bombardment(state: GameState, fleet: Fleet, shield = 0): { bombs: number; spores: number } {
  const player = state.players[fleet.ownerId]!;
  let bombs = 0;
  let spores = 0;
  const bestBomb = craftLoadout(player).bomb;
  const rounds = BOMBARD_ROUNDS;
  const planetDefense = IMMOBILE_DEFENSE + CREW.defense[DEFENSE_CREW_LEVEL]!;
  for (const s of fleet.ships) {
    const d = findDesign(player, s.designId);
    if (!d) continue;
    const stats = designStats(player, d);
    const crew = d.fixed ? 0 : crewLevel(player.kind === "raiders" ? Math.max(s.xp ?? 0, CREW.raiderXp) : s.xp ?? 0, player);
    for (const m of stats.weapons) {
      const w = ALL_WEAPONS[m.weaponId];
      if (!w) continue;
      const mods = new Set(m.mods ?? []);
      const n = m.count * s.count;
      if (w.kind === "beam") {
        if (w.traits?.includes("systemsOnly")) continue;
        let diff = stats.attack + CREW.attack[crew]! - planetDefense;
        if (w.traits?.includes("continuous") || mods.has("continuous")) diff += MOD_EFFECTS.continuousToHit;
        if (mods.has("pointDefense")) diff += MOD_EFFECTS.pointDefenseToHit;
        if (mods.has("autoFire")) diff += MOD_EFFECTS.autoFireToHit;
        const modifiable = Math.max(0, BEAM_HIT.unmodifiedAbove - Math.max(1, BEAM_HIT.threshold - diff) + 1);
        const p = w.traits?.includes("alwaysHits") ? 1 : Math.min(1, (DIE - BEAM_HIT.unmodifiedAbove + modifiable) / DIE);
        let pct = 100;
        if (mods.has("heavyMount")) pct += MOD_EFFECTS.heavyMountDamagePct;
        if (mods.has("pointDefense")) pct += MOD_EFFECTS.pointDefenseDamagePct;
        let dmg = Math.max(0, ((w.damageMin + w.damageMax) / 2) * pct / 100 * PLANET_BEAM_DAMAGE - shield);
        if (w.traits?.includes("extraStructural")) dmg *= 2;
        const shots = mods.has("autoFire") ? MOD_EFFECTS.autoFireShots : 1;
        bombs += dmg * p * shots * n * rounds;
      } else if (w.kind === "missile") {
        bombs += Math.max(0, w.damageMax - shield) * n * Math.min(rounds, rackShots(w, m));
      } else if (w.kind === "torpedo") {
        bombs += Math.max(0, w.damageMax * PLANET_TORPEDO_DAMAGE - shield) * n * Math.ceil(rounds / (w.reload ?? 1));
      } else if (w.kind === "bomb") {
        bombs += Math.max(0, (w.damageMin + w.damageMax) / 2 - shield) * n * Math.min(rounds, rackShots(w, m));
      } else if (w.kind === "spores") {
        spores += w.damageMax * n;
      } else if (w.effect === "bombers" && bestBomb) {
        // Bomber squadrons carry one bomb per craft.
        bombs += Math.max(0, (bestBomb.damageMin + bestBomb.damageMax) / 2 - shield) * SQUADRON_SIZE * n * 2;
      }
    }
  }
  return { bombs, spores };
}

/** Best beam an empire would mount on its ground batteries, for display. */
export function groundBatteryBeam(player: Player): WeaponDef {
  return bestBeam(player);
}

