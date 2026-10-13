import {
  COMMANDO_ADMIN_WEIGHT, COMMANDO_INVASION, HEROES, HERO_SKILLS, LEADER_RULES, LEVEL_XP, MAX_LEVEL, MEGAWEALTH_INCOME, SPIRITUAL_IMPROVED, WARLORD_MAX_LEVEL,
  heroLeaderId, type HeroSkill,
} from "./data/leaders.js";
import { getRace, hasTrait } from "./data/races.js";
import { TIER_OF_TECH } from "./data/techs.js";
import type { Emit } from "./context.js";
import { grantTech, knows } from "./empire.js";
import { raceDiplomacyPoints } from "./raceEffects.js";
import type { Rng } from "./rng.js";
import type { Fleet, GameState, Id, Leader, LeaderAbility, LeaderSkills, PlayerId } from "./types.js";

/**
 * Leaders, after the original's mercenary heroes. A fixed roster of heroes
 * waits in a pool; every turn each empire has a chance that one offers their
 * services. Offers wait in a hiring queue; hired leaders go to a post
 * (administrators to a star system, captains to a fleet), travel there, earn
 * experience, gain levels and draw upkeep. Common skills work for the whole
 * empire while the leader is in service; the rest only at their post.
 */

// ---------------------------------------------------------------- skills and levels

export function parseAbility(s: string): LeaderAbility {
  const improved = s.endsWith("*");
  return { skill: (improved ? s.slice(0, -1) : s) as HeroSkill, improved };
}

/** Level 1-5 from experience; only warlike races' leaders reach level 6, at 1000 experience. */
export function levelFromXp(xp: number, warlord: boolean): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) level = i + 1;
  return Math.min(level, warlord ? WARLORD_MAX_LEVEL : MAX_LEVEL);
}

/** What one ability is worth at a level. */
export function abilityValue(a: LeaderAbility, level: number): number {
  if (a.skill === "megawealth") return MEGAWEALTH_INCOME[a.improved ? 1 : 0];
  if (a.skill === "spiritualLeader" && a.improved) {
    const S = SPIRITUAL_IMPROVED;
    return S.stepPct * Math.floor((S.perLevel * level + S.plus) / S.divisor);
  }
  const def = HERO_SKILLS[a.skill];
  const steps = def.halfLevels ? Math.ceil(level / 2) : level;
  return Math.floor((steps * def.mult[a.improved ? 1 : 0]) / 10);
}

/** Value of a skill for a leader at their current level, 0 if they don't have it. */
export function leaderSkill(l: Leader, skill: HeroSkill): number {
  const a = l.abilities.find((x) => x.skill === skill);
  return a ? abilityValue(a, l.level) : 0;
}

/** The numbers a leader's post gets, from abilities and level. */
export function deriveSkills(l: Pick<Leader, "abilities" | "level" | "kind">): LeaderSkills {
  const v = (s: HeroSkill) => {
    const a = l.abilities.find((x) => x.skill === s);
    return a ? abilityValue(a, l.level) : 0;
  };
  const out: LeaderSkills = {};
  const set = (k: keyof LeaderSkills, n: number) => {
    if (n) out[k] = n;
  };
  set("groundCombat", v("commando"));
  if (l.kind === "administrator") {
    set("industry", v("laborLeader"));
    set("research", v("scienceLeader"));
    set("food", v("farmingLeader"));
    set("bc", v("financialLeader"));
    set("morale", v("spiritualLeader"));
    set("pollution", v("environmentalist"));
    set("growth", v("medicine"));
    set("initiative", v("tactics"));
  } else {
    set("attack", v("weaponry"));
    set("defense", v("helmsman"));
    set("galaxySpeed", v("navigator"));
    set("shieldRecharge", v("engineer"));
    set("fighters", v("fighterPilot"));
    set("monsterBonus", v("galacticLore"));
    set("maxDamage", v("ordnance"));
    set("boardingDefense", v("security"));
  }
  return out;
}

