import { ALL_DOMAINS, DOMAIN_INFO } from "@starlord/ai";
import { TAX_STEPS, empireIncome, empireTotals, empires, getRace, government, score } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, signed } from "../ui/format";
import { Portrait } from "../ui/panels";

export function EmpireScreen() {
  const { session, view, me, readOnly } = useGame();
  const race = getRace(me.raceId);
  const income = empireIncome(view, me.id);
  const totals = empireTotals(view, me.id);
  const on = new Set(me.automation);
  const setAuto = (domains: string[]) => session.issue({ type: "setAutomation", domains });

  return (
    <div className="grid2">
      <div className="col">
        <div className="panel col">
          <div className="row">
            <Portrait raceId={me.raceId} size={72} />
            <div>
              <h2 style={{ margin: 0 }}>{me.name}</h2>
              <div className="muted">{race.plural} · {government(me).name}</div>
              <div>Score {fmt(score(view, me.id))}</div>
            </div>
          </div>
          <table>
            <tbody>
              <tr><td>Colonies</td><td>{totals.colonies} colonies, {totals.outposts} outposts</td></tr>
              <tr><td>Population</td><td>{fmt(totals.population)}</td></tr>
              <tr><td>Colony income</td><td className="bc">{signed(income.colonies, 1)} BC</td></tr>
              <tr><td>Building upkeep</td><td>{signed(-income.maintenance, 1)} BC</td></tr>
              <tr><td>Leader salaries</td><td>{signed(-income.salaries, 1)} BC</td></tr>
              <tr><td>Fleet over command limit</td><td className={income.commandOverage > 0 ? "bad" : ""}>{signed(-income.commandOverage, 1)} BC</td></tr>
              <tr><td><b>Net per turn</b></td><td className={income.net < 0 ? "bad" : "good"}><b>{signed(income.net, 1)} BC</b></td></tr>
            </tbody>
          </table>
          <div className="row">
            <span>Tax rate</span>
            {TAX_STEPS.map((t) => (
              <button key={t} className={`small${Math.abs(me.taxRate - t) < 1e-9 ? " active" : ""}`} disabled={readOnly}
                onClick={() => session.issue({ type: "setTaxRate", rate: t })}>{pct(t)}</button>
            ))}
          </div>
          <small className="muted">Taxes turn a share of every colony's industry into BC.</small>
        </div>
        {readOnly && (
          <div className="panel">
            <h3>Standings</h3>
            <table>
              <thead><tr><th>Empire</th><th>Score</th><th>Pop</th><th>Colonies</th><th>Techs</th></tr></thead>
              <tbody>
                {empires(view).map((p) => {
                  const t = empireTotals(view, p.id);
                  return (
                    <tr key={p.id} style={{ opacity: p.alive ? 1 : 0.5 }}>
                      <td><span className="dot" style={{ background: p.color, marginRight: 6 }} />{p.name}</td>
                      <td>{fmt(score(view, p.id))}</td>
                      <td>{fmt(t.population)}</td>
                      <td>{t.colonies}+{t.outposts}</td>
                      <td>{p.techs.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel col">
        <div className="row">
          <h2 style={{ margin: 0 }}>Automation</h2>
          <span className="spacer" />
          <button className="small" disabled={readOnly} onClick={() => setAuto([...ALL_DOMAINS])}>Automate everything</button>
          <button className="small" disabled={readOnly} onClick={() => setAuto([])}>Nothing</button>
        </div>
        <div className="muted">
          Hand any part of running your empire to the same advisors the computer empires use.
          Automated areas are played for you when you end the turn; you can still step in at any time.
        </div>
        {ALL_DOMAINS.map((d) => (
          <label key={d} className="row" style={{ alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <input type="checkbox" checked={on.has(d)} disabled={readOnly}
              onChange={(e) => setAuto(e.target.checked ? [...me.automation, d] : me.automation.filter((x) => x !== d))} />
            <span>
              <b>{DOMAIN_INFO[d].name}</b>
              <br />
              <small className="muted">{DOMAIN_INFO[d].description}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
