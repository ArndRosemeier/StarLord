import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ARCS, EXPLOSION, WEAPON_MODS_BY_ID, WEAPONS_BY_ID, type BattleDecision, type ScanInfo, type CombatOutcome, type CombatReport, type FiringArc, type PendingBattle, type TacticalOrder,
  type UnitOptions, type WeaponPreview,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { starName } from "../ui/format";
import { audio } from "../audio/sound";
import { useReducedMotion } from "../ui/fx";
import { webglAvailable } from "../three/webgl";
import { Combat2D } from "./combat/Combat2D";
import { describe, framesAt, unitAlive, unitInfo, type CommandOverlay, type ReplayStep, type UnitState } from "./combat/replayModel";
import { isTouchDevice } from "../ui/touch";

const Combat3D = lazy(() => import("./combat/Combat3D"));

/** Milliseconds per event while the battle plays out between the player's turns. */
const PLAY_MS = 110;
/** Two field clicks this close in time (ms) and space (squares) count as a double click: move there now. */
const DOUBLE_MS = 450;
const DOUBLE_SQUARES = 1.5;

interface Engine {
  fight: Generator<BattleDecision, CombatOutcome, TacticalOrder>;
  /** The battle as it started, for the views (its units never change). */
  base: CombatReport;
  decision: BattleDecision | null;
  outcome: CombatOutcome | null;
  /** Our orders given so far, in the order our units acted. */
  orders: TacticalOrder[];
  /** Decisions made so far by either side (a live battle against another person numbers its steps by this). */
  n: number;
  /** The sides we command. */
  mine: (0 | 1)[];
  /** Live battle: we let the computer fight our side as soon as our turn comes. */
  autoAll: boolean;
}

// One fight per pending battle, kept outside React so a remount (or Strict Mode) never starts it twice.
const engines = new WeakMap<PendingBattle, Engine>();

function engineFor(pb: PendingBattle, me: number): Engine {
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
    n: 0,
    mine: ([0, 1] as const).filter((i) => sides[i].ownerId === me),
    autoAll: false,
  };
  engines.set(pb, e);
  return e;
}

/**
 * A weapon group's switch, as on the original's weapons display: on fires with
 * the ship, standby sits out the next volley and then turns back on, off stays
 * off until switched on again.
 */
type WeaponMode = "on" | "standby" | "off";
const NEXT_MODE: Record<WeaponMode, WeaponMode> = { on: "standby", standby: "off", off: "on" };
const MODE_LABEL: Record<WeaponMode, string> = { on: "Fire", standby: "Standby", off: "Off" };

