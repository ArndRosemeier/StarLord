import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ARCS, type BattleDecision, type CombatOutcome, type CombatReport, type FiringArc, type PendingBattle, type TacticalOrder,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { starName } from "../ui/format";
import { audio } from "../audio/sound";
import { useReducedMotion } from "../ui/fx";
import { webglAvailable } from "../three/webgl";
import { Combat2D } from "./combat/Combat2D";
import { describe, framesAt, unitAlive, unitInfo, type CommandOverlay, type ReplayStep } from "./combat/replayModel";

const Combat3D = lazy(() => import("./combat/Combat3D"));

/** Milliseconds per event while the battle plays out between the player's turns. */
const PLAY_MS = 110;

interface Engine {
  fight: Generator<BattleDecision, CombatOutcome, TacticalOrder>;
  /** The battle as it started, for the views (its units never change). */
  base: CombatReport;
  decision: BattleDecision | null;
  outcome: CombatOutcome | null;
  /** Orders given so far, in the order the units acted. */
  orders: TacticalOrder[];
}

// One fight per pending battle, kept outside React so a remount (or Strict Mode) never starts it twice.
const engines = new WeakMap<PendingBattle, Engine>();

function engineFor(pb: PendingBattle): Engine {
  let e = engines.get(pb);
  if (e) return e;
  const fight = pb.battle.fight(pb.starId, pb.reportId);
  const first = fight.next();
  const sides = pb.battle.sides;
  e = {
    fight,
    base: {
      id: pb.reportId, turn: pb.battle.state.turn, starId: pb.starId, sides: [sides[0].ownerId, sides[1].ownerId],
      ships: pb.battle.snapshots, rounds: [], winner: null, losses: {},
    },
    decision: first.done ? null : first.value,
    outcome: first.done ? first.value : null,
    orders: [],
  };
  engines.set(pb, e);
  return e;
}

const stepsOf = (pb: PendingBattle): ReplayStep[] => pb.battle.rounds.flatMap((r, round) => r.map((e) => ({ round, e })));

/**
 * A battle the player commands, as in MoO2: the turn stops at the battle,
 * and on each of their units' turns they pick where it moves and what it
 * fires at (or retreat, or hand the ship or the rest of the battle to the
 * computer). Their orders go in with the turn, which fights the battle the
 * same way.
 */