/** Hiring-price weight: skill weights plus the technologies the hero brings. */
export function leaderWeight(l: Pick<Leader, "abilities" | "kind" | "techs">): number {
  let w = 0;
  for (const a of l.abilities) {
    const def = HERO_SKILLS[a.skill];
    // Skills that don't fit the leader's kind are dead weight in the original too: not counted.
    if (def.group === "ship" && l.kind !== "captain") continue;
    if (def.group === "colony" && l.kind !== "administrator") continue;
    const table = a.skill === "commando" && l.kind === "administrator" ? COMMANDO_ADMIN_WEIGHT : def.weight;
    w += table[a.improved ? 1 : 0];
  }
  for (const t of l.techs) {
    const cost = TIER_OF_TECH[t]?.cost ?? 0;
    w += LEADER_RULES.techWeight.find(([below]) => cost < below)![1];
  }
  return w;
}

// ---------------------------------------------------------------- roster

function makeHero(heroId: number, rng: Rng): Leader {
  const h = HEROES[heroId]!;
  const abilities = h.skills.map(parseAbility);
  if (h.randomSkills) abilities.push(...randomAbilities(h.kind, rng));
  const techs = [...(h.techs ?? [])];
  const l: Leader = {
    id: heroLeaderId(heroId), heroId, name: h.name, title: h.title, kind: h.kind, xp: h.xp, level: levelFromXp(h.xp, false),
    abilities, techs, skills: {}, hireCost: 0, salary: 0, status: "pool", offeredTo: null, ownerId: null,
    assignedTo: null, travel: null, availableUntil: 0,
  };
  l.skills = deriveSkills(l);
  return l;
}

/** Five random skills for the heroes of unknown talent, as the original rolls them at game start. */
function randomAbilities(kind: Leader["kind"], rng: Rng): LeaderAbility[] {
  const own = kind === "captain" ? "ship" : "colony";
  const out: LeaderAbility[] = [];
  for (let i = 0; i < LEADER_RULES.randomSkillCount; i++) {
    const group = rng.chance(LEADER_RULES.randomCommonChance) ? "common" : own;
    const options = (Object.keys(HERO_SKILLS) as HeroSkill[]).filter(
      (s) => HERO_SKILLS[s].group === group && !out.some((a) => a.skill === s),
    );
    if (options.length === 0) continue;
    out.push({ skill: rng.pick(options), improved: rng.chance(0.5) });
  }
  return out;
}

/** Puts the whole hero roster into a new game. */
export function createRoster(state: GameState, rng: Rng): void {
  for (let i = 0; i < HEROES.length; i++) {
    const l = makeHero(i, rng);
    state.leaders[l.id] = l;
  }
  refreshLeaders(state);
}

/** Games saved before the roster existed get one; their randomly made leaders retire. */
export function ensureRoster(state: GameState, rng: Rng): void {
  if (Object.values(state.leaders).some((l) => typeof l.heroId === "number")) return;
  state.leaders = {};
  for (const p of state.players) p.leaderOffers = [];
  createRoster(state, rng);
}

// ---------------------------------------------------------------- queries

export function hiredLeaders(state: GameState, playerId: PlayerId): Leader[] {
  return Object.values(state.leaders).filter((l) => l.ownerId === playerId && l.status !== "pool" && l.status !== "offered");
}

/** Upkeep of every hired leader; Megawealth leaders count as income (negative). */
export function salaries(state: GameState, playerId: PlayerId): number {
  return hiredLeaders(state, playerId).reduce((sum, l) => sum + l.salary, 0);
}

/** Sum of a common skill over an empire's hired leaders. */
function sumSkill(state: GameState, playerId: PlayerId, skill: HeroSkill): number {
  return hiredLeaders(state, playerId).reduce((s, l) => s + leaderSkill(l, skill), 0);
}

/** Best value of a common skill among an empire's hired leaders. */
function bestSkill(state: GameState, playerId: PlayerId, skill: HeroSkill): number {
  return hiredLeaders(state, playerId).reduce((s, l) => Math.max(s, leaderSkill(l, skill)), 0);
}

