import {
  RACES_BY_ID, checkInvariants, empireTotals, newGame, playerView, processTurn, score,
  type GameEvent, type GameState, type NewGameOptions, type PlayerId, type TurnOrders, type VictoryKind,
} from "@starlord/sim";
import { automationOrders } from "./index.js";

/**
 * Plays all-AI games turn by turn and watches them for trouble: crashes,
 * broken invariants, commands the AI keeps getting rejected and turns that
 * take suspiciously long. Used by `pnpm soak` and the debug menu's simulator.
 * It runs a step at a time so a UI can stay responsive between turns.
 */

export interface SimProblem { turn: number; kind: "crash" | "invariant" | "slowTurn"; message: string }

export interface EmpireResult {
  id: PlayerId;
  name: string;
  race: string;
  alive: boolean;
  eliminatedTurn: number | null;
  colonies: number;
  population: number;
  techs: number;
  ships: number;
  bc: number;
  score: number;
}

export interface SimResult {
  seed: string;
  /** Turns played so far. */
  turns: number;
  maxTurns: number;
  over: boolean;
  crashed: boolean;
  winner: string | null;
  victory: VictoryKind | null;
  /** Wall-clock milliseconds, only when the caller passed a clock. */
  ms: number;
  slowestTurnMs: number;
  problems: SimProblem[];
  /** Rejected AI commands, by reason with numbers stripped, and how often. */
  rejected: Record<string, number>;
  /** How often each kind of event happened. */
  events: Record<string, number>;
  /** Diplomatic changes between empires: wars declared, peace treaties, pacts, alliances, trade and research treaties signed. */
  diplomacy: Record<string, number>;
  empires: EmpireResult[];
  /** Every Galactic Council session: the candidates' and winner's races. */
  councils: { turn: number; candidates: string[]; seats: PlayerId[]; winner: string | null }[];
  /** Armed warships by hull size per living empire, taken at turn HULL_SNAPSHOT_TURN. */
  hulls: { race: string; colonies: number; population: number; hulls: Record<string, number> }[];
}

/** Turn at which the simulator records every empire's warships by hull. */
export const HULL_SNAPSHOT_TURN = 250;

export interface SimOptions extends NewGameOptions {
  /** A clock for timing turns (e.g. performance.now); the game itself never reads it. */
  now?: () => number;
  /** A turn slower than this many milliseconds is reported (default 2000). */
  slowTurnMs?: number;
  /** Run the invariant checks every this many turns (default 1). */
  checkEvery?: number;
}

const MAX_PROBLEMS = 100;

export class Simulation {
  state: GameState;
  readonly result: SimResult;
  private readonly opts: SimOptions;

  constructor(opts: SimOptions) {
    this.opts = opts;
    this.state = newGame({ ...opts, humanPlayers: [] });
    this.result = {
      seed: String(opts.seed),
      turns: 0,
      maxTurns: this.state.settings.maxTurns,
      over: false,
      crashed: false,
      winner: null,
      victory: null,
      ms: 0,
      slowestTurnMs: 0,
      problems: [],
      rejected: {},
      events: {},
      diplomacy: {},
      empires: [],
      councils: [],
      hulls: [],
    };
    this.problems(0, checkInvariants(this.state), "invariant");
    this.refresh();
  }

  get done(): boolean {
    return this.result.over || this.result.crashed;
  }

