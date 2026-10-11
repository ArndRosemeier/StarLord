import { useEffect, useState } from "react";
import { DEBUG, EVENTS, population, type DebugAction, type EventId } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { Simulator } from "./Simulator";

const words = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/**
 * Cheats for trying out the game's systems, offered in games started with
 * Ctrl+Alt held. Each button queues a debug order: most show at once, builds
 * and research finish and raids and events strike when the turn ends.
 */
export function DebugMenu({ onClose }: { onClose: () => void }) {
  const { session, view, me } = useGame();
  const myColonies = Object.values(view.colonies).filter((c) => c.ownerId === me.id && !c.outpost);
  const designs = me.designs.filter((d) => !d.fixed && !d.obsolete);
  const stars = view.galaxy.stars.filter((s) => me.explored.includes(s.id));
  const events = (Object.keys(EVENTS) as EventId[]).filter((id) => !EVENTS[id].disabled && (!EVENTS[id].monster || view.settings.monsters));

  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [count, setCount] = useState(5);
  const [starId, setStarId] = useState(me.homeStarId);
  const [colonyId, setColonyId] = useState(myColonies[0]?.id ?? "");
  const [pop, setPop] = useState(10);
  const [event, setEvent] = useState<EventId>(events[0]!);
  const [simulator, setSimulator] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (action: DebugAction) => session.issue({ type: "debug", action });
  const colony = view.colonies[colonyId];

  if (simulator) {
    return (
      <div className="modal-back" onClick={onClose}>
        <div className="modal debug-menu sim-modal" role="dialog" aria-label="Game simulator" onClick={(e) => e.stopPropagation()}>
          <div className="whats-new-head">
            <h2>Game simulator</h2>
            <div className="row">
              <button onClick={() => setSimulator(false)}>Back</button>
              <button onClick={onClose} aria-label="Close">Close</button>
            </div>
          </div>
          <Simulator />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal debug-menu" role="dialog" aria-label="Debug menu" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new-head">
          <h2>Debug menu</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="muted">Each button adds an order to this turn, so Undo takes it back. Builds, research, raids and events happen when you end the turn.</p>
        {session.rejected.some((r) => r.startsWith("debug")) && (
          <div className="panel bad">{session.rejected.filter((r) => r.startsWith("debug")).join("; ")}</div>
        )}

        <section>
          <h3>Simulator</h3>
          <div className="row debug-row">
            <button className="primary" onClick={() => setSimulator(true)}>Open the game simulator</button>
            <small className="muted">plays whole computer-only games in the background and reports how they ended and anything that broke; your game is untouched</small>
          </div>
        </section>

        <section>
          <h3>Technology</h3>
          <div className="row debug-row">
            <button className="primary" onClick={() => run({ kind: "unlockTechs" })}>Unlock the full tech tree</button>
            <button onClick={() => run({ kind: "unlockTechs", xenon: true })}>…plus Vexari tech</button>
            <button onClick={() => run({ kind: "finishResearch" })} disabled={!me.research.tierId}>Finish current research</button>
            {DEBUG.researchSteps.map((n) => <button key={n} onClick={() => run({ kind: "addResearch", amount: n })}>+{fmt(n)} RP</button>)}
          </div>
        </section>

        <section>
          <h3>Economy</h3>
          <div className="row debug-row">
            {DEBUG.bcSteps.map((n) => <button key={n} onClick={() => run({ kind: "addBc", amount: n })}>+{fmt(n)} BC</button>)}
            <button onClick={() => run({ kind: "finishBuilds" })}>Finish every build this turn</button>
          </div>
          {colony && (
            <div className="row debug-row">
              <select value={colonyId} onChange={(e) => setColonyId(e.target.value)}>
                {myColonies.map((c) => <option key={c.id} value={c.id}>{c.name} ({population(c)})</option>)}
              </select>
              <input type="number" min={1} max={99} value={pop} onChange={(e) => setPop(Math.max(1, Math.floor(Number(e.target.value) || 1)))} style={{ width: 64 }} />
              <button onClick={() => run({ kind: "setPopulation", colonyId, population: pop })}>Set population</button>
              <small className="muted">capped at the planet's maximum</small>
            </div>
          )}
        </section>

        <section>
          <h3>Galaxy</h3>
          <div className="row debug-row">
            <button onClick={() => run({ kind: "revealMap" })}>Explore every system</button>
            <button onClick={() => run({ kind: "meetAll" })}>Meet every empire</button>
          </div>
        </section>

        <section>
          <h3>Ships</h3>
          {designs.length > 0 ? (
            <div className="row debug-row">
              <input type="number" min={1} max={DEBUG.maxSpawn} value={count} onChange={(e) => setCount(Math.min(DEBUG.maxSpawn, Math.max(1, Math.floor(Number(e.target.value) || 1))))} style={{ width: 64 }} />
              <select value={designId} onChange={(e) => setDesignId(e.target.value)}>
                {designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <span>at</span>
              <select value={starId} onChange={(e) => setStarId(e.target.value)}>
                {stars.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={() => run({ kind: "spawnShips", designId, count, starId })}>Spawn</button>
            </div>
          ) : <p className="muted">No ship designs yet.</p>}
        </section>

        <section>
          <h3>Threats</h3>
          <div className="row debug-row">
            <button onClick={() => run({ kind: "raid" })} disabled={!view.settings.raiders || view.raiders.defeated}>Vexari raid on me this turn</button>
            <select value={event} onChange={(e) => setEvent(e.target.value as EventId)}>
              {events.map((id) => <option key={id} value={id}>{words(id)}</option>)}
            </select>
            <button onClick={() => run({ kind: "event", event })}>Trigger event</button>
          </div>
        </section>
      </div>
    </div>
  );
}
