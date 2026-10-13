import { Tip } from "../ui/Tip";
import { governmentTip, scoreTip, taxPreview, traitTip } from "../ui/explain";
import { ALL_DOMAINS, DOMAIN_INFO, STRATEGIES, type AutomationDomain } from "@starlord/ai";
import { TAX_STEPS, empireIncome, empireTotals, empires, foodPlan, getRace, government, score, scoreBreakdown } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, signed } from "../ui/format";
import { Envoy } from "../ui/panels";
import { AnimatedNumber, useReducedMotion } from "../ui/fx";

export function EmpireScreen() {
  const { session, view, me, readOnly } = useGame();
  const race = getRace(me.raceId);
  const income = empireIncome(view, me.id);
  const totals = empireTotals(view, me.id);
  const food = foodPlan(view, me.id);
  const starving = Object.keys(food.shortfall).length;
  const on = new Set(me.automation);
  const setAuto = (domains: string[]) => session.issue({ type: "setAutomation", domains });
  const strategyOf = (d: AutomationDomain) => me.automationStrategies?.[d] ?? "balanced";
  const setStrategy = (domain: AutomationDomain, strategy: string) => session.issue({ type: "setAutomationStrategy", domain, strategy });
  const allBalanced = ALL_DOMAINS.every((d) => strategyOf(d) === "balanced");
  const still = useReducedMotion();

  return (
    <div className="grid2">
      <div className="col">
        <div className="panel col">
          <div className="row" style={{ flexWrap: "nowrap", gap: 18 }}>
            <Envoy key={me.raceId} raceId={me.raceId} color={me.color} className="empire-portrait" autoPlay={!still} />
            <div className="col" style={{ gap: 4 }}>
              <h2 className="empire-title" style={{ margin: 0 }}>{me.name}</h2>
              <div className="muted">{race.plural} · <Tip card={governmentTip(me.government)}><span className="explained">{government(me).name}</span></Tip></div>
              {race.picks.traits.length > 0 && (
                <div className="row" style={{ gap: 4 }}>
                  {race.picks.traits.map((t) => <Tip key={t} card={traitTip(t)}><span className="chip">{traitTip(t).title}</span></Tip>)}
                </div>
              )}
              <Tip card={() => scoreTip(scoreBreakdown(view, me.id))}><div><small className="muted" style={{ letterSpacing: "0.12em" }}>SCORE</small><div className="score-big explained"><AnimatedNumber value={score(view, me.id)} format={fmt} /></div></div></Tip>
            </div>
          </div>
          <table>
            <tbody>
              <tr><td>Colonies</td><td>{totals.colonies} colonies, {totals.outposts} outposts</td></tr>
              <tr><td>Population</td><td>{fmt(totals.population)}{totals.androids > 0 && <small className="muted"> and {fmt(totals.androids)} androids</small>}</td></tr>
              <tr>
                <td>Freighters</td>
                <td>
                  {food.freighters} · {food.carryingFood} carrying {fmt(food.delivered, 1)} food, {food.movingColonists} moving colonists, {food.free} idle
                  {starving > 0 && <div className="bad"><small>{starving} {starving === 1 ? "colony is" : "colonies are"} short of food by {fmt(food.needed - food.delivered, 1)}</small></div>}
                  {food.free > 0 && !readOnly && (
                    <button className="small" style={{ marginLeft: 8 }} onClick={() => session.issue({ type: "scrapFreighters", count: food.free })}>Scrap idle</button>
                  )}
                </td>
              </tr>
              <tr><td>Colony income</td><td className="bc">{signed(income.colonies, 1)} BC</td></tr>
              {income.treaties !== 0 && <tr><td>Trade treaties</td><td className={income.treaties < 0 ? "bad" : "bc"}>{signed(income.treaties, 1)} BC</td></tr>}
              {income.foodSales > 0 && <tr><td>Surplus food sold</td><td className="bc">{signed(income.foodSales, 1)} BC</td></tr>}
              <tr><td>Building upkeep</td><td>{signed(-income.maintenance, 1)} BC</td></tr>
              {income.freighters > 0 && <tr><td>Freighters in use</td><td>{signed(-income.freighters, 1)} BC</td></tr>}
              {income.projects > 0 && <tr><td>Project upkeep</td><td>{signed(-income.projects, 1)} BC</td></tr>}
              <tr><td>Leader salaries</td><td>{signed(-income.salaries, 1)} BC</td></tr>
              <tr><td>Fleet over command limit</td><td className={income.commandOverage > 0 ? "bad" : ""}>{signed(-income.commandOverage, 1)} BC</td></tr>
              <tr><td><b>Net per turn</b></td><td className={income.net < 0 ? "bad" : "good"}><b>{signed(income.net, 1)} BC</b></td></tr>
            </tbody>
          </table>
          <div className="row">
            <span>Tax rate</span>
            {TAX_STEPS.map((t) => (
              <Tip key={t} card={() => {
                const x = taxPreview(view, me.id, t);
                return { title: `${pct(t)} tax`, rows: [["BC a turn", `+${fmt(x.bc)}`], ["Industry a turn", `−${fmt(x.industry)}`]],
                  text: ["Each colony hands this share of its industry, after pollution and upkeep, to the treasury at 1 BC per point."] };
              }}>
                <button className={`small${Math.abs(me.taxRate - t) < 1e-9 ? " active" : ""}`} disabled={readOnly}
                  onClick={() => session.issue({ type: "setTaxRate", rate: t })}>{pct(t)}</button>
              </Tip>
            ))}
          </div>
          <small className="muted">Taxes turn a share of every colony's industry into BC: now +{fmt(taxPreview(view, me.id, me.taxRate).bc)} BC for −{fmt(taxPreview(view, me.id, me.taxRate).industry)} industry a turn.</small>
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
          <button className="small" disabled={readOnly || allBalanced} title="Set every area's strategy to Balanced"
            onClick={() => session.issue(...ALL_DOMAINS.filter((d) => strategyOf(d) !== "balanced").map((domain) => ({ type: "setAutomationStrategy" as const, domain, strategy: "balanced" })))}>
            All balanced
          </button>
        </div>
        <div className="muted">
          Hand any part of running your empire to the same advisors the computer empires use.
          Automated areas are played for you when you end the turn; you can still step in at any time.
          Each area follows a strategy; Balanced plays like the computer empires.
          Your choices carry over to your next game; Nothing and All balanced go back to the defaults.
        </div>
        {ALL_DOMAINS.map((d) => {
          const strategy = STRATEGIES[d].find((s) => s.id === strategyOf(d)) ?? STRATEGIES[d][0]!;
          return (
            <div key={d} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <label className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", flex: 1, minWidth: 0 }}>
                <input type="checkbox" className="switch" checked={on.has(d)} disabled={readOnly}
                  onChange={(e) => setAuto(e.target.checked ? [...me.automation, d] : me.automation.filter((x) => x !== d))} />
                <span>
                  <b>{DOMAIN_INFO[d].name}</b>
                  <br />
                  <small className="muted">{DOMAIN_INFO[d].description}</small>
                  {strategy.id !== "balanced" && (
                    <>
                      <br />
                      <small><b>{strategy.name}:</b> {strategy.description}</small>
                    </>
                  )}
                </span>
              </label>
              <select className="strategy-select" value={strategy.id} disabled={readOnly} aria-label={`${DOMAIN_INFO[d].name} strategy`}
                title={strategy.description} onChange={(e) => setStrategy(d, e.target.value)}>
                {STRATEGIES[d].map((s) => <option key={s.id} value={s.id} title={s.description}>{s.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