/** Research points per turn from Researcher leaders. */
export const leaderResearch = (state: GameState, playerId: PlayerId) => sumSkill(state, playerId, "researcher");
/** Command points from Operations leaders. */
export const leaderCommandPoints = (state: GameState, playerId: PlayerId) => sumSkill(state, playerId, "operations");
/** Spy roll points for spies abroad (best Spy Master). */
export const leaderSpyOffense = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "spyMaster");
/** Spy roll points for defending spies (best Telepath). */
export const leaderSpyDefense = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "telepath");
/** % chance per turn to kill an enemy spy (best Assassin). */
export const leaderAssassinChance = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "assassin");
/** Diplomatic points from the best Diplomat. */
export const leaderDiplomacy = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "diplomat");
/** % more trade treaty income from the best Trader. */
export const leaderTradeBonus = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "trader");
/** Extra experience per turn for leaders and crews from the best Instructor. */
export const leaderInstructorXp = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "instructor");
/** Hiring discount from the best Famous leader. */
export const leaderFamousDiscount = (state: GameState, playerId: PlayerId) => bestSkill(state, playerId, "famous");

/** Where a hired leader is: their system, their fleet's star, or the home star when in the pool. Null while travelling. */
export function leaderStar(state: GameState, l: Leader): Id | null {
  if (l.ownerId === null || l.travel) return null;
  if (!l.assignedTo) return state.players[l.ownerId]?.homeStarId ?? null;
  if (l.kind === "administrator") return l.assignedTo;
  return state.fleets[l.assignedTo]?.starId ?? null;
}

/**
 * Ground combat points Commando leaders give an empire's troops at a star.
 * Defenders get the system administrator's Commando; troops landing from
 * orbit get the best captain's at the star, at the larger invasion rate.
 */
export function commandoBonusAt(state: GameState, playerId: PlayerId, starId: Id, defending: boolean): number {
  let best = 0;
  for (const l of hiredLeaders(state, playerId)) {
    if (!l.assignedTo || leaderStar(state, l) !== starId) continue;
    const a = l.abilities.find((x) => x.skill === "commando");
    if (!a) continue;
    if (defending && l.kind === "administrator") best = Math.max(best, abilityValue(a, l.level));
    if (!defending && l.kind === "captain") best = Math.max(best, invasionCommando(a, l.level));
  }
  return best;
}

/** A captain's Commando for troops landing from orbit. */
export function invasionCommando(a: LeaderAbility, level: number): number {
  const c = COMMANDO_INVASION;
  return a.improved ? Math.floor((c.improvedPerLevel * level + c.improvedPlus) / c.improvedDivisor) : c.perLevel * level;
}

/** The administrator governing a star system for an empire, if any. */
export function administratorAt(state: GameState, starId: Id, ownerId: PlayerId): Leader | undefined {
  return Object.values(state.leaders).find((l) => l.kind === "administrator" && l.ownerId === ownerId && l.assignedTo === starId);
}

/** The captain commanding a fleet, if any. */
export function captainOf(state: GameState, fleetId: Id): Leader | undefined {
  return Object.values(state.leaders).find((l) => l.kind === "captain" && l.ownerId !== null && l.assignedTo === fleetId);
}

/** Galaxy speed a fleet gets from its captain (Navigator). */
export function fleetLeaderSpeed(state: GameState, f: Fleet): number {
  return captainOf(state, f.id)?.skills.galaxySpeed ?? 0;
}

/** Diplomatic points an empire brings to deals: techs are added by callers; this is race traits and leaders. */
export function diplomacyPoints(state: GameState, playerId: PlayerId): number {
  return raceDiplomacyPoints(getRace(state.players[playerId]!.raceId)) + leaderDiplomacy(state, playerId);
}

// ---------------------------------------------------------------- prices

function warlordOf(state: GameState, playerId: PlayerId | null): boolean {
  return playerId !== null && !!state.players[playerId] && hasTrait(getRace(state.players[playerId]!.raceId), "warlord");
}