export function CommandBattle({ pending }: { pending: PendingBattle }) {
  const { session, view } = useGame();
  const engine = engineFor(pending);
  const reduced = useReducedMotion();
  const [asking, setAsking] = useState(engine.orders.length === 0 && !engine.outcome);
  const [, setVersion] = useState(0);
  const [steps, setSteps] = useState(() => stepsOf(pending));
  const [shown, setShown] = useState(() => steps.length);
  const [moveTo, setMoveTo] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [use3d, setUse3d] = useState(() => webglAvailable());
  const { base, decision, outcome } = engine;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const units = useMemo(() => unitInfo(base, view), [base]);
  const options = decision ? pending.battle.options(decision.unit) : null;
  const caughtUp = shown >= steps.length;
  const yourTurn = !asking && caughtUp && !!decision && !!options;

  useEffect(() => {
    const before = audio.setMood("combat");
    return () => {
      if (audio.getMood() === "combat") audio.setMood(before === "none" ? "galaxy" : before);
    };
  }, []);

  // A new turn of one of ours: the computer's pick is the starting target, and no move yet.
  useEffect(() => {
    setMoveTo(null);
    setTarget(options?.suggested ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  // Between the player's turns, what happened plays out event by event.
  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setShown(shown + 1), reduced ? 30 : PLAY_MS);
    return () => clearTimeout(t);
  }, [shown, caughtUp, reduced]);

  const event = steps[shown - 1]?.e;
  useEffect(() => {
    if (event?.kind === "destroyed") audio.play("boom");
  }, [event]);

  const send = (order: TacticalOrder) => {
    if (!engine.decision) return;
    engine.orders.push(order);
    const next = engine.fight.next(order);
    engine.decision = next.done ? null : next.value;
    engine.outcome = next.done ? next.value : null;
    setSteps(stepsOf(pending));
    setVersion((v) => v + 1);
  };

  const act = () => send({ kind: "act", ...(moveTo ? { moveTo } : {}), ...(target ? { target } : {}) });

  useEffect(() => {
    if (!yourTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      act();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frames = useMemo(() => framesAt(base, steps, shown), [base, steps, shown]);
  const snap = (key: string | null | undefined) => (key ? base.ships.find((s) => s.key === key) : undefined);
  const name = (id: number) => view.players[id]?.name ?? "Unknown";
  const me = pending.playerId;
  const enemy = base.sides.find((s) => s !== me) ?? base.sides[1];
  const alive = (id: number) => base.ships.filter((s) => s.ownerId === id && unitAlive(frames, s.key)).length;

  const command: CommandOverlay | null = useMemo(() => {
    if (!yourTurn || !decision || !options) return null;
    const at = frames.now.get(decision.unit);
    return {
      active: decision.unit,
      targets: options.targets,
      target,
      reach: options.reach,
      moveTo,
      onField: (x, y) => {
        if (!at || options.reach <= 0) return;
        // Past its reach the ship only gets as far as it can; show where that is.
        const d = Math.hypot(x - at.x, y - at.y);
        const k = d > options.reach ? options.reach / d : 1;
        setMoveTo({ x: Math.round((at.x + (x - at.x) * k) * 10) / 10, y: Math.round((at.y + (y - at.y) * k) * 10) / 10 });
      },
      onUnit: (key) => {
        if (key === decision.unit) setMoveTo(null);
        else if (options.targets.some((t) => t.key === key)) setTarget(key);
      },
    };
  }, [yourTurn, decision, options?.reach, target, moveTo, frames]);

  const liveReport = useMemo(() => ({ ...base, rounds: pending.battle.rounds.map((r) => [...r]) }), [base, steps]);
  const props = { report: base, view, units, frames, event, step: shown, reduced, resetKey: 0, command };
  const flat = <Combat2D {...props} report={liveReport} />;
  const active = snap(decision?.unit);
  const targetInfo = options?.targets.find((t) => t.key === target);
  const round = (steps[Math.max(0, shown - 1)]?.round ?? 0) + 1;

  return (
    <div className="modal-back">
      <div className="modal command-battle">
        <div className="combat-head">
          <span className="combat-side" style={{ color: view.players[me]?.color }}>
            <span className="dot glow" style={{ background: view.players[me]?.color }} /> {name(me)} <small>{alive(me)} left</small>
          </span>
          <span className="combat-round">Battle at {starName(view, pending.starId)} · Round {round}</span>
          <span className="combat-side right" style={{ color: view.players[enemy]?.color }}>
            <small>{alive(enemy)} left</small> {name(enemy)} <span className="dot glow" style={{ background: view.players[enemy]?.color }} />
          </span>
        </div>
        <div className="combat-field">
          {use3d ? (
            <Suspense fallback={<div className="combat-3d" />}>
              <Combat3D {...props} onFail={() => setUse3d(false)} />
            </Suspense>
          ) : flat}
          {asking && (
            <div className="command-ask">
              <h3>{name(enemy)} at {starName(view, pending.starId)}</h3>
              <p className="muted">
                Command the battle yourself: on each of your units' turns, click where it moves and which enemy it fires at.
                Or let it resolve by itself; your combat doctrine (Fleets screen) then decides targets and retreat, and you can watch the replay after the turn.
              </p>
              <div className="row">
                <button className="primary" onClick={() => setAsking(false)}>Command the battle</button>
                <button onClick={() => session.finishBattle("auto")}>Auto-resolve</button>
              </div>
              <label className="row muted" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={!!view.players[me]?.autoBattles}
                  onChange={(e) => session.setAutoBattles(e.target.checked)} />
                Always auto-resolve my battles (change it any time under Game)
              </label>
            </div>
          )}
          {!asking && outcome && caughtUp && (
            <div className="combat-result">
              {outcome.report.winner === null ? "No winner" : <><span style={{ color: view.players[outcome.report.winner]?.color }}>{name(outcome.report.winner)}</span> victorious</>}
            </div>
          )}
        </div>
        {!asking && (
          <div className="command-panel">
            {yourTurn && active && options ? (
              <>
                <div className="row wrap">
                  <b style={{ color: view.players[active.ownerId]?.color }}>{active.name}</b>
                  <span className="muted">
                    {options.reach > 0 ? `moves up to ${Math.floor(options.reach)} squares (turning uses some)` : "cannot move this turn"}
                  </span>
                  <span className="spacer" />
                  <span className="muted">
                    {moveTo ? `Moving to ${Math.round(moveTo.x)}, ${Math.round(moveTo.y)}` : options.reach > 0 ? "Staying put: click the field to move" : ""}
                  </span>
                </div>
                <div className="row wrap">
                  <span>Target:</span>
                  <select value={target ?? ""} onChange={(e) => setTarget(e.target.value || null)}>
                    <option value="">Hold fire</option>
                    {options.targets.map((t) => (
                      <option key={t.key} value={t.key}>{snap(t.key)?.name ?? t.key}{t.inRange ? "" : " (out of range from here)"}</option>
                    ))}
                  </select>
                  {targetInfo && <span className={targetInfo.inRange ? "good" : "muted"}>{targetInfo.inRange ? "in range" : "out of range: move closer"}</span>}
                </div>
                {snap(target)?.kind === "planet" && options.weapons.some((w) => w.id === "stellarConverter") && (
                  <div className="row muted">
                    In battle the Stellar Converter only wears down the planet's defenses. Win the orbit and the turn asks whether to destroy the planet.
                  </div>
                )}
                <div className="row wrap muted command-weapons">
                  {options.weapons.length === 0 ? "No weapons" : options.weapons.map((w, i) => (
                    <span key={i} className={w.ready ? "" : "faded"} title={`${ARCS[w.arc as FiringArc]?.name ?? w.arc} arc`}>
                      {w.count}× {w.name}{w.shots !== null ? ` (${w.shots} shots)` : ""}{w.ready ? "" : " · not ready"}
                    </span>
                  ))}
                </div>
                <div className="row wrap">
                  <button className="primary" onClick={act} title="Enter">{target ? (moveTo ? "Move and fire" : "Fire") : moveTo ? "Move, hold fire" : "End turn"}</button>
                  {options.canRetreat && <button onClick={() => send({ kind: "retreat" })} title="The ship leaves the battle as its next turn begins">Retreat</button>}
                  <button onClick={() => send({ kind: "ai" })} title="The computer plays this ship's turn as your doctrine says">Computer plays this turn</button>
                  <span className="spacer" />
                  <button onClick={() => send({ kind: "auto" })} title="The computer fights the rest of the battle for you, following your combat doctrine">Auto-resolve the rest</button>
                </div>
              </>
            ) : outcome && caughtUp ? (
              <div className="row">
                <span>{outcome.report.winner === me ? "Victory." : outcome.report.winner === null ? "Neither side won." : "Defeat."}</span>
                <span className="spacer" />
                <button className="primary" onClick={() => session.finishBattle(engine.orders)}>Continue the turn</button>
              </div>
            ) : (
              <div className="row">
                <span className="muted combat-log">{describe(base, event)}</span>
                <span className="spacer" />
                <button className="small" onClick={() => setShown(steps.length)}>Skip ahead</button>
              </div>
            )}
            {webglAvailable() && (
              <div className="row">
                <span className="spacer" />
                <button className="small" onClick={() => setUse3d(!use3d)}>{use3d ? "2D view" : "3D view"}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
