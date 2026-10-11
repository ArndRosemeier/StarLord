import { BUILDINGS_BY_ID, FIGHTER_GARRISON } from "./data/buildings.js";
import { fighterGarrison } from "./economy.js";
import {
  ARCS, HULLS_BY_ID, MOD_EFFECTS, SCANNER_ECCM, SPECIALS_BY_ID, STATION_HULLS, UNHITTABLE_SPECIALS, WEAPONS,
  hullIndex, type FiringArc, type HullDef, type StationHull, type WeaponDef, type WeaponModId, type WeaponTrait,
} from "./data/components.js";
import {
  ANTI_MISSILE, ARTEMIS, BEAM_HIT, BLACK_HOLE_TURNS, CRAFT, CRAFT_ARMOR_STEP, CRAFT_SPEED_PER_DRIVE, CREW,
  DEFENSE_PER_SPEED, DEPLOY_COLUMNS, DIE, FIELD_HEIGHT, FIELD_WIDTH, IMMOBILE_DEFENSE, MAX_BAND, MAX_ROUNDS,
  MISSILE_DEFENSE_BONUS, MISSILE_DEFENSE_PER_SPEED, MISSILE_HP, MISSILE_SPEED, PLANET_BEAM_DAMAGE,
  PLANET_INSTALLATION_ARMOR_STEP, PLANET_INSTALLATION_HP, PLANET_TORPEDO_DAMAGE, PLASMA_WEB_DECAY, RANGE_BANDS,
  SHIELD_FACINGS, SHIELD_REGEN, SQUADRON_SIZE, STATION_FLEET_BONUS, STATION_TURN_DEG, TORPEDO_DISSIPATION, TORPEDO_HP,
  TURN_COST_PER_STEP, REPAIR,
} from "./data/combat.js";
import { ARMORS, DRIVES } from "./data/components.js";
import { crewLevel } from "./crew.js";
import {
  ALL_WEAPONS, bestArmor, bestBeam, bestComputer, bestDrive, bestShield, designStats, findDesign, groundBatteryWeapons,
  missileBaseWeapons, noEffects, rackShots, stationWeapons, strengthOf, weaponHP, weaponUnitCost,
  type MergedEffects,
} from "./designs.js";
import { empireBonus, knows } from "./empire.js";
import { getRace } from "./data/races.js";
import { designStyle } from "./data/shipStyles.js";
import {
  raceCombatRepair, raceCombatSpeedBonus, raceGroundBonus, shipAttackPickBonus, shipDefensePickBonus,
} from "./raceEffects.js";
import type { Rng } from "./rng.js";
import type {
  Colony, CombatReport, CombatRoundEvent, CombatShipSnapshot, Fleet, GameState, LeaderSkills, Player, PlayerId,
  ShipStack, WeaponMount,
} from "./types.js";

export { FIELD_HEIGHT, FIELD_WIDTH, MAX_ROUNDS, MISSILE_SPEED, PLANET_INSTALLATION_HP };

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
}

export interface CapturedShip {
  /** Player who boarded and took the ship, the fleet it joins, and where it came from. */
  ownerId: PlayerId;
  fleetId: string;
  fromOwner: PlayerId;
  designId: string;
}

export interface CombatOutcome {
  report: CombatReport;
  /** Ships left in each fleet (destroyed and captured ones removed). */
  survivors: Map<string, ShipStack[]>;
  retreated: Set<PlayerId>;
  /** Fleets whose surviving ships all fled; they leave the system. */
  fled: Set<string>;
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
  /** Hull size for battle experience: frigate 0 ... doom star 5, stations 6 to 8. */
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
  captured: { by: Unit } | null;
  // Per-battle state.
  firedThisRound: boolean;
  firedLastRound: boolean;
  phasingLeft: number;
  hyperXRest: boolean;
  fastRackRest: boolean;
  tractor: number;
  stasisUntil: number;
  blackHole: { by: Unit; turns: number } | null;
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

function captainSkills(state: GameState, fleetId: string): LeaderSkills {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "captain" && l.ownerId !== null && l.assignedTo === fleetId) return l.skills;
  }
  return {};
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

function craftLoadout(player: Player): { beam: WeaponDef; bomb: WeaponDef | null } {
  const beams = WEAPONS.filter((w) => w.kind === "beam" && w.mods.includes("pointDefense") && knows(player, w.requires));
  const beam = beams.reduce((b, w) => ((w.damageMin + w.damageMax) > (b.damageMin + b.damageMax) ? w : b), beams[0] ?? WEAPONS.find((w) => w.id === "laserCannon")!);
  const bomb = WEAPONS.filter((w) => w.kind === "bomb" && knows(player, w.requires)).at(-1) ?? null;
  return { beam, bomb };
}