/**
 * Hiring price before race modifiers, for an empire (null: nobody): weight x
 * level x 10 (the level here ignores Warlord), doubled for Megawealth, minus
 * the empire's best Famous discount.
 */
export function basePrice(state: GameState, playerId: PlayerId | null, l: Leader): number {
  const level = levelFromXp(l.xp, false);
  let cost = leaderWeight(l) * level * LEADER_RULES.costPerWeightLevel;
  if (l.abilities.some((a) => a.skill === "megawealth")) cost *= LEADER_RULES.megawealthCostMult;
  if (playerId !== null) cost -= leaderFamousDiscount(state, playerId);
  return Math.max(0, cost);
}

/** What hiring a leader costs an empire, with Charismatic (half) and Repulsive (+50%). */
export function hirePrice(state: GameState, playerId: PlayerId, l: Leader): number {
  let cost = basePrice(state, playerId, l);
  const race = getRace(state.players[playerId]!.raceId);
  if (hasTrait(race, "charismatic")) cost *= LEADER_RULES.charismaticCostMult;
  if (hasTrait(race, "repulsive")) cost *= LEADER_RULES.repulsiveCostMult;
  return Math.round(cost);
}

/** Upkeep per turn: price / 100 rounded up, at least 1; Megawealth pays in instead, the last elder serves for free. */
export function upkeep(state: GameState, playerId: PlayerId | null, l: Leader): number {
  const mega = l.abilities.find((a) => a.skill === "megawealth");
  if (mega) return -abilityValue(mega, l.level);
  if (HEROES[l.heroId]?.special === "guardian") return 0;
  return Math.max(1, Math.ceil(basePrice(state, playerId, l) / LEADER_RULES.upkeepDivisor));
}

/** Recomputes levels, effects, prices and upkeep, and the offer copies players see. */
export function refreshLeaders(state: GameState): void {
  for (const l of Object.values(state.leaders)) {
    if (typeof l.heroId !== "number") continue;
    const who = l.status === "offered" ? l.offeredTo : l.ownerId;
    l.level = levelFromXp(l.xp, warlordOf(state, who));
    l.skills = deriveSkills(l);
    l.hireCost = who === null ? basePrice(state, null, l) : hirePrice(state, who, l);
    l.salary = upkeep(state, who, l);
  }
  for (const p of state.players) {
    if (p.kind !== "empire") continue;
    p.leaderOffers = Object.values(state.leaders)
      .filter((l) => l.status === "offered" && l.offeredTo === p.id)
      .map((l) => structuredClone(l));
    p.diplomacyBonus = diplomacyPoints(state, p.id);
  }
}

// ---------------------------------------------------------------- turn

/** Whether an empire has room for another leader of a kind. */
export function hasRoomFor(state: GameState, playerId: PlayerId, kind: Leader["kind"]): boolean {
  const hired = hiredLeaders(state, playerId);
  return hired.length < LEADER_RULES.maxTotal && hired.filter((l) => l.kind === kind).length < LEADER_RULES.maxPerKind;
}

/** Percent chance this turn that a hero offers their services to an empire. */
export function offerChance(state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId]!;
  if (state.turn < LEADER_RULES.firstOfferTurn) return 0;
  const hired = hiredLeaders(state, playerId);
  if (hired.length >= LEADER_RULES.maxTotal) return 0;
  const race = getRace(p.raceId);
  let chance = state.turn - (p.lastLeaderOffer ?? 0) + 1;
  if (hasTrait(race, "charismatic")) chance += LEADER_RULES.charismaticOfferBonus;
  if (hasTrait(race, "repulsive")) chance += LEADER_RULES.repulsiveOfferBonus;
  for (const l of hired) {
    const famous = l.abilities.find((a) => a.skill === "famous");
    if (famous) chance += Math.floor(l.level * LEADER_RULES.famousOfferPerLevel[famous.improved ? 1 : 0]);
  }
  return chance / (hired.length + 1);
}

