import { Tip } from "../ui/Tip";
import { techTip } from "../ui/explain";
import { techSummary } from "../help/articles";
import { useState } from "react";
import {
  FIELD_NAMES, PICK_OPTIONS, RESEARCH, TECHS, TECH_FIELDS, TECH_TIERS, TIERS_BY_ID, TRAIT_COSTS, availableTiers, getRace,
  hasTrait, hyperLevel, learnsWholeField, mutationCost, nextBreakthroughChance, researchCost, researchOptions, type NumericPick, type Player, type RacePicks,
  type RaceTrait,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { researchPerTurn } from "./GameShell";
import { useHelp } from "../help/HelpDialog";
import { ProgressRing } from "../ui/panels";

/** Colour and glyph per field of science. */
const FIELD_LOOK: Record<string, { color: string; glyph: string }> = {
  construction: { color: "#ff9f43", glyph: "\u2692\uFE0E" },
  power: { color: "#ffd32a", glyph: "\u26A1\uFE0E" },
  chemistry: { color: "#7ed957", glyph: "\u2697\uFE0E" },
  sociology: { color: "#ff7ab6", glyph: "\u2696\uFE0E" },
  computers: { color: "#3ee8ff", glyph: "\u232C\uFE0E" },
  biology: { color: "#4fd18b", glyph: "\u2766\uFE0E" },
  physics: { color: "#a78bfa", glyph: "\u269B\uFE0E" },
  forceFields: { color: "#5b9dff", glyph: "\u26E8\uFE0E" },
};

export function ResearchScreen() {
  const { session, view, me, readOnly } = useGame();
  const openHelp = useHelp();
  const rpt = researchPerTurn(view);
  const current = me.research.tierId ? TIERS_BY_ID[me.research.tierId] : undefined;
  const open = new Set(availableTiers(view, me.id));
  const race = getRace(me.raceId);
  const creative = hasTrait(race, "creative");
  // As in MoO2: turns until the points pass the cost, then a chance each turn that climbs to certain at twice the cost.
  const cost = current ? researchCost(me, current) : 0;
  const chance = nextBreakthroughChance(me, rpt);
  const eta = current && rpt > 0 ? Math.max(1, Math.floor((cost - me.research.progress) / rpt) + 1) : null;

  return (
    <div className="col">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Research</h2>
          <span className="research">{fmt(rpt, 1)} points per turn</span>
          {creative && <span className="chip good">Creative: learns every application of a field</span>}
          {hasTrait(race, "uncreative") && <span className="chip bad">Uncreative: learns one random application per field</span>}
          <span className="spacer" />
          <button className="small" onClick={() => openHelp("page:techTree")}>Full tech tree</button>
        </div>
        {current ? (
          <div className="research-now" style={{ marginTop: 8 }}>
            <ProgressRing value={me.research.progress} max={cost} size={124} color={FIELD_LOOK[current.field]?.color}>
              {chance > 0
                ? <><b>{Math.round(chance * 100)}%</b><small>chance this turn</small></>
                : <><b>{Math.floor((me.research.progress / cost) * 100)}%</b>{eta !== null ? <small>chance in {eta} turn{eta === 1 ? "" : "s"}</small> : <small>no research</small>}</>}
            </ProgressRing>
            <div className="col" style={{ gap: 4, flex: 1 }}>
              <small className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}>Now researching</small>
              <div style={{ fontSize: 18 }}>
                <b>{current.name}</b> <span className="muted">({FIELD_NAMES[current.field]})</span>
              </div>
              {me.research.techChoice && <div>Goal: <b style={{ color: FIELD_LOOK[current.field]?.color }}>{TECHS[me.research.techChoice]?.name}</b> <span className="muted">{techSummary(me.research.techChoice)}</span></div>}
              <small className="muted">
                {fmt(me.research.progress)} / {fmt(cost)} research points, +{fmt(rpt, 1)} this turn.
                {chance > 0
                  ? ` Past the cost, so each turn has a chance of a breakthrough: ${Math.round(chance * 100)}% this turn, rising by about ${fmt(Math.min(100, (rpt / cost) * 100), 1)}% a turn, certain at ${fmt(cost * RESEARCH.maxCostMult)}.`
                  : ` The chance of a breakthrough stays at 0% until the points pass the cost. Then it is 1% for every 1% past the cost, certain at ${fmt(cost * RESEARCH.maxCostMult)}.`}
              </small>
            </div>
          </div>
        ) : (
          <div className="warn">Nothing is being researched. Pick a technology below.</div>
        )}
      </div>
      {me.mutationPoints > 0 && !readOnly && <MutationPanel me={me} onMutate={(picks) => session.issue({ type: "mutateRace", picks })} />}
      <div className="grid2">
        {TECH_FIELDS.map((field) => {
          const tiers = TECH_TIERS.filter((t) => t.field === field && !t.hyper);
          const done = tiers.filter((t) => me.tiers.includes(t.id));
          const next = TECH_TIERS.filter((t) => t.field === field && open.has(t.id));
          const hyper = hyperLevel(me, field);
          return (
            <div className="panel col field-card" key={field} style={{ ["--field" as string]: FIELD_LOOK[field]?.color }}>
              <h3>
                <span className="field-glyph">{FIELD_LOOK[field]?.glyph}</span>{FIELD_NAMES[field]} <small className="muted">{done.length}/{tiers.length}</small>
                {hyper > 0 && <small className="chip good" style={{ marginLeft: 6 }}>Hyper {hyper}</small>}
              </h3>
              <div className="field-meter"><span style={{ width: `${(done.length / Math.max(1, tiers.length)) * 100}%` }} /></div>
              {next.map((t) => {
                const options = researchOptions(me, t);
                const whole = learnsWholeField(me, t);
                const researching = me.research.tierId === t.id;
                return (
                  <div key={t.id} className="col" style={{ gap: 4 }}>
                    <div className="row">
                      <b>{t.hyper ? `${t.name} ${hyper + 1}` : t.name}</b>
                      {t.general && <Tip card={{ title: "General field", text: ["Basic knowledge: researching it teaches every application, whatever your race."] }}><small className="chip">General</small></Tip>}
                      <span className="muted">{fmt(t.cost)} RP{rpt > 0 && `, ~${Math.ceil(t.cost / rpt)} turns`}</span>
                    </div>
                    {t.hyper || whole ? (
                      <div className="row" style={{ gap: 4 }}>
                        <Tip card={t.hyper
                          ? { title: `${t.name} ${hyper + 1}`, kind: "Hyper-advanced", text: [
                              `Counts as one more refinement for every ${FIELD_NAMES[t.field]} component: each shrinks and gets cheaper by the next miniaturization step, and enough refinement unlocks weapon modifications.`,
                              `Each level costs ${fmt(RESEARCH.hyperCostStep)} RP more than the last and adds ${RESEARCH.hyperScore} score.`] }
                          : { title: t.name, kind: "Every application is learned", text: options.map((id) => `${TECHS[id]!.name}: ${techSummary(id)}`) }}>
                          <button className={`small tech${researching ? " active" : ""}`} disabled={readOnly}
                            onClick={() => session.issue({ type: "setResearch", tierId: t.id })}>
                            {t.hyper ? "Research" : `Research all: ${options.map((id) => TECHS[id]!.name).join(", ")}`}
                          </button>
                        </Tip>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 4 }}>
                        {options.map((id) => {
                          const tech = TECHS[id]!;
                          const active = researching && me.research.techChoice === id;
                          return (
                            <Tip key={id} card={() => techTip(id)}>
                              <button className={`small tech${active ? " active" : ""}`} disabled={readOnly}
                                onClick={() => session.issue({ type: "setResearch", tierId: t.id, techId: id })}>
                                {tech.name}{me.techs.includes(id) ? " (known)" : ""}
                              </button>
                            </Tip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {next.length === 0 && <span className="muted">Field complete.</span>}
              {done.length > 0 && (
                <details>
                  <summary className="muted">Known</summary>
                  <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                    {done.flatMap((t) => t.techs.filter((id) => me.techs.includes(id))).map((id) => (
                      <li key={id}><Tip card={() => techTip(id)}><span className="explained">{TECHS[id]?.name}</span></Tip></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Spends Evolutionary Mutation points on better race picks. */
function MutationPanel({ me, onMutate }: { me: Player; onMutate: (picks: RacePicks) => void }) {
  const base = getRace(me.raceId).picks;
  const [picks, setPicks] = useState<RacePicks>(base);
  const cost = mutationCost(base, picks);
  const ok = typeof cost === "number" && cost <= me.mutationPoints;
  const toggle = (t: RaceTrait) =>
    setPicks((p) => ({ ...p, traits: p.traits.includes(t) ? p.traits.filter((x) => x !== t) : [...p.traits, t] }));
  const traits = (Object.keys(TRAIT_COSTS) as RaceTrait[]).filter((t) => {
    const c = TRAIT_COSTS[t]!.cost;
    return base.traits.includes(t) ? c < 0 : c > 0;
  });
  return (
    <div className="panel col">
      <h3 style={{ margin: 0 }}>Evolutionary mutation <small className="muted">{me.mutationPoints} pick points to spend</small></h3>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {(Object.keys(PICK_OPTIONS) as NumericPick[]).map((key) => (
          <label key={key} className="col" style={{ gap: 2 }}>
            <small className="muted">{PICK_OPTIONS[key].label}</small>
            <select value={picks[key]} onChange={(e) => setPicks({ ...picks, [key]: Number(e.target.value) })}>
              <option value={base[key]}>{base[key] === 0 ? "Average" : `Current (${base[key]})`}</option>
              {base[key] !== 0 && <option value={0}>Average</option>}
              {PICK_OPTIONS[key].options.filter((o) => o.value !== base[key]).map((o) => (
                <option key={o.value} value={o.value}>{o.text}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {traits.map((t) => {
          const on = picks.traits.includes(t) !== base.traits.includes(t);
          return (
            <button key={t} className={`small tech${on ? " active" : ""}`} title={TRAIT_COSTS[t]!.text} onClick={() => toggle(t)}>
              {base.traits.includes(t) ? "Remove " : ""}{TRAIT_COSTS[t]!.name ?? t}
            </button>
          );
        })}
      </div>
      <div className="row">
        <span className={ok ? "" : "muted"}>{typeof cost === "number" ? `Costs ${cost} of ${me.mutationPoints} points.` : cost}</span>
        <button className="small" disabled={!ok} onClick={() => onMutate(picks)}>Mutate</button>
      </div>
    </div>
  );
}