function makeMounts(player: Player, weapons: WeaponMount[], unlimited: boolean, allRound: boolean, installation?: number): Mount[] {
  const out: Mount[] = [];
  for (const m of weapons) {
    const def = ALL_WEAPONS[m.weaponId];
    if (!def || def.kind === "bomb" || def.kind === "spores") continue;
    const space = def.requires === "never" ? 10 : weaponUnitCost(player, m).space;
    out.push({
      def,
      mods: new Set(m.mods ?? []),
      traits: new Set(def.traits ?? []),
      arc: allRound || def.kind !== "beam" ? "full" : (m.arc ?? "forward"),
      count: m.count,
      hpEach: weaponHP(space),
      wound: 0,
      shots: unlimited ? Infinity : rackShots(def, m),
      cooldown: 0,
      out: false,
      rearm: 0,
      installation,
      firedThisRound: false,
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
    marines: 0, immobile: false, noArmorPierce: false, alive: true, retreated: false, captured: null,
    firedThisRound: false, firedLastRound: true, phasingLeft: 0, hyperXRest: false, fastRackRest: false, tractor: 0,
    stasisUntil: -1, blackHole: null, web: null, moved: false, craftBeam: craft.beam, craftBomb: craft.bomb,
    scannerEccm: scannerEccm(player),
  };
}

function shipUnits(state: GameState, side: CombatSide, sideIdx: 0 | 1): Unit[] {
  const units: Unit[] = [];
  const player = state.players[side.ownerId]!;
  let n = 0;
  for (const f of side.fleets) {
    const cap = captainSkills(state, f.id);
    const cyber = raceCombatRepair(getRace(player.raceId));
    for (const stack of f.ships) {
      const design = findDesign(player, stack.designId);
      if (!design) continue;
      const s = designStats(player, design);
      const monster = !!design.fixed;
      // A fixed design that never moves (the raiders' citadel) fights like an orbital station.
      const fortress = !!design.fixed?.immobile;
      // Damaged ships come last in a stack; they start with the armor, then structure, they lost.
      const intact = stack.count - (stack.damage?.length ?? 0);
      for (let i = 0; i < stack.count; i++) {
        const row = n++;
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
          x: DEPLOY_COLUMNS[sideIdx] + (sideIdx === 0 ? -1 : 1) * (row % 3) * 1.5,
          y: FIELD_HEIGHT / 2 + (((Math.floor(row / 3) % 9) + 1) >> 1) * 3 * ((Math.floor(row / 3) % 2) * 2 - 1),
          armor: Math.max(0, s.armor - lost), maxArmor: s.armor,
          structure: Math.max(1, s.structure - Math.max(0, lost - s.armor)), maxStructure: s.structure,
          shieldClass: s.shield, shieldMax: s.shieldStrength, shields: Array(SHIELD_FACINGS).fill(s.shieldStrength),
          hardShields: s.effects.hardShields > 0,
          mounts,
          attackBase: s.attack - (design.computer && !monster ? computerBonus(design.computer) : 0) + (cap.attack ?? 0),
          computerAttack: design.computer && !monster ? computerBonus(design.computer) : 0,
          defenseBonus: monster ? 0 : s.defense - s.combatSpeed * DEFENSE_PER_SPEED + (cap.defense ?? 0),
          fixedDefense: monster ? s.defense : null,
          speed: s.combatSpeed,
          missileEvasion: s.missileEvasion,
          // Captains' Engineer and Security skills; cybernetic races patch their ships up mid-battle.
          fx: monster ? s.effects : {
            ...s.effects,
            shieldRegen: s.effects.shieldRegen + (cap.shieldRecharge ?? 0) / 100,
            boardingDefense: s.effects.boardingDefense + (cap.boardingDefense ?? 0),
            repair: Math.max(s.effects.repair, cyber.hull),
            repairSystems: Math.max(s.effects.repairSystems, cyber.systems),
          },
          marines: s.marines,
          immobile: fortress,
          noArmorPierce: design.specials.includes("heavyArmor") || design.armor === "xentroniumArmor",
          phasingLeft: s.effects.phasing,
          strength: s.strength,
          crew: design.fixed?.crew ?? (monster ? 0 : crewLevel(player.kind === "raiders" ? Math.max(stack.xp ?? 0, CREW.raiderXp) : stack.xp ?? 0, player)),
          hullRank: monster ? hullIndex(design.hull) : fortress ? 6 + STATION_HULLS.findIndex((h) => h.id === "starFortress") : hullIndex(design.hull),
        };
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

function stationUnit(player: Player, colony: Colony, hull: HullDef<StationHull>, sideIdx: 0 | 1, planetX: number): Unit {
  const armor = bestArmor(player);
  const shield = bestShield(player);
  const computer = bestComputer(player);
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  const weapons = stationWeapons(player, hull);
  const shieldMax = shield ? shield.absorb * 5 * hull.sizeClass : 0;
  const attackBase = shipAttackPickBonus(race) + bonus.shipAttack;
  const u: Unit = {
    ...baseUnit(player, sideIdx),
    key: `station:${colony.id}`,
    colonyId: colony.id,
    designId: hull.id,
    name: `${colony.name} ${hull.name}`,
    kind: "station",
    hullId: hull.id,
    sizeClass: hull.sizeClass,
    x: planetX + (sideIdx === 0 ? 3 : -3),
    y: FIELD_HEIGHT / 2,
    hullRank: 6 + STATION_HULLS.findIndex((h) => h.id === hull.id),
    armor: hull.armor * armor.mult, maxArmor: hull.armor * armor.mult,
    structure: hull.structure * armor.mult, maxStructure: hull.structure * armor.mult,
    shieldClass: shield?.absorb ?? 0, shieldMax, shields: Array(SHIELD_FACINGS).fill(shieldMax),
    mounts: makeMounts(player, weapons, true, true),
    attackBase,
    computerAttack: computer?.attack ?? 0,
    defenseBonus: 0,
    fixedDefense: (hull.fixedDefense ?? 0) + shipDefensePickBonus(race) + bonus.shipDefense,
    speed: 0,
    marines: hull.marines,
    immobile: true,
    noArmorPierce: armor.id === "xentroniumArmor",
    strength: 0,
  };
  if (computer) u.computer = { id: "computer", hp: hull.computerHP, max: hull.computerHP };
  if (shield) u.shieldGen = { id: "shield", hp: hull.shieldGenHP, max: hull.shieldGenHP };
  u.strength = strengthOf({
    weapons, attack: attackBase + (computer?.attack ?? 0), defense: u.fixedDefense!, hits: u.maxArmor + u.maxStructure,
    shield: u.shieldClass, shieldStrength: shieldMax, missileEvasion: 0,
  });
  return u;
}

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
      const m = makeMounts(player, [{ weaponId: bay.id, count: 1 }], true, true, id)[0]!;
      m.garrison = g.count;
      mounts.push(m);
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
  const installationHP = PLANET_INSTALLATION_HP + armorClass(player) * PLANET_INSTALLATION_ARMOR_STEP;
  const hp = installationHP * installations.length;
  const attackBase = shipAttackPickBonus(race) + bonus.shipAttack;
  const u: Unit = {
    ...baseUnit(player, sideIdx),
    key: `planet:${colony.id}`,
    colonyId: colony.id,
    designId: "planet",
    name: colony.name,
    kind: "planet",
    sizeClass: 10,
    x: planetColumn(sideIdx),
    y: FIELD_HEIGHT / 2,
    armor: 0, maxArmor: 0, structure: hp, maxStructure: hp,
    planetShield: d.shield,
    installations,
    installationHP,
    mounts,
    attackBase,
    computerAttack: computer?.attack ?? 0,
    defenseBonus: 0,
    fixedDefense: IMMOBILE_DEFENSE,
    speed: 0,
    immobile: true,
    strength: 0,
  };
  u.strength = strengthOf({
    weapons,
    attack: attackBase + (computer?.attack ?? 0), defense: 0, hits: Math.max(1, hp), shield: d.shield, shieldStrength: 0, missileEvasion: 0,
  });
  return u;
}

/** Rough combat value of a colony's station and ground defenses, for planning attacks. */
export function colonyDefenseStrength(state: GameState, colony: Colony): number {
  const player = state.players[colony.ownerId];
  if (!player) return 0;
  const d = planetDefense(colony);
  let total = 0;
  if (d.station) total += stationUnit(player, colony, HULLS_BY_ID[d.station], 1, planetColumn(1)).strength;
  if (d.installations.length > 0) total += planetUnit(player, colony, d, 1).strength;
  return total;
}

/** The defending planet sits behind its side's fleet. */
const planetColumn = (side: 0 | 1) => DEPLOY_COLUMNS[side] + (side === 0 ? -6 : 6);

const active = (u: Unit) => u.alive && !u.retreated;
const hasWeapons = (u: Unit) => u.mounts.some((m) => m.count > 0 && m.shots > 0 && m.def.effect !== "antiMissile");
const armed = (u: Unit) => active(u) && hasWeapons(u);

export function resolveCombat(state: GameState, rng: Rng, starId: string, a: CombatSide, b: CombatSide, reportId: string): CombatOutcome {
  const battle = new Battle(state, rng, a, b);
  // Ionized nebula gas stops deflector shields unless they are hard shields.
  battle.nebula = !!state.galaxy.stars.find((s) => s.id === starId)?.nebula;
  return battle.run(starId, reportId);
}

class Battle {
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  log: CombatRoundEvent[] = [];
  round = 0;
  sideBonus: { attack: number; defense: number }[] = [{ attack: 0, defense: 0 }, { attack: 0, defense: 0 }];
  /** Scout labs give the whole fleet an attack bonus against monsters. */
  monsterBonus = [0, 0];
  fleetEvasion = [0, 0];
  /** The battle is inside a nebula: only hard shields work. */
  nebula = false;
  readonly sides: readonly [CombatSide, CombatSide];
  /** The side that came to fight: the one without a colony here, else the one on attack stance. */
  readonly attacker: 0 | 1;

  constructor(readonly state: GameState, readonly rng: Rng, a: CombatSide, b: CombatSide) {
    this.sides = [a, b];
    const attacking = (x: CombatSide) => x.fleets.some((f) => f.stance === "attack") || state.players[x.ownerId]?.kind === "raiders";
    this.attacker = a.colony && !b.colony ? 1 : b.colony && !a.colony ? 0 : attacking(b) && !attacking(a) ? 1 : 0;
    this.units = [...shipUnits(state, a, 0), ...shipUnits(state, b, 1)];
    for (const [i, s] of this.sides.entries()) {
      if (!s.colony) continue;
      const player = state.players[s.ownerId]!;
      const d = planetDefense(s.colony);
      const planetX = planetColumn(i as 0 | 1);
      if (d.installations.length > 0 || d.mines) {
        const p = planetUnit(player, s.colony, d, i as 0 | 1);
        // A planet with only mines is not a target and does not hold the field.
        if (d.installations.length === 0) p.alive = false;
        this.units.push(p);
      }
      if (d.station) {
        this.units.push(stationUnit(player, s.colony, HULLS_BY_ID[d.station], i as 0 | 1, planetX));
        const fb = STATION_FLEET_BONUS[d.station];
        if (fb) this.sideBonus[i] = { ...fb };
      }
    }
    for (const side of [0, 1] as const) {
      const mine = this.units.filter((u) => u.side === side);
      this.monsterBonus[side] = Math.max(0, ...mine.filter((u) => u.fx.scoutLab).map((u) => u.fx.monsterAttackPerSize * u.sizeClass))
        // Captains with Galactic Lore know how monsters fight.
        + Math.max(0, ...this.sides[side].fleets.map((f) => captainSkills(state, f.id).monsterBonus ?? 0));
    }
  }

  run(starId: string, reportId: string): CombatOutcome {
    const { units, rng, state, sides } = this;
    const snapshots: CombatShipSnapshot[] = units.map((u) => ({
      key: u.key, ownerId: u.ownerId, designId: u.designId, name: u.name, maxHits: u.maxArmor + u.maxStructure,
      x: u.x, y: u.y, isPlanet: u.kind === "planet", kind: u.kind, hullId: u.hullId, sizeClass: u.sizeClass,
      ...(u.shipStyle ? { shipStyle: u.shipStyle } : {}),
      maxArmor: u.maxArmor, maxStructure: u.maxStructure, maxShield: u.shieldMax,
      ...(u.kind === "ship" && u.armor + u.structure < u.maxArmor + u.maxStructure ? { armor: u.armor, structure: u.structure } : {}),
    }));
    const rounds: CombatRoundEvent[][] = [];
    const retreated = new Set<PlayerId>();
    // The attacker acts first every round; raiders defending their home strike first instead.
    const att = this.attacker;
    const def = (1 - att) as 0 | 1;
    const order: (0 | 1)[] = this.state.players[sides[def].ownerId]?.kind === "raiders" ? [def, att] : [att, def];
    // A side stands while it has any ship or station left, or a planet with working installations.
    const standing = (idx: 0 | 1) => units.some((x) => x.side === idx && active(x) && (x.kind !== "planet" || x.installations.some((i) => i.alive)));
    let idle = 0;

    for (this.round = 0; this.round < MAX_ROUNDS; this.round++) {
      this.log = [];
      rounds.push(this.log);
      if (this.round === 0) this.mines();
      this.startRound();
      let acted = false;
      if (state.settings.shipInitiative) {
        // Ship initiative: everyone in one list, fastest and best-aimed first (combat speed + beam attack / 10).
        const initiative = (u: Unit) => this.currentSpeed(u) + this.attackOf(u, u) / 10;
        const all = units.filter((u) => active(u)).sort((a, b) => initiative(b) - initiative(a));
        for (const u of all) if (active(u) && this.act(u)) acted = true;
        for (const side of order) if (this.moveProjectiles(side)) acted = true;
      } else {
        for (const side of order) {
          // Units act in their fixed order.
          const mine = units.filter((u) => u.side === side && active(u));
          for (const u of mine) if (this.act(u)) acted = true;
          if (this.moveProjectiles(side)) acted = true;
        }
      }
      // Time Warp Facilitators give their ships an extra turn once both sides have moved.
      for (const side of order) {
        for (const u of units) if (u.side === side && u.fx.extraTurn && active(u) && this.act(u)) acted = true;
      }
      this.retreats(retreated);

      if (!standing(0) || !standing(1)) break;
      // When nobody can shoot or nothing has happened for two turns, nothing will change: time runs out.
      const armedA = units.some((x) => x.side === 0 && armed(x));
      const armedB = units.some((x) => x.side === 1 && armed(x));
      if (!armedA && !armedB) break;
      idle = acted || this.projectiles.length > 0 ? 0 : idle + 1;
      if (idle >= 2) break;
    }

    // The side left standing wins; if both stand when time runs out, the defender holds the field.
    const winnerIdx: 0 | 1 | null = standing(def) ? def : standing(att) ? att : null;

    const captured: CapturedShip[] = [];
    const survivors = new Map<string, ShipStack[]>();
    for (const s of sides) {
      for (const f of s.fleets) {
        // Damage stays on the survivors unless something repairs it all after the battle.
        const repairs = fullRepairAfterBattle(state, s.ownerId, f.id);
        const counts = new Map<string, { count: number; damage: number[] }>();
        for (const u of units) {
          if (u.fleetId !== f.id || !u.alive) continue;
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
      }
    }
    // The winner's crews learn from the enemy ships they destroyed or took: half the sum of (hull size + 1), at least 1.
    let crewXp: CombatOutcome["crewXp"] = null;
    if (winnerIdx !== null) {
      const sizes = units
        .filter((u) => u.side !== winnerIdx && u.kind !== "planet" && (!u.alive || u.captured))
        .reduce((n, u) => n + u.hullRank + 1, 0);
      crewXp = { ownerId: sides[winnerIdx].ownerId, amount: Math.max(1, Math.floor(sizes / 2)) };
    }
    for (const u of units) {
      if (!u.captured) continue;
      const by = u.captured.by;
      // The prize is only kept if one of the captor's ships is still here to crew it home.
      const home = units.find((x) => x.side === by.side && x.alive && !x.retreated && x.fleetId);
      if (home?.fleetId && u.fleetId) captured.push({ ownerId: by.ownerId, fleetId: home.fleetId, fromOwner: u.ownerId, designId: u.designId });
    }
    const losses: Record<string, number> = {};
    for (const u of units) {
      if (!u.alive && (u.kind === "ship" || u.kind === "monster" || (u.kind === "station" && u.fleetId))) losses[u.ownerId] = (losses[u.ownerId] ?? 0) + 1;
    }

    const fled = new Set<string>();
    for (const s of sides) {
      for (const f of s.fleets) {
        const mine = units.filter((u) => u.fleetId === f.id && u.alive);
        if (mine.length > 0 && mine.every((u) => u.retreated)) fled.add(f.id);
      }
    }

    const planetSilenced = new Map<PlayerId, boolean>();
    const stationsLost = new Set<string>();
    for (const [i, s] of sides.entries()) {
      if (!s.colony) continue;
      const planet = units.find((u) => u.kind === "planet" && u.side === i && u.installations.length > 0);
      const station = units.find((u) => u.kind === "station" && u.side === i);
      if (station && !station.alive) stationsLost.add(s.colony.id);
      const planetDown = !planet || !planet.alive || !hasWeapons(planet);
      const stationDown = !station || !station.alive;
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
      planetSilenced,
      stationsLost,
      captured,
      crewXp,
      attacker: this.attacker,
    };
  }

  // ------------------------------------------------------------ round upkeep

  startRound(): void {
    for (const u of this.units) {
      if (!active(u)) continue;
      u.firedLastRound = u.firedThisRound;
      u.firedThisRound = false;
      u.tractor = 0;
      u.moved = false;
      if (u.phasingLeft > 0) u.phasingLeft--;
      for (const m of u.mounts) {
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
      if (u.fx.repair > 0) {
        const total = u.maxArmor + u.maxStructure;
        let heal = Math.round(total * u.fx.repair);
        const before = u.armor + u.structure;
        const s = Math.min(heal, u.maxStructure - u.structure);
        u.structure += s;
        heal -= s;
        u.armor = Math.min(u.maxArmor, u.armor + heal);
        for (const sys of this.systems(u)) if (sys.hp > 0) sys.hp = Math.min(sys.max, sys.hp + Math.max(1, Math.round(sys.max * u.fx.repairSystems)));
        const healed = u.armor + u.structure - before;
        if (healed > 0) this.log.push({ kind: "repair", ship: u.key, damage: healed });
      }
      if (u.web) {
        const web = u.web;
        this.applyHit(web.by, u, web.damage, {}, "plasmaWeb");
        web.damage -= PLASMA_WEB_DECAY;
        if (web.damage <= 0) u.web = null;
      }
      if (u.blackHole) {
        if (!active(u.blackHole.by)) u.blackHole = null;
        else if (++u.blackHole.turns > BLACK_HOLE_TURNS) {
          this.log.push({ kind: "fire", ship: u.blackHole.by.key, target: u.key, weapon: "blackHoleGenerator", hit: true, damage: u.armor + u.structure, armorDamage: u.armor, structureDamage: u.structure });
          u.armor = 0;
          u.structure = 0;
          this.destroy(u);
        }
      }
    }
    for (const side of [0, 1]) {
      this.fleetEvasion[side] = Math.max(0, ...this.units.filter((u) => u.side === side && active(u)).map((u) => u.fx.fleetMissileEvasion));
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
    if (u.immobile || this.round <= u.stasisUntil || u.blackHole) return 0;
    let speed = u.speed;
    if (u.drive) {
      if (u.drive.hp <= 0) return 0;
      if (u.drive.hp < u.drive.max / 2) speed *= u.drive.hp / (u.drive.max / 2);
    }
    if (u.tractor > 0) speed *= Math.max(0, 1 - u.tractor / u.sizeClass);
    return Math.max(0, Math.floor(speed));
  }

  attackOf(u: Unit, target: Unit): number {
    let ba = u.attackBase + this.sideBonus[u.side]!.attack + CREW.attack[u.crew]!;
    if (u.computer === null || u.computer.hp > 0) ba += u.computerAttack;
    if (target.kind === "monster" || target.player.kind === "raiders") ba += this.monsterBonus[u.side]!;
    return ba;
  }

  defenseOf(u: Unit): number {
    if (u.fixedDefense !== null) return u.fixedDefense + (u.immobile ? 0 : this.sideBonus[u.side]!.defense);
    const speed = this.currentSpeed(u);
    let bd = speed > 0 ? speed * DEFENSE_PER_SPEED : IMMOBILE_DEFENSE;
    bd += u.defenseBonus + this.sideBonus[u.side]!.defense + CREW.defense[u.crew]!;
    if (this.cloaked(u)) bd += u.fx.cloakDefense;
    return bd;
  }

  cloaked(u: Unit): boolean {
    return u.fx.cloakDefense > 0 && !u.firedLastRound && !u.firedThisRound && this.specialWorks(u, u.fx.phasing > 0 ? "phasingCloak" : "cloakingDevice");
  }

  /** Phased-out ships cannot be seen or shot. */
  untouchable(u: Unit): boolean {
    return u.phasingLeft > 0 && !u.firedThisRound && !u.firedLastRound || this.round <= u.stasisUntil;
  }

  specialWorks(u: Unit, id: string): boolean {
    const s = u.specials.find((x) => x.id === id);
    return !s || s.hp > 0;
  }

  missileEvasionOf(u: Unit): number {
    // Trained crews dodge missiles too, with half their beam defense bonus.
    return Math.max(u.missileEvasion, this.fleetEvasion[u.side]!) + Math.floor(CREW.defense[u.crew]! / 2);
  }

  // ------------------------------------------------------------ geometry

  dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  radius(u: Unit): number {
    return u.kind === "planet" ? 1.5 : 0.4 + 0.1 * Math.min(u.sizeClass, 10);
  }

  /** Squares between the edges of two units, measured as the original does: the longer leg plus half the shorter. */
  edge(a: Unit, b: Unit): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.max(0, Math.max(dx, dy) + Math.min(dx, dy) / 2 - this.radius(a) - this.radius(b));
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

  /** Turns, moves and fires. Returns whether the unit did anything. */
  act(u: Unit): boolean {
    if (!active(u) || this.round <= u.stasisUntil) return false;

    // Unarmed ships try to slip away.
    if (u.kind === "ship" && !hasWeapons(u)) {
      if (!this.retreatBlocked(u) && this.rng.chance(0.5)) {
        u.retreated = true;
        this.log.push({ kind: "retreat", ship: u.key });
        return true;
      }
      return false;
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
    if (this.transport(u, target)) did = true;
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
    let mp = this.currentSpeed(u);
    if (mp <= 0) return false;
    const want = this.preferredRange(u);
    const gap = this.edge(u, target) - want;
    const goal = Math.atan2(target.y - u.y, target.x - u.x);
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

  /** Beams, launchers and special weapons fire at the target, then at whatever else is in reach. */
  fire(u: Unit, primary: Unit): boolean {
    let did = false;
    const incoming = this.projectiles.some((p) => p.target === u && p.owner.side !== u.side);
    const hyper = u.fx.hyperX && this.specialWorks(u, "hyperXCapacitors");
    let beamFired = false;
    u.mounts.forEach((m, mi) => {
      if (m.count <= 0 || m.shots <= 0 || m.cooldown > 0 || m.firedThisRound) return;
      const kind = m.def.kind;
      if (kind === "beam") {
        // Point-defense mounts hold their fire for incoming missiles and fighters.
        if (m.mods.has("pointDefense") && incoming) return;
        if (u.hyperXRest && hyper) return;
        const volleys = hyper ? 2 : 1;
        for (let v = 0; v < volleys; v++) if (this.fireBeams(u, m, primary)) did = beamFired = true;
        m.firedThisRound = true;
      } else if (kind === "missile" || kind === "torpedo") {
        if (!active(primary)) return;
        if (u.fastRackRest && kind === "missile") return;
        const volleys = kind === "missile" && u.fx.fastRacks ? 2 : 1;
        for (let v = 0; v < volleys && m.shots > 0; v++) {
          if (this.launch(u, mi, m, primary)) did = true;
        }
        if (kind === "missile" && u.fx.fastRacks) u.fastRackRest = !u.fastRackRest;
        m.firedThisRound = true;
      } else if (kind === "bay") {
        if (m.out || m.rearm > 0) return;
        // Craft go after the next enemy when the first target is already gone.
        const target = active(primary) ? primary : this.chooseTarget(u);
        if (target && this.launchCraft(u, mi, m, target)) did = true;
      } else if (kind === "special") {
        if (this.fireSpecial(u, m, primary)) did = true;
      }
    });
    if (hyper) u.hyperXRest = beamFired ? !u.hyperXRest : false;
    if (did) {
      u.firedThisRound = true;
      u.phasingLeft = Math.min(u.phasingLeft, 0);
    }
    return did;
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
      if (!active(target) || this.untouchable(target) || !this.inArc(u, m, target) || !this.beamBands(u, m, target)) {
        target = this.targets(u)
          .filter((e) => this.inArc(u, m, e) && this.beamBands(u, m, e))
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
      owner: u, mount: mi, weapon: m.def, mods: new Set(), target, x: u.x, y: u.y, speed, defense: speed * MISSILE_DEFENSE_PER_SPEED,
      count: m.garrison ?? SQUADRON_SIZE * m.count, hp, frontDamage: 0, damage: 0, travelled: 0, craft,
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

  /** Point defense, anti-missile rockets and lightning fields thin out incoming missiles and craft. */
  interceptions(p: Projectile): void {
    const t = p.target;
    const torpedo = p.weapon.kind === "torpedo";
    if (!torpedo) {
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
          const chance = Math.max(0, ANTI_MISSILE.base - ANTI_MISSILE.perSquare * this.radius(t));
          for (let i = 0; i < m.count && p.count > 0 && m.shots > 0; i++) {
            m.shots--;
            if (this.rng.chance(chance)) p.count--;
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
    if (p.weapon.traits?.includes("dissipates") && !p.mods.has("noRangeDissipation")) damage = Math.max(0, damage - TORPEDO_DISSIPATION * Math.max(0, Math.floor(p.travelled) - 1));
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
      this.board(u, t, Math.min(u.marines, p.count), "assaultShuttles");
      return;
    }
    const ev: CombatRoundEvent = { kind: "fire", ship: u.key, target: t.key, weapon: p.weapon.id, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    // Craft come in on the weakest shield.
    const facing = t.shields.indexOf(Math.min(...t.shields));
    const beamShots = p.craft === "fighters" ? CRAFT.fighters.shots : p.craft === "heavyFighters" ? CRAFT.heavyFighters.shots : 0;
    const bombs = p.craft === "bombers" ? CRAFT.bombers.shots : p.craft === "heavyFighters" ? CRAFT.heavyFighters.shots : 0;
    for (let c = 0; c < p.count && t.alive; c++) {
      for (let s = 0; s < beamShots && t.alive; s++) {
        const r = this.rng.int(1, DIE);
        const roll = r <= BEAM_HIT.unmodifiedAbove ? r + this.attackOf(u, t) + MOD_EFFECTS.pointDefenseToHit - this.defenseOf(t) : DIE;
        if (roll < BEAM_HIT.threshold) continue;
        const dmg = Math.max(1, Math.round(this.rng.int(u.craftBeam.damageMin, u.craftBeam.damageMax) * (100 + MOD_EFFECTS.pointDefenseDamagePct) / 100));
        this.tally(ev, this.hit(u, t, dmg, { facing, shieldPiercing: u.craftBeam.traits?.includes("shieldPiercing") }));
      }
      for (let s = 0; s < bombs && t.alive && u.craftBomb; s++) {
        this.tally(ev, this.hit(u, t, this.rng.int(u.craftBomb.damageMin, u.craftBomb.damageMax), { facing }));
      }
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
        if (!inReach(primary)) return false;
        const e = ev(primary);
        for (let i = 0; i < m.count && primary.alive; i++) this.tally(e, this.hit(u, primary, roll(primary), { ignoreShields: true, bypassArmor: true }));
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
        const near = this.units.filter((t) => t.side !== u.side && inReach(t));
        if (near.length === 0) return false;
        for (const t of near) {
          const e = ev(t);
          for (let i = 0; i < m.count && t.alive; i++) {
            this.tally(e, this.hit(u, t, roll(t), { facing: this.facingToward(t, u), ignoreShields: w.effect === "spatialCompressor" }));
          }
          this.log.push(e);
        }
        // Pulsars also wreck missiles and craft around the ship.
        for (const p of [...this.projectiles]) if (p.owner.side !== u.side && this.dist(p, u) <= reach + 1) this.removeProjectile(p);
        return true;
      }
      case "stasis": {
        if (!inReach(primary) || primary.kind === "planet") return false;
        primary.stasisUntil = this.round + 1;
        this.log.push({ ...ev(primary), hit: true });
        return true;
      }
      case "blackHole": {
        if (!inReach(primary) || primary.immobile || primary.blackHole) return false;
        primary.blackHole = { by: u, turns: 0 };
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

  /** Transporters beam marines across once the target's facing shield is down. */
  transport(u: Unit, target: Unit): boolean {
    if (u.fx.transporters <= 0 || u.marines <= 0 || target.kind !== "ship" || !active(target)) return false;
    if (!this.specialWorks(u, "transporters") || target.hardShields || this.edge(u, target) > u.fx.transporters) return false;
    if (this.shieldWorks(target) && target.shields[this.facingToward(target, u)]! > 0) return false;
    if (u.marines <= target.marines) return false;
    this.board(u, target, u.marines, "transporters");
    return true;
  }

  board(u: Unit, t: Unit, marines: number, via: string): void {
    if (t.kind !== "ship" || !active(t) || marines <= 0) return;
    // Race ground combat picks, and Commando captains leading the marines on either side.
    const commando = (x: Unit) => (x.fleetId ? captainSkills(this.state, x.fleetId).groundCombat ?? 0 : 0);
    const atkBonus = raceGroundBonus(getRace(u.player.raceId)) + commando(u) + CREW.boarding[u.crew]!;
    const defBonus = raceGroundBonus(getRace(t.player.raceId)) + commando(t) + t.fx.boardingDefense + CREW.boarding[t.crew]!;
    let attackers = marines;
    u.marines -= marines;
    while (attackers > 0 && t.marines > 0) {
      if (this.rng.int(1, 100) + atkBonus > this.rng.int(1, 100) + defBonus) t.marines--;
      else attackers--;
    }
    const took = attackers > 0;
    this.log.push({ kind: "board", ship: u.key, target: t.key, weapon: via, hit: took, damage: marines - attackers });
    if (!took) return;
    u.marines += attackers;
    // Quantum detonators blow up half the ships boarders take.
    if (t.fx.detonator > 0 && this.rng.chance(0.5)) {
      this.destroy(t);
      return;
    }
    t.captured = { by: u };
    t.alive = false;
    this.log.push({ kind: "destroyed", ship: t.key });
  }

  // ------------------------------------------------------------ damage

  /** Applies a hit and logs it as one shot. */
  applyHit(from: Unit, t: Unit, dmg: number, opts: HitOptions, weapon: string): void {
    const ev: CombatRoundEvent = { kind: "fire", ship: from.key, target: t.key, weapon, hit: false, damage: 0, absorbed: 0, armorDamage: 0, structureDamage: 0 };
    this.tally(ev, this.hit(from, t, dmg, { facing: this.facingToward(t, from), ...opts }));
    this.log.push(ev);
  }

  /**
   * Damage goes through shields (a flat amount per hit, then the facing's
   * pool), then armor, then structure or an internal system.
   */
  hit(from: Unit | null, t: Unit, raw: number, o: HitOptions): Hit {
    const h: Hit = { absorbed: 0, armor: 0, structure: 0 };
    if (!t.alive || raw <= 0) return h;
    let dmg = raw;
    if (t.kind === "planet") return this.hitPlanet(t, dmg, o, h);
    if (t.fx.damageTaken < 1 && this.specialWorks(t, "damperField")) {
      const kept = Math.ceil(dmg * t.fx.damageTaken);
      h.absorbed += dmg - kept;
      dmg = kept;
    }
    if (t.fx.absorber > 0 && this.specialWorks(t, "energyAbsorber")) {
      const taken = Math.floor(dmg * t.fx.absorber);
      h.absorbed += taken;
      dmg -= taken;
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
    if (o.killsMarines && !(t.fx.damageTaken < 1)) t.marines = Math.max(0, t.marines - Math.floor(dmg / 5));
    if (from && from.fx.penetratingMult > 1 && this.specialWorks(from, "structuralAnalyzer")) dmg *= from.fx.penetratingMult;
    if (o.systemsOnly) {
      // Raider ships shrug off system-only weapons entirely.
      if (t.player.kind === "raiders") return h;
      if (t.kind === "monster") {
        dmg = Math.floor(dmg / 4);
        const s = Math.min(t.structure, dmg);
        t.structure -= s;
        h.structure += s;
      } else {
        const sys = this.pickSystem(t, from);
        if (sys) this.damageSystem(t, sys, dmg, h);
      }
      if (t.structure <= 0) this.destroy(t);
      return h;
    }
    const achilles = !!from && from.fx.achilles > 0 && this.specialWorks(from, "achillesTargetingUnit");
    const bypass = o.bypassArmor || o.emissions || achilles || (o.armorPiercing && !t.noArmorPierce);
    if (!bypass && t.armor > 0) {
      const a = Math.min(t.armor, dmg);
      t.armor -= a;
      h.armor += a;
      dmg -= a;
    }
    if (dmg <= 0) return h;
    if (o.emissions && t.drive && t.drive.hp > 0) {
      this.damageSystem(t, t.drive, dmg, h);
      return h;
    }
    const systems = this.systems(t);
    const sysHP = systems.reduce((s, x) => s + x.hp, 0);
    if (sysHP > 0 && this.rng.int(0, 99) < (sysHP * 100) / (sysHP + Math.max(0, t.structure))) {
      const sys = this.pickSystem(t, from, systems);
      if (sys) {
        const used = Math.min(dmg, sys.hp);
        this.damageSystem(t, sys, used, h);
        dmg -= used;
        if (!t.alive) return h;
      }
    }
    if (dmg > 0) {
      if (o.extraStructural) dmg = Math.round(dmg * 1.5);
      const s = Math.min(t.structure, dmg);
      t.structure -= s;
      h.structure += s;
    }
    if (t.structure <= 0) this.destroy(t);
    return h;
  }

  /**
   * Planets have no armor. Damage past the planetary shield gathers in a pool;
   * every full installation's worth knocks out one installation at random.
   */
  hitPlanet(t: Unit, raw: number, o: HitOptions, h: Hit): Hit {
    let dmg = raw;
    if (!o.ignoreShields) {
      const flat = Math.min(dmg, t.planetShield);
      dmg -= flat;
      h.absorbed += flat;
    }
    if (dmg <= 0) return h;
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
    if (up === 0) this.destroy(t);
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
      this.destroy(t);
    } else if (sys.id === "shield") {
      t.shields.fill(0);
    }
  }

  destroy(t: Unit): void {
    if (!t.alive) return;
    t.alive = false;
    t.armor = Math.max(0, t.armor);
    t.structure = 0;
    this.log.push({ kind: "destroyed", ship: t.key });
    for (const p of [...this.projectiles]) if (p.owner === t) this.removeProjectile(p);
  }

  // ------------------------------------------------------------ retreat

  retreatBlocked(u: Unit): boolean {
    return this.units.some((e) => e.side !== u.side && active(e) && e.fx.warpDissipator && this.specialWorks(e, "warpDissipator"));
  }

  /** Each empire's ships fall back once their strength drops below its doctrine. */
  retreats(retreated: Set<PlayerId>): void {
    if (this.round < 1) return;
    for (const idx of [0, 1] as const) {
      const side = this.sides[idx]!;
      const owner = this.state.players[side.ownerId]!;
      if (owner.kind !== "empire") continue;
      const all = this.units.filter((x) => x.side === idx && active(x));
      if (all.length === 0 || all.some((x) => x.immobile)) continue;
      const mine = all.filter((x) => !this.retreatBlocked(x));
      if (mine.length === 0) continue;
      const myStrength = this.sideStrength(all);
      const theirStrength = this.sideStrength(this.units.filter((x) => x.side !== idx && active(x)));
      if (theirStrength > 0 && myStrength < owner.doctrine.retreatBelow * theirStrength) {
        for (const x of mine) {
          x.retreated = true;
          this.log.push({ kind: "retreat", ship: x.key });
        }
        retreated.add(side.ownerId);
      }
    }
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
 * Planet bombardment power of an attack-stance fleet against an undefended colony in one turn.
 * Each bomb loses the planetary shield's worth of damage.
 */
export function bombardment(state: GameState, fleet: Fleet, shield = 0): { bombs: number; spores: number } {
  const player = state.players[fleet.ownerId]!;
  let bombs = 0;
  let spores = 0;
  const bestBomb = WEAPONS.filter((w) => w.kind === "bomb" && knows(player, w.requires)).at(-1);
  for (const s of fleet.ships) {
    const d = findDesign(player, s.designId);
    if (!d) continue;
    const stats = designStats(player, d);
    for (const m of stats.weapons) {
      const w = ALL_WEAPONS[m.weaponId];
      if (!w) continue;
      if (w.kind === "bomb") bombs += Math.max(0, (w.damageMin + w.damageMax) / 2 - shield) * m.count * s.count;
      if (w.kind === "spores") spores += w.damageMax * m.count * s.count;
      // Bomber squadrons carry one bomb per craft.
      if (w.effect === "bombers" && bestBomb) bombs += Math.max(0, (bestBomb.damageMin + bestBomb.damageMax) / 2 - shield) * SQUADRON_SIZE * m.count * s.count;
    }
  }
  return { bombs, spores };
}

/** Best beam an empire would mount on its ground batteries, for display. */
export function groundBatteryBeam(player: Player): WeaponDef {
  return bestBeam(player);
}