  /** Plays one turn; returns false once the game is over or has crashed. */
  step(): boolean {
    if (this.done) return false;
    const r = this.result;
    const t0 = this.opts.now?.() ?? 0;
    try {
      const orders: TurnOrders = {};
      for (const p of this.state.players) {
        if (p.alive && p.kind === "empire") orders[p.id] = automationOrders(playerView(this.state, p.id));
      }
      const before = this.state.relations;
      this.state = processTurn(this.state, orders);
      this.countDiplomacy(before, this.state.relations);
    } catch (err) {
      r.crashed = true;
      this.problems(this.state.turn, [err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)], "crash");
      try { this.refresh(); } catch { /* keep the last good summary */ }
      return false;
    }
    const ms = (this.opts.now?.() ?? 0) - t0;
    r.ms += ms;
    r.turns = this.state.turn - 1;
    if (ms > r.slowestTurnMs) r.slowestTurnMs = ms;
    if (ms > (this.opts.slowTurnMs ?? 2000)) this.problems(r.turns, [`turn took ${Math.round(ms)} ms`], "slowTurn");
    for (const e of this.state.events) this.count(e);
    this.recordCouncil();
    if (r.turns === HULL_SNAPSHOT_TURN) this.recordHulls();
    if (this.state.over || r.turns % (this.opts.checkEvery ?? 1) === 0) {
      this.problems(r.turns, checkInvariants(this.state), "invariant");
    }
    this.refresh();
    return !this.done;
  }

  /** Plays turns until the game ends or `budgetMs` of the caller's clock has passed. */
  run(budgetMs = Infinity): SimResult {
    const start = this.opts.now?.() ?? 0;
    while (this.step()) {
      if (this.opts.now && this.opts.now() - start >= budgetMs) break;
    }
    return this.result;
  }

  private count(e: GameEvent): void {
    const r = this.result;
    r.events[e.kind] = (r.events[e.kind] ?? 0) + 1;
    if (e.kind === "commandRejected") {
      const key = e.reason.replace(/\d+(\.\d+)?/g, "#");
      r.rejected[key] = (r.rejected[key] ?? 0) + 1;
    }
  }

  private recordCouncil(): void {
    const last = this.state.council.lastResult;
    const r = this.result;
    if (!last || r.councils.some((c) => c.turn === last.turn)) return;
    const race = (id: PlayerId) => RACES_BY_ID[this.state.players[id]!.raceId]?.name ?? this.state.players[id]!.raceId;
    r.councils.push({ turn: last.turn, candidates: last.candidates.map(race), seats: [...last.candidates], winner: last.winner === null ? null : race(last.winner) });
  }

  private recordHulls(): void {
    const s = this.state;
    this.result.hulls = s.players.filter((p) => p.kind === "empire" && p.alive).map((p) => {
      const hulls: Record<string, number> = {};
      for (const f of Object.values(s.fleets)) {
        if (f.ownerId !== p.id) continue;
        for (const st of f.ships) {
          const d = p.designs.find((x) => x.id === st.designId);
          if (!d || d.module || d.weapons.length === 0) continue;
          hulls[d.hull] = (hulls[d.hull] ?? 0) + st.count;
        }
      }
      const t = empireTotals(s, p.id);
      return { race: RACES_BY_ID[p.raceId]?.name ?? p.raceId, colonies: t.colonies, population: t.population, hulls };
    });
  }

  private countDiplomacy(before: GameState["relations"], after: GameState["relations"]): void {
    const d = this.result.diplomacy;
    const bump = (k: string) => (d[k] = (d[k] ?? 0) + 1);
    for (const [key, r] of Object.entries(after)) {
      const old = before[key];
      if (r.status !== (old?.status ?? "none")) bump(r.status === "none" ? "lapsed" : r.status);
      if (r.trade && !old?.trade) bump("trade");
      if (r.research && !old?.research) bump("research");
    }
  }

  private problems(turn: number, messages: string[], kind: SimProblem["kind"]): void {
    for (const message of messages) {
      // The same broken invariant usually repeats every turn; keep its first sighting only.
      if (kind === "invariant" && this.result.problems.some((p) => p.message === message)) continue;
      if (this.result.problems.length < MAX_PROBLEMS) this.result.problems.push({ turn, kind, message });
    }
  }

  private refresh(): void {
    const s = this.state;
    const r = this.result;
    r.over = s.over;
    r.winner = s.winner !== null ? s.players[s.winner]!.name : null;
    r.victory = s.victory;
    r.empires = s.players.filter((p) => p.kind === "empire").map((p) => {
      const t = empireTotals(s, p.id);
      return {
        id: p.id,
        name: p.name,
        race: RACES_BY_ID[p.raceId]?.name ?? p.raceId,
        alive: p.alive,
        eliminatedTurn: p.eliminatedTurn,
        colonies: t.colonies,
        population: t.population,
        techs: p.techs.length,
        ships: Object.values(s.fleets).filter((f) => f.ownerId === p.id).reduce((n, f) => n + f.ships.reduce((m, x) => m + x.count, 0), 0),
        bc: Math.round(p.bc),
        score: score(s, p.id),
      };
    });
  }
}