/** What a weapon group would do against the chosen target, in words with the sim's numbers. */
function previewText(p: WeaponPreview | undefined, kind: "beam" | "other"): string {
  if (!p) return "";
  if (!p.ok) return p.why ?? "cannot fire";
  if (p.downed !== undefined) return `${p.shots} shot${p.shots === 1 ? "" : "s"}, ${p.hitPct}% to hit, about ${p.downed} shot down`;
  if (p.hitPct !== undefined) {
    const dmg = p.min === p.max ? `${p.min}` : `${p.min}-${p.max}`;
    return `${p.shots} shot${p.shots === 1 ? "" : "s"}, ${p.hitPct}% to hit, ${dmg} per hit, about ${p.expected} through shields`;
  }
  if (p.arrives !== undefined) {
    const when = p.arrives === 0 ? "strikes at once" : `reaches it in ${p.arrives} turn${p.arrives === 1 ? "" : "s"}`;
    return `${p.shots} × ${p.min} damage, ${when}`;
  }
  return kind === "beam" ? "can fire" : "in reach";
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
  const engine = engineFor(pending, session.me ?? pending.playerId);
  /** Online, against another person: they command the other side live. */
  const live = session.battle?.live ?? null;
  const reduced = useReducedMotion();
  const [asking, setAsking] = useState(engine.orders.length === 0 && !engine.outcome);
  const [, setVersion] = useState(0);
  const [steps, setSteps] = useState(() => stepsOf(pending));
  const [shown, setShown] = useState(() => steps.length);
  const [moveTo, setMoveTo] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  // Scan mode (the original's Scan button): a click on any unit shows everything about it.
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  const [confirmBlast, setConfirmBlast] = useState(false);
  // On narrow screens the unit lists open as drawers over the field.
  const [forces, setForces] = useState(false);
  // Weapon switches per unit, kept for the whole battle as in the original.
  const modes = useRef(new Map<string, Map<number, WeaponMode>>());
  const lastField = useRef<{ x: number; y: number; t: number } | null>(null);
  const [, setModeVersion] = useState(0);
  const [use3d, setUse3d] = useState(() => webglAvailable());
  const { base, decision, outcome } = engine;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const units = useMemo(() => unitInfo(base, view), [base]);
  const options = decision ? pending.battle.options(decision.unit) : null;
  const caughtUp = shown >= steps.length;
  const ours = !!decision && engine.mine.includes(decision.side);
  const yourTurn = !asking && caughtUp && ours && !!options && !engine.autoAll;

  useEffect(() => {
    const before = audio.setMood("combat");
    return () => {
      if (audio.getMood() === "combat") audio.setMood(before === "none" ? "galaxy" : before);
    };
  }, []);

  // A new turn of one of ours: the computer's pick is the starting target, and no move yet. Later orders in
  // the same unit's turn keep the target while it is still there.
  const lastUnit = useRef<string | null>(null);
  useEffect(() => {
    setMoveTo(null);
    setConfirmBlast(false);
    const same = decision?.unit === lastUnit.current;
    lastUnit.current = decision?.unit ?? null;
    if (same && target && (options?.targets.some((t) => t.key === target) || options?.flights.some((f) => f.id === target))) return;
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

  const step = (order: TacticalOrder) => {
    engine.n++;
    const next = engine.fight.next(order);
    engine.decision = next.done ? null : next.value;
    engine.outcome = next.done ? next.value : null;
    setSteps(stepsOf(pending));
    setVersion((v) => v + 1);
  };
  const send = (order: TacticalOrder) => {
    if (!engine.decision || !engine.mine.includes(engine.decision.side)) return;
    engine.orders.push(order);
    session.sendBattleStep(engine.n, order);
    step(order);
  };

  // Live: the other commander's orders arrive one by one; ours wait while it is their unit's turn.
  useEffect(() => {
    const d = engine.decision;
    if (!live || !d || engine.mine.includes(d.side)) return;
    const order = session.liveSteps.get(engine.n);
    if (order) step(order);
  });
  // Live, after "Auto-resolve": the computer takes our side as soon as our turn comes.
  useEffect(() => {
    if (engine.autoAll && engine.decision && engine.mine.includes(engine.decision.side)) send({ kind: "auto" });
  });

  const modeOf = (unit: string, mount: number): WeaponMode => modes.current.get(unit)?.get(mount) ?? "on";
  const setMode = (unit: string, mount: number, mode: WeaponMode) => {
    const m = modes.current.get(unit) ?? new Map<number, WeaponMode>();
    m.set(mount, mode);
    modes.current.set(unit, m);
    setModeVersion((v) => v + 1);
  };
  /** Weapon groups switched on that can fire at the target now. */
  const firing = (opts: UnitOptions | null, unit: string | undefined, t: string | null) =>
    !opts || !unit || !t ? [] : opts.weapons.filter((w) => w.ready && modeOf(unit, w.mount) === "on" && w.vs[t]?.ok);
  const fire = () => {
    if (!decision || !options || !target) return;
    const groups = firing(options, decision.unit, target);
    if (groups.length === 0) return;
    // Standby groups sit this volley out and then switch back on.
    for (const w of options.weapons) if (w.ready && modeOf(decision.unit, w.mount) === "standby") setMode(decision.unit, w.mount, "on");
    send({ kind: "fire", target, mounts: groups.map((w) => w.mount) });
  };
  const move = () => {
    if (!moveTo) return;
    send({ kind: "move", to: moveTo });
  };
  const done = () => send({ kind: "done" });
  const act = () => (firing(options, decision?.unit, target).length > 0 ? fire() : moveTo ? move() : done());

  const cycleTarget = (dir: 1 | -1) => {
    const list = options?.targets ?? [];
    if (list.length === 0) return;
    const i = list.findIndex((t) => t.key === target);
    const next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    setTarget(list[next]!.key);
  };
  const toggleScan = () => {
    setScanning(!scanning);
    setScanned(scanning ? null : target);
  };

  // Keys for every button that has one (shown on the buttons), plus Enter for the obvious next step.
  useEffect(() => {
    if (!yourTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "Enter") {
        if (e.target instanceof HTMLButtonElement) return;
        act();
      } else if (k === "f") fire();
      else if (k === "m") move();
      else if (k === "w") { if (decision?.canWait) send({ kind: "wait" }); }
      else if (k === "d") done();
      else if (k === "s") toggleScan();
      else if (k === "Tab") cycleTarget(e.shiftKey ? -1 : 1);
      else if (k === "Escape") {
        if (scanned || scanning) { setScanned(null); setScanning(false); }
        else if (confirmBlast) setConfirmBlast(false);
        else setMoveTo(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frames = useMemo(() => framesAt(base, steps, shown), [base, steps, shown]);
  const snap = (key: string | null | undefined) => (key ? base.ships.find((s) => s.key === key) : undefined);
  const name = (id: number) => view.players[id]?.name ?? "Unknown";
  const me = session.me ?? pending.playerId;
  const enemy = base.sides.find((s) => s !== me) ?? base.sides[1];
  const alive = (id: number) => base.ships.filter((s) => s.ownerId === id && unitAlive(frames, s.key)).length;

  const command: CommandOverlay | null = useMemo(() => {
    if (!yourTurn || !decision || !options) return null;
    const at = frames.now.get(decision.unit);
    return {
      active: decision.unit,
      targets: options.targets,
      target,
      flightTarget: options.flights.find((f) => f.id === target) ?? null,
      reach: options.reach,
      moveTo,
      onField: (x, y) => {
        if (!at || options.reach <= 0) return;
        // Past its reach the ship only gets as far as it can; show where that is.
        const d = Math.hypot(x - at.x, y - at.y);
        const k = d > options.reach ? options.reach / d : 1;
        const to = { x: Math.round((at.x + (x - at.x) * k) * 10) / 10, y: Math.round((at.y + (y - at.y) * k) * 10) / 10 };
        // A double click (or double tap) on the same spot moves there at once.
        const now = performance.now();
        const prev = lastField.current;
        if (prev && now - prev.t < DOUBLE_MS && Math.hypot(x - prev.x, y - prev.y) < DOUBLE_SQUARES) {
          lastField.current = null;
          setMoveTo(null);
          send({ kind: "move", to });
          return;
        }
        lastField.current = { x, y, t: now };
        setMoveTo(to);
      },
      onUnit: (key) => {
        if (scanning) setScanned(key);
        else if (key === decision.unit) setMoveTo(null);
        else if (options.targets.some((t) => t.key === key)) setTarget(key);
      },
    };
  }, [yourTurn, decision, options?.reach, target, moveTo, frames, scanning]);

  const liveReport = useMemo(() => ({ ...base, rounds: pending.battle.rounds.map((r) => [...r]) }), [base, steps]);
  const props = { report: base, view, units, frames, event, step: shown, reduced, resetKey: 0, command };
  const flat = <Combat2D {...props} report={liveReport} fit />;
  const active = snap(decision?.unit);
  const targetInfo = options?.targets.find((t) => t.key === target);
  const round = (steps[Math.max(0, shown - 1)]?.round ?? 0) + 1;
  const touch = isTouchDevice();
  const kbd = (k: string) => (touch ? null : <kbd>{k}</kbd>);
  const color = (id: number | undefined) => (id === undefined ? undefined : view.players[id]?.color);

  // Everything the deck shows about the unit on its turn and its target, with the sim's own numbers.
  const self = yourTurn && decision ? pending.battle.scan(decision.unit) : null;
  const aim = target ? pending.battle.scan(target) : null;
  const here = decision ? frames.now.get(decision.unit) : undefined;
  const there = target ? frames.now.get(target) : undefined;
  const range = here && there ? Math.round(Math.hypot(there.x - here.x, there.y - here.y)) : null;
  // The target may be a volley of missiles or craft in flight instead of a unit.
  const flight = options?.flights.find((f) => f.id === target);
  const flightName = (f: { count: number; weapon: string }) => `${f.count}× ${WEAPONS_BY_ID[f.weapon]?.name ?? f.weapon}`;
  const targetName = flight ? flightName(flight) : snap(target)?.name;
  // The best odds any ready weapon has against a volley, for the list of volleys in flight.
  const bestVs = (id: string) => Math.max(-1, ...(options?.weapons ?? []).map((w) => (w.ready && w.vs[id]?.ok ? w.vs[id]?.hitPct ?? -1 : -1)));
  const moveLen = here && moveTo ? Math.round(Math.hypot(moveTo.x - here.x, moveTo.y - here.y) * 10) / 10 : null;
  const groups = firing(options, decision?.unit, target);
  const volley = target ? groups.map((w) => w.vs[target]!) : [];
  const beamDamage = Math.round(volley.reduce((n, p) => n + (p.expected ?? 0), 0));
  const missiles = volley.filter((p) => p.hitPct === undefined).reduce((n, p) => n + (p.shots ?? 0), 0);
  const downed = Math.round(volley.reduce((n, p) => n + (p.downed ?? 0), 0) * 10) / 10;
  const boardTarget = options?.board.find((b) => b.key === target);
  const log = steps.slice(0, shown).map((s) => describe(base, s.e)).filter(Boolean).slice(-4);
  const strength = (id: number) => {
    let now = 0;
    let max = 0;
    for (const s of base.ships) {
      if (s.ownerId !== id) continue;
      max += s.maxHits;
      if (unitAlive(frames, s.key)) now += hpOf(s, frames.now.get(s.key)).now;
    }
    return max > 0 ? now / max : 0;
  };

  const roster = (id: number) => (
    <aside className={`cb-roster${forces ? " open" : ""}`}>
      <h4 style={{ color: color(id) }}>{id === me ? "Your forces" : name(id)}</h4>
      {units.filter((u) => u.snap.ownerId === id).map((u) => {
        const st = frames.now.get(u.snap.key);
        const alive = unitAlive(frames, u.snap.key);
        const hp = hpOf(u.snap, st);
        const t = options?.targets.find((x) => x.key === u.snap.key);
        const best = yourTurn && options && t
          ? Math.max(-1, ...options.weapons.map((w) => (w.ready && w.vs[u.snap.key]?.ok ? w.vs[u.snap.key]?.hitPct ?? -1 : -1)))
          : -1;
        const pick = () => {
          setForces(false);
          if (scanning || !t) setScanned(u.snap.key);
          else setTarget(u.snap.key);
        };
        return (
          <button key={u.snap.key} disabled={!alive}
            className={`cb-unit${u.snap.key === decision?.unit && yourTurn ? " active" : ""}${u.snap.key === target ? " selected" : ""}${alive ? "" : " dead"}`}
            onClick={pick}
            title={alive ? (t ? `Target it${t.inRange ? "" : " (no ready weapon reaches it yet)"}` : "Scan it") : st?.alive === false ? "Destroyed" : "Left the battle"}>
            <span className="cb-unit-icon" style={{ color: color(id) }}>{KIND_ICON[u.kind] ?? "▲"}</span>
            <span className="cb-unit-name">{u.snap.name}</span>
            {alive && t && <span className={`cb-chip ${t.inRange ? "good" : "muted"}`}>{best >= 0 ? `${best}% hit` : t.inRange ? "in reach" : "out of reach"}</span>}
            {!alive && <span className="cb-chip muted">{st?.alive === false ? "destroyed" : "left"}</span>}
            <Bar value={alive ? hp.now : 0} max={hp.max} />
          </button>
        );
      })}
    </aside>
  );

  return (
    <div className="modal-back cb-root">
      <div className="cb">
        <header className="cb-top">
          <div className="cb-side" style={{ color: color(me) }}>
            <span className="dot glow" style={{ background: color(me) }} /> <b>{name(me)}</b>
            <small>{alive(me)} left</small>
            <Bar value={strength(me)} max={1} title="Fleet strength left" />
          </div>
          <div className="cb-title">
            <span>Battle at {starName(view, pending.starId)}</span>
            <b>Round {round}</b>
          </div>
          <div className="cb-side right" style={{ color: color(enemy) }}>
            <Bar value={strength(enemy)} max={1} title="Fleet strength left" />
            <small>{alive(enemy)} left</small>
            <b>{name(enemy)}</b> <span className="dot glow" style={{ background: color(enemy) }} />
          </div>
          <div className="cb-tools">
            <button className="small cb-forces-toggle" onClick={() => setForces(!forces)}>{forces ? "Hide forces" : "Forces"}</button>
            {webglAvailable() && <button className="small" onClick={() => setUse3d(!use3d)}>{use3d ? "2D view" : "3D view"}</button>}
          </div>
        </header>

        {roster(me)}
        <div className="combat-field cb-field">
          {use3d ? (
            <Suspense fallback={<div className="combat-3d" />}>
              <Combat3D {...props} onFail={() => setUse3d(false)} />
            </Suspense>
          ) : flat}
          {yourTurn && options && decision && options.incoming.length > 0 && (
            <div className="cb-alerts">
              {options.incoming.map((f) => {
                // Where the planned move ends, the volley may arrive sooner.
                const soon = moveTo && f.speed > 0 && here
                  ? Math.max(1, Math.ceil(Math.max(0, Math.hypot(moveTo.x - f.x, moveTo.y - f.y) - f.radius) / f.speed))
                  : f.turns;
                const what = `${f.count}× ${WEAPONS_BY_ID[f.weapon]?.name ?? f.weapon}${f.craft ? "" : ` (${f.damage} damage each)`}`;
                const odds = bestVs(f.id);
                return (
                  <div key={f.id} className={`cb-alert ${soon < f.turns ? "bad" : "warn"}`}>
                    <b>Incoming</b> {what}, hits in {f.turns} turn{f.turns === 1 ? "" : "s"}
                    {soon < f.turns ? `; moving there it hits in ${soon}` : ""}
                    {odds >= 0 && target !== f.id && (
                      <button className="small" onClick={() => setTarget(f.id)} title="Target this volley: beams (not heavy mounts) and anti-missile rockets can shoot missiles and fighters down">
                        Shoot it down ({odds}%)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {asking && (
            <div className="command-ask">
              <h3>{name(enemy)} at {starName(view, pending.starId)}</h3>
              {live && <p><b>Live battle:</b> {name(enemy)} commands their side at the same time. You see each of their moves as they make it, and they see yours.</p>}
              <p className="muted">
                Command the battle yourself: on each of your units' turns, move it, pick a target and fire the weapon groups you
                choose, then pick another target for the rest, as often as its movement and weapons allow.
                Or let it resolve by itself; your combat doctrine (Fleets screen) then decides targets and retreat, and you can watch the replay after the turn.
              </p>
              <div className="row">
                <button className="primary" onClick={() => setAsking(false)}>Command the battle</button>
                <button onClick={() => {
                  // Against a person the battle is fought live either way: the computer takes our side.
                  if (live) { engine.autoAll = true; setAsking(false); } else session.finishBattle("auto");
                }}>Auto-resolve</button>
              </div>
              <label className="row muted" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={!!view.players[me]?.autoBattles}
                  onChange={(e) => session.setAutoBattles(e.target.checked)} />
                Always auto-resolve my battles (change it any time under Game)
              </label>
            </div>
          )}
          {scanned && (() => {
            const info = pending.battle.scan(scanned);
            return info ? <ScanPanel info={info} color={color(snap(scanned)?.ownerId)} onClose={() => setScanned(null)} /> : null;
          })()}
          {!asking && outcome && caughtUp && (
            <div className="combat-result">
              {outcome.report.winner === null ? "No winner" : <><span style={{ color: color(outcome.report.winner) }}>{name(outcome.report.winner)}</span> victorious</>}
            </div>
          )}
        </div>
        {roster(enemy)}

        {!asking && (
          <footer className="cb-deck">
            {yourTurn && active && options && decision ? (
              <>
                <section className="cb-card cb-self">
                  <div className="cb-card-head">
                    <span className="cb-label">Your turn</span>
                    <b style={{ color: color(active.ownerId) }}>{active.name}</b>
                    {self?.hullId && <span className="muted">{label(self.hullId)}</span>}
                  </div>
                  {self && <Vitals info={self} />}
                  {(self?.speed ?? 0) > 0 && (
                    <div className="cb-stat" title="Squares it can still fly this turn; turning uses some">
                      <span>Move</span>
                      <Bar value={options.reach} max={Math.max(options.reach, self?.speed ?? 0)} tone="move" />
                      <span>{Math.floor(options.reach)} / {self?.speed}</span>
                    </div>
                  )}
                  {(self?.speed ?? 0) === 0 ? (
                    <div className="cb-hint">It cannot move; it fires from where it stands.</div>
                  ) : moveTo ? (
                    <div className="row wrap">
                      <button className="primary" onClick={move} title="Fly there now; the ship can still fire and move on afterwards">
                        Move {moveLen} squares {kbd("M")}
                      </button>
                      <button className="small" onClick={() => setMoveTo(null)}>Cancel</button>
                    </div>
                  ) : options.reach > 0 ? (
                    <div className="cb-hint">{touch ? "Tap the field to aim a move, double-tap to go there." : "Click the field to aim a move, double-click to go there."}</div>
                  ) : <div className="cb-hint">No movement left this turn.</div>}
                </section>

                <section className="cb-weapons">
                  <div className="cb-card-head">
                    <span className="cb-label">Weapons</span>
                    <span className="muted">{options.weapons.length > 0 ? "tap a group to switch it Fire / Standby / Off" : "none"}</span>
                  </div>
                  <div className="cb-wgrid">
                    {options.weapons.map((w) => {
                      const mode = modeOf(decision.unit, w.mount);
                      const p = target ? w.vs[target] : undefined;
                      const live = w.ready && mode === "on" && !!p?.ok;
                      const arc = ARCS[w.arc as FiringArc]?.name ?? w.arc;
                      return (
                        <button key={w.mount} className={`cb-wtile ${mode}${live ? " live" : ""}${w.ready ? "" : " spent"}`} disabled={!w.ready}
                          onClick={() => setMode(decision.unit, w.mount, NEXT_MODE[mode])}
                          title={[`${arc} arc`, ...w.mods.map((m) => WEAPON_MODS_BY_ID[m as keyof typeof WEAPON_MODS_BY_ID]?.name ?? m),
                            "Fire: fires with the ship. Standby: sits out the next volley, then turns back on. Off: stays off until switched on."].join(". ")}>
                          <span className="cb-wtop">
                            <span className={`cb-led ${w.ready ? mode : "spent"}`} />
                            <b>{w.count}× {w.name}</b>
                            {w.mods.length > 0 && <span className="cb-mods">{w.mods.map((m) => WEAPON_MODS_BY_ID[m as keyof typeof WEAPON_MODS_BY_ID]?.abbr ?? m).join(" ")}</span>}
                            <span className="cb-mode">{w.ready ? MODE_LABEL[mode] : "Fired"}</span>
                          </span>
                          <span className="cb-wsub">
                            {arc} arc{w.shots !== null ? ` · ${w.shots} shots left` : ""}{w.second ? " · second volley ready" : ""}
                          </span>
                          {!w.ready ? (
                            <span className="cb-wnote">{p?.why ?? "not ready this turn"}</span>
                          ) : !target ? (
                            <span className="cb-wnote">Pick a target to see its odds</span>
                          ) : p?.ok && p.downed !== undefined ? (
                            <span className="cb-odds">
                              <Bar value={p.hitPct ?? 0} max={100} tone="hit" />
                              <span>{p.hitPct}% · ≈{p.downed} shot down</span>
                            </span>
                          ) : p?.ok && p.hitPct !== undefined ? (
                            <span className="cb-odds">
                              <Bar value={p.hitPct} max={100} tone="hit" />
                              <span>{p.hitPct}% · {p.min === p.max ? p.min : `${p.min}-${p.max}`}/hit · ≈{p.expected} through</span>
                            </span>
                          ) : (
                            <span className={`cb-wnote${p?.ok ? " good" : " bad"}`}>{previewText(p, "other")}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button className="primary cb-fire" onClick={fire} disabled={groups.length === 0}
                    title="Enter. Groups that cannot reach this target keep their shot for another.">
                    {groups.length === 0
                      ? (!options.weapons.some((w) => w.ready) ? "All weapons have fired this turn" : target ? "No switched-on group can hit it" : "Pick a target")
                      : <>Fire {groups.length} group{groups.length === 1 ? "" : "s"} at {targetName}
                        <small>{[beamDamage > 0 ? `about ${beamDamage} damage through shields` : "", missiles > 0 ? `${missiles} missiles or craft` : "", flight ? `about ${Math.min(flight.count, downed)} of ${flight.count} shot down` : ""].filter(Boolean).join(", ")}</small>
                        {kbd("F")}</>}
                  </button>
                </section>

                <section className="cb-card cb-target">
                  <div className="cb-card-head">
                    <span className="cb-label">Target</span>
                    <button className="small" onClick={() => cycleTarget(-1)} disabled={options.targets.length === 0} title="Previous target (Shift+Tab)">‹</button>
                    <button className="small" onClick={() => cycleTarget(1)} disabled={options.targets.length === 0} title="Next target (Tab)">›</button>
                    {aim && <b style={{ color: color(snap(target)?.ownerId) }}>{aim.name}</b>}
                    {flight && <b style={{ color: color(snap(flight.owner)?.ownerId) }}>{flightName(flight)}</b>}
                  </div>
                  {flight ? (
                    <>
                      <div className="cb-target-sub">
                        {flight.craft ? "Squadron" : flight.torpedo ? "Torpedo volley" : "Missile volley"} from {snap(flight.owner)?.name ?? "?"} at {snap(flight.target)?.name ?? "?"}
                        <span> · {flight.distance} squares away</span>
                        <span className={flight.inRange ? "good" : "warn"}> · {flight.inRange ? "in reach" : flight.torpedo ? "torpedoes cannot be shot down" : "no ready weapon reaches it"}</span>
                      </div>
                      <div className="cb-hint">
                        {flight.craft ? `${flight.count} craft` : `${flight.count} missiles, ${flight.damage} damage each`}, {flight.hp} hit points each
                        {flight.torpedo ? "" : `, beam defense ${flight.defense}`}. Each beam hit downs at most one; weaker hits add up on the same one.
                        Heavy mounts cannot track missiles; anti-missile rockets hit missiles only.
                      </div>
                    </>
                  ) : aim && targetInfo ? (
                    <>
                      <div className="cb-target-sub">
                        {aim.hullId ? label(aim.hullId) : aim.kind}
                        {range !== null && <span> · {range} squares away</span>}
                        <span className={targetInfo.inRange ? "good" : "warn"}> · {targetInfo.inRange ? "in reach" : "no ready weapon reaches it"}</span>
                      </div>
                      <Vitals info={aim} />
                      <div className="row wrap">
                        <button className="small" onClick={() => setScanned(target)}>Details</button>
                        {options.reach > 0 && options.weapons.some((w) => w.ready && w.vs[target!]?.why === "out of arc") && (
                          <button className="small" onClick={() => send({ kind: "face", target: target! })} title="Turn toward the target so more weapon arcs cover it; turning costs movement">Turn to face it</button>
                        )}
                        {boardTarget && (
                          <button className="small" onClick={() => send({ kind: "board", target: boardTarget.key })}
                            title={boardTarget.mode === 2 ? "Its marines are likely strong enough to take the ship" : "Its marines can raid the ship and wreck systems, but are unlikely to take it"}>
                            Board ({boardTarget.party} marines, {boardTarget.mode === 2 ? "capture" : "hit-and-run"})
                          </button>
                        )}
                      </div>
                      {snap(target)?.kind === "planet" && options.weapons.some((w) => w.id === "stellarConverter") && (
                        <div className="cb-hint">In battle the Stellar Converter only wears down the planet's defenses. Win the orbit and the turn asks whether to destroy the planet.</div>
                      )}
                    </>
                  ) : (
                    <div className="cb-hint">{touch ? "Tap" : "Click"} an enemy on the field or in the list to target it.</div>
                  )}
                  {options.flights.some((f) => !f.torpedo && f.id !== target) && (
                    <div className="row wrap cb-flights">
                      <span className="muted">In flight:</span>
                      {options.flights.filter((f) => !f.torpedo && f.id !== target).map((f) => {
                        const odds = bestVs(f.id);
                        return (
                          <button key={f.id} className="small" onClick={() => setTarget(f.id)}
                            title={`Target this volley flying at ${snap(f.target)?.name ?? "?"}: ${f.craft ? "craft" : `${f.damage} damage each`}, ${f.hp} hit points each`}>
                            {flightName(f)} → {snap(f.target)?.name ?? "?"}{odds >= 0 ? ` (${odds}%)` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {options.board.filter((b) => b.key !== target).map((b) => (
                    <button key={b.key} className="small" onClick={() => send({ kind: "board", target: b.key })}>
                      Board {snap(b.key)?.name ?? b.key} ({b.party} marines, {b.mode === 2 ? "capture" : "hit-and-run"})
                    </button>
                  ))}
                </section>

                <div className="cb-actions">
                  {decision.canWait && <button onClick={() => send({ kind: "wait" })} title="Act with your other ships first; this one keeps what it has left">Wait {kbd("W")}</button>}
                  <button onClick={done} title="End this unit's turn">Done {kbd("D")}</button>
                  <button className={scanning ? "primary" : ""} onClick={toggleScan}
                    title="Shows a unit's armor, shields, systems and weapons; while on, click any ship, station or planet to scan it">Scan {kbd("S")}</button>
                  {options.canSelfDestruct && (confirmBlast ? (
                    <button className="danger" onClick={() => send({ kind: "selfDestruct" })}
                      title={`The ship is lost and explodes: every unit within ${EXPLOSION.radius} squares takes damage, more the closer it is`}>
                      Confirm self-destruct
                    </button>
                  ) : (
                    <button onClick={() => setConfirmBlast(true)}
                      title={`Blow up this ship: it is lost and its explosion damages every unit within ${EXPLOSION.radius} squares, friend or foe`}>Self-destruct…</button>
                  ))}
                  {options.canRetreat && <button onClick={() => send({ kind: "retreat" })} title="The ship leaves the battle as its next turn begins">Retreat</button>}
                  <span className="spacer" />
                  <button onClick={() => send({ kind: "ai" })} title="The computer plays the rest of this ship's turn as your doctrine says">Computer plays this turn</button>
                  <button onClick={() => send({ kind: "auto" })} title="The computer fights the rest of the battle for you, following your combat doctrine">Auto-resolve the rest</button>
                </div>
              </>
            ) : outcome && caughtUp ? (
              <div className="cb-actions">
                <b>{outcome.report.winner === me ? "Victory." : outcome.report.winner === null ? "Neither side won." : "Defeat."}</b>
                <span className="spacer" />
                <button className="primary" onClick={() => session.finishBattle(engine.orders)}>Continue the turn</button>
              </div>
            ) : (
              <div className="cb-actions cb-playing">
                <div className="cb-log">
                  {log.map((l, i) => <div key={i} className={i === log.length - 1 ? "" : "muted"}>{l}</div>)}
                  {live && caughtUp && decision && !ours && <div><b>Waiting for {name(enemy)} to command their {snap(decision.unit)?.name ?? "unit"}…</b></div>}
                  {live && caughtUp && engine.autoAll && ours && <div className="muted">The computer commands your side.</div>}
                </div>
                <span className="spacer" />
                <button className="small" onClick={() => setShown(steps.length)}>Skip ahead</button>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, string> = { ship: "➤", station: "◆", planet: "●", monster: "✶" };

/** Armor and structure left (or hit points, for units without layers) and their maximum. */
function hpOf(s: { maxHits: number; maxArmor?: number; maxStructure?: number }, st: UnitState | undefined): { now: number; max: number } {
  if (!st) return { now: s.maxHits, max: s.maxHits };
  if (st.armor !== null && st.structure !== null && s.maxArmor !== undefined && s.maxStructure !== undefined) {
    return { now: st.armor + st.structure, max: s.maxArmor + s.maxStructure };
  }
  return { now: st.hits, max: s.maxHits };
}

function Bar({ value, max, tone, title }: { value: number; max: number; tone?: "hp" | "move" | "hit" | "armor" | "shield"; title?: string }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone ?? (f > 0.6 ? "hp" : f > 0.3 ? "hurt" : "low");
  return <span className={`cb-bar ${t}`} title={title}><span style={{ width: `${f * 100}%` }} /></span>;
}

/** Armor, structure and shields of a unit as bars with their numbers. */
function Vitals({ info }: { info: ScanInfo }) {
  return (
    <div className="cb-vitals">
      {info.maxArmor > 0 && <div className="cb-stat"><span>Armor</span><Bar value={info.armor} max={info.maxArmor} tone="armor" /><span>{Math.round(info.armor)} / {info.maxArmor}</span></div>}
      <div className="cb-stat"><span>Structure</span><Bar value={info.structure} max={info.maxStructure} /><span>{Math.round(info.structure)} / {info.maxStructure}</span></div>
      {info.shieldClass > 0 && (
        <div className="cb-stat" title={`Class ${info.shieldClass}: takes ${info.shieldClass} off every hit. Per facing: ${info.shields.map((v, i) => `${FACINGS[i]} ${Math.round(v)}`).join(", ")}`}>
          <span>Shields</span>
          <span className="cb-facings">{info.shields.map((v, i) => <Bar key={i} value={v} max={info.shieldMax} tone="shield" title={`${FACINGS[i]} ${Math.round(v)} / ${info.shieldMax}`} />)}</span>
          <span>{info.shieldsWork ? `class ${info.shieldClass}` : "down"}</span>
        </div>
      )}
      {info.shieldClass === 0 && <div className="cb-stat"><span>Shields</span><span className="muted">none</span><span /></div>}
    </div>
  );
}

const FACINGS = ["front", "right", "back", "left"];
const label = (id: string) => WEAPONS_BY_ID[id]?.name ?? id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** The original's ship scan: everything about one unit in the battle, with its current numbers. */
function ScanPanel({ info, color, onClose }: { info: ScanInfo; color?: string; onClose: () => void }) {
  return (
    <div className="command-ask scan-panel">
      <div className="row">
        <h3 style={{ color }}>{info.name}</h3>
        <span className="spacer" />
        <button className="small" onClick={onClose}>Close</button>
      </div>
      <div className="muted">{info.hullId ? label(info.hullId) : info.kind} · {info.crew} crew{info.marines > 0 ? ` · ${info.marines} marines` : ""}</div>
      <div className="scan-grid">
        <span>Armor</span><span>{Math.round(info.armor)} / {info.maxArmor}</span>
        <span>Structure</span><span>{Math.round(info.structure)} / {info.maxStructure}</span>
        <span>Shields</span>
        <span>
          {info.shieldClass > 0
            ? <>class {info.shieldClass} (takes {info.shieldClass} off every hit){info.shieldsWork ? "" : ", down"}; {info.shields.map((v, i) => `${FACINGS[i]} ${Math.round(v)}`).join(", ")} of {info.shieldMax}</>
            : "none"}
        </span>
        <span>Beam attack</span><span>{info.beamAttack}</span>
        <span>Beam defense</span><span>{info.beamDefense}</span>
        <span>Missile evasion</span><span>{info.missileEvasion}</span>
        <span>Speed</span><span>{info.speed} squares a turn</span>
      </div>
      {info.systems.length > 0 && (
        <div className="row wrap muted">
          {info.systems.map((x) => <span key={x.id} className={x.hp <= 0 ? "bad" : ""}>{label(x.id)} {x.hp <= 0 ? "knocked out" : `${x.hp}/${x.max}`}</span>)}
        </div>
      )}
      <div className="command-weapons">
        {info.weapons.map((w, i) => (
          <div key={i} className={`weapon-row${w.count > 0 ? "" : " faded"}`}>
            <span>{w.count}{w.count < w.maxCount ? ` of ${w.maxCount}` : ""}× {w.name}</span>
            <span className="muted">
              {[...w.mods.map((m) => WEAPON_MODS_BY_ID[m as keyof typeof WEAPON_MODS_BY_ID]?.name ?? m), `${ARCS[w.arc as FiringArc]?.name ?? w.arc} arc`].join(", ")}
              {w.shots !== null ? `, ${w.shots} shots left` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
