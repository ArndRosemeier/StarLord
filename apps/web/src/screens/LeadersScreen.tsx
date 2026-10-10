import { MAX_LEADERS, type Leader } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, words } from "../ui/format";

function Skills({ l }: { l: Leader }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {Object.entries(l.skills).map(([k, v]) => <span key={k} className="chip">{words(k)} +{v}</span>)}
    </span>
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
    <div className="col" style={{ maxWidth: 1000 }}>
      <div className="panel col">
        <h2>Leaders <small className="muted">{hired.length}/{MAX_LEADERS}</small></h2>
        <div className="muted">Administrators boost every colony in the system they govern. Captains boost the fleet they command. Each draws a salary in BC.</div>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Skills</th><th>Salary</th><th>Assignment</th><th /></tr></thead>
          <tbody>
            {hired.map((l) => (
              <tr key={l.id}>
                <td>{l.name} <small className="muted">lvl {l.level}</small></td>
                <td>{words(l.kind)}</td>
                <td><Skills l={l} /></td>
                <td>{l.salary} BC</td>
                <td>
                  <select value={l.assignedTo ?? ""} disabled={readOnly}
                    onChange={(e) => session.issue({ type: "assignLeader", leaderId: l.id, targetId: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {l.kind === "administrator"
                      ? systems.map((s) => <option key={s.id} value={s.id}>{s.name} system</option>)
                      : fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </td>
                <td><button className="small danger" disabled={readOnly} onClick={() => confirm(`Dismiss ${l.name}?`) && session.issue({ type: "dismissLeader", leaderId: l.id })}>Dismiss</button></td>
              </tr>
            ))}
            {hired.length === 0 && <tr><td colSpan={6} className="muted">No leaders in your service.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel col">
        <h3>Offers</h3>
        <table>
          <tbody>
            {me.leaderOffers.map((l) => (
              <tr key={l.id}>
                <td>{l.name} <small className="muted">lvl {l.level}</small></td>
                <td>{words(l.kind)}</td>
                <td><Skills l={l} /></td>
                <td className="muted">until turn {l.availableUntil}</td>
                <td>
                  <button className="small primary" disabled={readOnly || me.bc < l.hireCost || hired.length >= MAX_LEADERS}
                    onClick={() => session.issue({ type: "hireLeader", leaderId: l.id })}>
                    Hire for {fmt(l.hireCost)} BC
                  </button>
                </td>
              </tr>
            ))}
            {me.leaderOffers.length === 0 && <tr><td className="muted">Nobody is offering their services right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