/** How far into the roster offers can reach this turn (heroes are ordered weakest first). */
export function rosterReach(state: GameState, playerId: PlayerId): number {
  const race = getRace(state.players[playerId]!.raceId);
  const empires = state.players.filter((p) => p.kind === "empire").length;
  let reach = Math.floor(state.turn / LEADER_RULES.poolTurns) + LEADER_RULES.poolBase + empires;
  if (hasTrait(race, "charismatic")) reach += LEADER_RULES.charismaticPool;
  if (hasTrait(race, "repulsive")) reach = Math.floor(reach / LEADER_RULES.repulsivePoolDivisor);
  return Math.max(1, Math.min(HEROES.length, reach));
}

function offerHero(state: GameState, rng: Rng, playerId: PlayerId, emit?: Emit): void {
  const reach = rosterReach(state, playerId);
  for (let i = 0; i < LEADER_RULES.pickTries; i++) {
    const id = rng.int(0, reach - 1);
    const l = state.leaders[heroLeaderId(id)];
    if (!l || l.status !== "pool" || HEROES[id]!.special) continue;
    if (!hasRoomFor(state, playerId, l.kind)) continue;
    l.status = "offered";
    l.offeredTo = playerId;
    l.availableUntil = state.turn + LEADER_RULES.queueTurns;
    state.players[playerId]!.lastLeaderOffer = state.turn;
    emit?.({ kind: "leader", playerId, leaderId: l.id, what: `${l.name}, ${l.title}, offers their services`, offer: true });
    return;
  }
}

/**
 * A captain goes down with their ship unless the empire has Survival Pods and
 * one of its ships came through the battle to pick them up.
 */
export function captainLost(state: GameState, fleetId: Id, rescued: boolean, emit?: Emit): void {
  const l = captainOf(state, fleetId);
  if (!l || l.ownerId === null) return;
  const owner = state.players[l.ownerId]!;
  if (rescued && knows(owner, "survivalPods")) return;
  emit?.({ kind: "leader", playerId: owner.id, leaderId: l.id, what: `${l.name}, ${l.title}, was killed when their ship was destroyed` });
  l.status = "dead";
  l.ownerId = null;
  l.offeredTo = null;
  l.assignedTo = null;
  l.travel = null;
}

function backToPool(l: Leader): void {
  l.status = "pool";
  l.offeredTo = null;
  l.ownerId = null;
  l.assignedTo = null;
  l.travel = null;
}

/** Whether a post (system or fleet) is still one the leader can hold for its owner. */
function validPost(state: GameState, l: Leader, target: Id): boolean {
  if (l.ownerId === null) return false;
  if (l.kind === "captain") return state.fleets[target]?.ownerId === l.ownerId;
  return Object.values(state.colonies).some((c) => c.ownerId === l.ownerId && state.planets[c.planetId]!.starId === target);
}

function takePost(state: GameState, l: Leader, target: Id): void {
  for (const other of Object.values(state.leaders)) {
    if (other !== l && other.ownerId === l.ownerId && other.kind === l.kind && other.assignedTo === target) other.assignedTo = null;
  }
  l.assignedTo = target;
}

/** Experience for a leader, announcing a new level. */
export function addXp(state: GameState, l: Leader, xp: number, emit?: Emit): void {
  if (xp <= 0 || l.ownerId === null) return;
  const before = l.level;
  l.xp = Math.min(30000, l.xp + xp);
  l.level = levelFromXp(l.xp, warlordOf(state, l.ownerId));
  if (l.level > before) emit?.({ kind: "leader", playerId: l.ownerId, leaderId: l.id, what: `${l.name} reached level ${l.level}` });
}

/** Captains of the winning fleets gain the same battle experience as their crews. */
export function combatXp(state: GameState, fleetIds: Id[], amount: number, emit?: Emit): void {
  for (const id of fleetIds) {
    const l = captainOf(state, id);
    if (l) addXp(state, l, Math.max(1, amount), emit);
  }
}

