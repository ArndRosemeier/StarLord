import type { ReactNode } from "react";
import { MAX_LEADERS, type Leader } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, words } from "../ui/format";
import { LeaderPortrait } from "../ui/panels";

function Skills({ l }: { l: Leader }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {Object.entries(l.skills).map(([k, v]) => <span key={k} className="chip">{words(k)} +{v}</span>)}
    </span>
  );
}

function LeaderCard({ l, children }: { l: Leader; children: ReactNode }) {
  return (
    <div className="leader-card">
      <LeaderPortrait name={l.name} />
      <div className="col" style={{ gap: 4, minWidth: 0 }}>
        <div><b>{l.name}</b> <small className="muted">lvl {l.level} {words(l.kind)}</small></div>
        <Skills l={l} />
        {children}
      </div>
    </div>
  );
}

export function LeadersScreen() {
  const { session, view, me, readOnly } = useGame();
  const hired = Object.values(view.leaders).filter((l) => l.ownerId === me.id);
  const systems = [...new Set(Object.values(view.colonies).filter((c) => c.ownerId === me.id).map((c) => view.planets[c.planetId]!.starId))]
    .map((id) => view.galaxy.stars.find((s) => s.id === id)!)
    .filter(Boolean);
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);

  return (
    <div className="col" style={{ maxWidth: 1100 }}>
      <div className="panel col">
        <h2>Leaders <small className="muted">{hired.length}/{MAX_LEADERS}</small></h2>
        <div className="muted">Administrators boost every colony in the system they govern. Captains boost the fleet they command. Each draws a salary in BC.</div>
        <div className="leader-grid">
          {hired.map((l) => (
            <LeaderCard key={l.id} l={l}>
              <small className="muted">{l.salary} BC per turn</small>
              <div className="row" style={{ gap: 4 }}>
                <select value={l.assignedTo ?? ""} disabled={readOnly} style={{ flex: 1, minWidth: 0 }}
                  onChange={(e) => session.issue({ type: "assignLeader", leaderId: l.id, targetId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {l.kind === "administrator"
                    ? systems.map((s) => <option key={s.id} value={s.id}>{s.name} system</option>)
                    : fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="small danger" disabled={readOnly} onClick={() => confirm(`Dismiss ${l.name}?`) && session.issue({ type: "dismissLeader", leaderId: l.id })}>Dismiss</button>
              </div>
            </LeaderCard>
          ))}
        </div>
        {hired.length === 0 && <div className="muted">No leaders in your service.</div>}
      </div>
      <div className="panel col">
        <h3>Offers</h3>
        <div className="leader-grid">
          {me.leaderOffers.map((l) => (
            <LeaderCard key={l.id} l={l}>
              <small className="muted">Available until turn {l.availableUntil}</small>
              <div>
                <button className="small primary" disabled={readOnly || me.bc < l.hireCost || hired.length >= MAX_LEADERS}
                  onClick={() => session.issue({ type: "hireLeader", leaderId: l.id })}>
                  Hire for {fmt(l.hireCost)} BC
                </button>
              </div>
            </LeaderCard>
          ))}
        </div>
        {me.leaderOffers.length === 0 && <div className="muted">Nobody is offering their services right now.</div>}
      </div>
    </div>
  );
}
