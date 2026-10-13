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
import { describe, framesAt, unitAlive, unitInfo, type CommandOverlay, type ReplayStep } from "./combat/replayModel";

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
  const engine = engineFor(pending);
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
  const yourTurn = !asking && caughtUp && !!decision && !!options;

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
    if (same && target && options?.targets.some((t) => t.key === target)) return;
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
                Command the battle yourself: on each of your units' turns, move it, pick a target and fire the weapon groups you
                choose, then pick another target for the rest, as often as its movement and weapons allow.
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
          {scanned && (() => {
            const info = pending.battle.scan(scanned);
            return info ? <ScanPanel info={info} color={view.players[snap(scanned)?.ownerId ?? -1]?.color} onClose={() => setScanned(null)} /> : null;
          })()}
          {!asking && outcome && caughtUp && (
            <div className="combat-result">
              {outcome.report.winner === null ? "No winner" : <><span style={{ color: view.players[outcome.report.winner]?.color }}>{name(outcome.report.winner)}</span> victorious</>}
            </div>
          )}
        </div>
        {!asking && (
          <div className="command-panel">
            {yourTurn && active && options && decision ? (
              <>
                <div className="row wrap">
                  <b style={{ color: view.players[active.ownerId]?.color }}>{active.name}</b>
                  <span className="muted">
                    {options.reach > 0 ? `${Math.floor(options.reach)} squares of movement left (turning uses some)` : "no movement left"}
                  </span>
                  <span className="spacer" />
                  {moveTo ? (
                    <>
                      <span className="muted">To {Math.round(moveTo.x)}, {Math.round(moveTo.y)}</span>
                      <button onClick={move} title="Fly there now; the ship can still fire and move on afterwards">Move here</button>
                      <button className="small" onClick={() => setMoveTo(null)}>Cancel</button>
                    </>
                  ) : options.reach > 0 ? <span className="muted">Click the field to plan a move, or double-click to move there now</span> : null}
                </div>
                <div className="row wrap">
                  <span>Target:</span>
                  <select value={target ?? ""} onChange={(e) => setTarget(e.target.value || null)}>
                    <option value="">None</option>
                    {options.targets.map((t) => (
                      <option key={t.key} value={t.key}>{snap(t.key)?.name ?? t.key}{t.inRange ? "" : " (no ready weapon reaches it)"}</option>
                    ))}
                  </select>
                  {targetInfo && <span className={targetInfo.inRange ? "good" : "muted"}>{targetInfo.inRange ? "in reach" : "no ready weapon reaches it: move or turn"}</span>}
                  {target && options.reach > 0 && options.weapons.some((w) => w.ready && w.vs[target]?.why === "out of arc") && (
                    <button className="small" onClick={() => send({ kind: "face", target })} title="Turn toward the target; turning costs movement">Turn to face it</button>
                  )}
                </div>
                {snap(target)?.kind === "planet" && options.weapons.some((w) => w.id === "stellarConverter") && (
                  <div className="row muted">
                    In battle the Stellar Converter only wears down the planet's defenses. Win the orbit and the turn asks whether to destroy the planet.
                  </div>
                )}
                {options.incoming.length > 0 && (
                  <div className="row wrap command-incoming">
                    {options.incoming.map((f) => {
                      const at = frames.now.get(decision.unit);
                      // Where the planned move ends, the volley may arrive sooner.
                      const there = moveTo && f.speed > 0 && at
                        ? Math.max(1, Math.ceil(Math.max(0, Math.hypot(moveTo.x - f.x, moveTo.y - f.y) - f.radius) / f.speed))
                        : f.turns;
                      const what = `${f.count}× ${WEAPONS_BY_ID[f.weapon]?.name ?? f.weapon}${f.craft ? "" : ` (${f.damage} damage each)`}`;
                      return (
                        <span key={f.id} className={there < f.turns ? "bad" : "warn"}>
                          Incoming: {what}, hits in {f.turns} turn{f.turns === 1 ? "" : "s"}
                          {there < f.turns ? `; moving there it hits in ${there}` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="command-weapons">
                  {options.weapons.length === 0 ? <span className="muted">No weapons</span> : options.weapons.map((w) => {
                    const mode = modeOf(decision.unit, w.mount);
                    const p = target ? w.vs[target] : undefined;
                    const live = w.ready && mode === "on" && !!p?.ok;
                    return (
                      <div key={w.mount} className={`weapon-row${live ? "" : " faded"}`}>
                        <button className={`small weapon-mode ${mode}`} disabled={!w.ready}
                          onClick={() => setMode(decision.unit, w.mount, NEXT_MODE[mode])}
                          title="Fire: fires with the ship. Standby: sits out the next volley, then turns back on. Off: stays off until switched on.">
                          {MODE_LABEL[mode]}
                        </button>
                        <span title={[`${ARCS[w.arc as FiringArc]?.name ?? w.arc} arc`, ...w.mods.map((m) => WEAPON_MODS_BY_ID[m as keyof typeof WEAPON_MODS_BY_ID]?.name ?? m)].join(", ")}>
                          {w.count}× {w.name}
                          {w.mods.length > 0 && ` ${w.mods.map((m) => WEAPON_MODS_BY_ID[m as keyof typeof WEAPON_MODS_BY_ID]?.abbr ?? m).join(" ")}`}
                          {` · ${ARCS[w.arc as FiringArc]?.name ?? w.arc}`}
                          {w.shots !== null ? ` (${w.shots} shots)` : ""}
                        </span>
                        <span className="muted">
                          {!w.ready ? (p?.why ?? "not ready this turn") : w.second ? "second volley ready · " : ""}
                          {w.ready && target ? previewText(p, w.vs[target]?.hitPct !== undefined ? "beam" : "other") : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="row wrap">
                  {(() => {
                    const n = firing(options, decision.unit, target).length;
                    return (
                      <button className="primary" onClick={fire} disabled={n === 0} title="Enter. Groups that cannot reach this target keep their shot for another.">
                        {n === 0 ? "Nothing to fire" : `Fire ${n} group${n === 1 ? "" : "s"} at ${snap(target)?.name ?? "target"}`}
                      </button>
                    );
                  })()}
                  {options.board.map((b) => (
                    <button key={b.key} onClick={() => send({ kind: "board", target: b.key })}
                      title={b.mode === 2 ? "Its marines are likely strong enough to take the ship" : "Its marines can raid the ship and wreck systems, but are unlikely to take it"}>
                      Board {snap(b.key)?.name ?? b.key} ({b.party} marines, {b.mode === 2 ? "capture" : "hit-and-run"})
                    </button>
                  ))}
                  {decision.canWait && <button onClick={() => send({ kind: "wait" })} title="Act with your other ships first; this one keeps what it has left">Wait</button>}
                  <button onClick={done} title={firing(options, decision.unit, target).length === 0 ? "Enter" : undefined}>Done</button>
                  <button className={scanning ? "primary" : ""} onClick={() => { setScanning(!scanning); setScanned(scanning ? null : target); }}
                    title="Shows the target's armor, shields, systems and weapons; while on, click any ship, station or planet to scan it">Scan</button>
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
                  <button onClick={() => send({ kind: "ai" })} title="The computer plays the rest of this ship's turn as your doctrine says">Computer plays this turn</button>
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
