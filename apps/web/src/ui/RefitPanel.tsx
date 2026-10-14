import { useState } from "react";
import {
  MAX_QUEUE, findDesign, outdatedBy, refitCost, refitDocks, refitTargets, refitTurns, refittable, validateCommand, type Colony, type Fleet, type ShipDesign,
} from "@starlord/sim";
import { useGame } from "./hooks";
import { refitTip } from "./explain";
import { Tip } from "./Tip";
import { fmt } from "./format";

/**
 * Picks the design a fleet's ships of one design are refitted to, and the
 * colony in their system that does the job, with the cost and time.
 */
export function RefitPicker({ fleet, designId, count, onDone, initialTarget }: {
  fleet: Fleet;
  designId: string;
  count: number;
  onDone: () => void;
  initialTarget?: string;
}) {
  const { session, view, me, readOnly } = useGame();
  const from = findDesign(me, designId);
  const targets = refitTargets(view, me.id, designId);
  // Outdated ships default to the newest version of their own design.
  const preferred = initialTarget ?? outdatedBy(me, designId)?.id;
  const [targetId, setTargetId] = useState(preferred && targets.some((d) => d.id === preferred) ? preferred : targets.at(-1)?.id ?? "");
  const to = targets.find((d) => d.id === targetId);
  const anyDock = fleet.starId ? refitDocks(view, me.id, fleet.starId) : [];
  const docks = fleet.starId && to ? refitDocks(view, me.id, fleet.starId, to) : [];
  const [colonyId, setColonyId] = useState<string>("");
  const colony = docks.find((c) => c.id === colonyId) ?? docks[0];
  if (!refittable(from)) return <div className="muted">Colony, outpost and troop ships cannot be refitted.</div>;
  if (!fleet.starId) return <div className="muted">Ships can only be refitted in orbit.</div>;
  if (anyDock.length === 0) return <div className="muted">Refits need one of your colonies in this system, one that can build ships.</div>;
  if (targets.length === 0) return <div className="muted">No other design of the {from.hull} hull to refit to. Save one in the ship designer first.</div>;
  const cost = to ? refitCost(me, from, to) : 0;
  const turns = colony ? refitTurns(view, colony, cost) : null;
  const cmd = to && colony
    ? { type: "refitShips" as const, fleetId: fleet.id, designId, toDesignId: to.id, colonyId: colony.id, count }
    : null;
  const check = cmd ? validateCommand(view, me.id, cmd) : null;
  return (
    <div className="col" style={{ gap: 4, border: "1px solid var(--line)", borderRadius: 6, padding: 6 }}>
      <div className="row">
        <b>Refit {count} × {from.name}</b>
        <span className="spacer" />
        <button className="small" onClick={onDone} aria-label="Close refit">✕</button>
      </div>
      <label>To <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        {targets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select></label>
      {to && docks.length === 0 && <div className="bad">A {to.hull} refit needs an orbital station at a colony in this system.</div>}
      {docks.length > 1 && (
        <label>At <select value={colony?.id ?? ""} onChange={(e) => setColonyId(e.target.value)}>
          {docks.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.queue.length}/{MAX_QUEUE} queued)</option>)}
        </select></label>
      )}
      {to && colony && (
        <Tip block card={() => refitTip(me, from, to, turns)}>
          <div className="explained">
            {fmt(cost)} production each{count > 1 ? `, ${fmt(cost * count)} in all` : ""} at {colony.name} · {turns === null ? "no industry there" : `about ${turns} turn${turns === 1 ? "" : "s"}`}
          </div>
        </Tip>
      )}
      {check && !check.ok && <div className="bad">{check.reason}</div>}
      <Tip card={{ title: "Refit", text: ["The ships leave this fleet and wait in dock until the job in the colony's build queue is done; then they rejoin this fleet if it is still here."], note: "Removing the job from the queue scraps the ship." }}>
        <button className="primary small" disabled={readOnly || !cmd || !check?.ok}
          onClick={() => { if (cmd) session.issue(cmd); onDone(); }}>
          Refit {count}
        </button>
      </Tip>
    </div>
  );
}

/** Ships of yours that could be refitted, each with a count and a Refit button. */
function StackRefitList({ stacks, initialTarget }: { stacks: { fleet: Fleet; designId: string; count: number }[]; initialTarget?: string }) {
  const { view, me } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  return (
    <div className="col" style={{ gap: 4 }}>
      {stacks.map(({ fleet, designId, count }) => {
        const key = `${fleet.id}|${designId}`;
        const n = Math.max(1, Math.min(count, counts[key] ?? 1));
        const star = view.galaxy.stars.find((s) => s.id === fleet.starId);
        return (
          <div key={key} className="col" style={{ gap: 2 }}>
            <div className="row">
              <span style={{ flex: 1 }}>{findDesign(me, designId)?.name ?? designId} × {count} <small className="muted">{fleet.name}{star ? ` at ${star.name}` : ""}</small></span>
              {count > 1 && (
                <input type="number" min={1} max={count} value={n} style={{ width: 48 }} aria-label="Ships to refit"
                  onChange={(e) => setCounts({ ...counts, [key]: Number(e.target.value) })} />
              )}
              <button className={`small${open === key ? " active" : ""}`} title="Choose the design and colony for the refit, with its cost and time."
                onClick={() => setOpen(open === key ? null : key)}>Refit</button>
            </div>
            {open === key && <RefitPicker fleet={fleet} designId={designId} count={n} initialTarget={initialTarget} onDone={() => setOpen(null)} />}
          </div>
        );
      })}
    </div>
  );
}

/** The original's Refit button on a colony: every ship of yours in its system that it could refit. */
export function ColonyRefits({ colony }: { colony: Colony }) {
  const { view, me } = useGame();
  const starId = view.planets[colony.planetId]?.starId;
  if (!starId || colony.outpost) return null;
  const stacks = Object.values(view.fleets)
    .filter((f) => f.ownerId === me.id && f.starId === starId)
    .flatMap((fleet) => fleet.ships
      .filter((s) => refittable(findDesign(me, s.designId)) && refitTargets(view, me.id, s.designId).length > 0)
      .map((s) => ({ fleet, designId: s.designId, count: s.count })));
  if (stacks.length === 0) return null;
  return (
    <div className="col" style={{ gap: 4 }}>
      <h4>Refit ships in orbit</h4>
      <StackRefitList stacks={stacks} />
    </div>
  );
}

/** Ships of other designs of this design's hull, in orbit where one of your colonies could refit them to it. */
export function DesignRefits({ design }: { design: ShipDesign }) {
  const { view, me } = useGame();
  const stacks = Object.values(view.fleets)
    .filter((f) => f.ownerId === me.id && f.starId && refitDocks(view, me.id, f.starId, design).length > 0)
    .flatMap((fleet) => fleet.ships
      .filter((s) => refitTargets(view, me.id, s.designId).some((d) => d.id === design.id))
      .map((s) => ({ fleet, designId: s.designId, count: s.count })));
  if (stacks.length === 0) return <div className="muted">No ships of another {design.hull} design are in orbit where a colony of yours could refit them.</div>;
  return <StackRefitList stacks={stacks} initialTarget={design.id} />;
}