/** Once a turn: experience, arrivals, expired offers, new offers. */
export function leaderTick(state: GameState, rng: Rng, emit?: Emit): void {
  ensureRoster(state, rng);
  for (const l of Object.values(state.leaders)) {
    if (l.status === "offered") {
      const p = l.offeredTo === null ? undefined : state.players[l.offeredTo];
      if (l.availableUntil < state.turn || !p?.alive) backToPool(l);
      continue;
    }
    if (l.status !== "hired" || l.ownerId === null) continue;
    if (!state.players[l.ownerId]?.alive) {
      backToPool(l);
      continue;
    }
    addXp(state, l, LEADER_RULES.xpPerTurn + leaderInstructorXp(state, l.ownerId), emit);
    if (l.travel && state.turn >= l.travel.arrives) {
      const to = l.travel.to;
      l.travel = null;
      if (validPost(state, l, to)) takePost(state, l, to);
    }
    // Leaders whose post is gone return to the pool at home.
    if (l.assignedTo && !validPost(state, l, l.assignedTo)) l.assignedTo = null;
  }
  for (const p of state.players) {
    if (p.kind !== "empire" || !p.alive) continue;
    const chance = offerChance(state, p.id);
    if (chance > 0 && rng.int(0, 99) < chance) offerHero(state, rng, p.id, emit);
  }
  refreshLeaders(state);
}

// ---------------------------------------------------------------- commands

/** Hires an offered hero: pays the price, teaches their technologies, shares their lore. */
export function hireLeader(state: GameState, playerId: PlayerId, leaderId: Id, emit?: Emit): void {
  const l = state.leaders[leaderId]!;
  const player = state.players[playerId]!;
  player.bc -= hirePrice(state, playerId, l);
  joinEmpire(state, playerId, l, emit);
}

function joinEmpire(state: GameState, playerId: PlayerId, l: Leader, emit?: Emit): void {
  const player = state.players[playerId]!;
  l.status = "hired";
  l.offeredTo = null;
  l.ownerId = playerId;
  l.assignedTo = null;
  l.travel = null;
  emit?.({ kind: "leader", playerId, leaderId: l.id, what: `${l.name} joined your empire` });
  for (const t of l.techs) {
    if (!grantTech(player, t)) continue;
    const tier = TIER_OF_TECH[t];
    if (tier) emit?.({ kind: "techLearned", playerId, techId: t, tierId: tier.id, source: "event" });
  }
  if (l.abilities.some((a) => a.skill === "galacticLore")) {
    player.explored = [...new Set([...player.explored, ...state.galaxy.stars.filter((s) => s.special !== "raiderHome").map((s) => s.id)])];
  }
  refreshLeaders(state);
}

/** A hero who joins through a deed (the guardian's fall, beating raiders) rather than an offer. */
export function heroJoins(state: GameState, playerId: PlayerId, special: "guardian" | "raiders", emit?: Emit, post?: Id): void {
  const id = HEROES.findIndex((h) => h.special === special);
  const l = state.leaders[heroLeaderId(id)];
  if (!l || l.status !== "pool" || state.players[playerId]?.kind !== "empire") return;
  if (!hasRoomFor(state, playerId, l.kind)) return;
  joinEmpire(state, playerId, l, emit);
  if (post) takePost(state, l, post);
}

/** Sends a leader to a post (or to the pool with null). Posts in another system take a few turns to reach. */
export function assignLeader(state: GameState, playerId: PlayerId, leaderId: Id, targetId: Id | null): void {
  const l = state.leaders[leaderId]!;
  if (targetId === null) {
    l.assignedTo = null;
    l.travel = null;
    return;
  }
  const here = leaderStar(state, l) ?? state.players[playerId]!.homeStarId;
  const there = l.kind === "administrator" ? targetId : state.fleets[targetId]?.starId ?? null;
  if (there !== null && there === here) {
    l.travel = null;
    takePost(state, l, targetId);
    return;
  }
  l.assignedTo = null;
  l.travel = { to: targetId, arrives: state.turn + LEADER_RULES.travelTurns };
}

/** Dismissed leaders return to the pool and may offer their services again later. */
export function dismissLeader(state: GameState, leaderId: Id): void {
  const l = state.leaders[leaderId];
  if (l) backToPool(l);
  refreshLeaders(state);
}
