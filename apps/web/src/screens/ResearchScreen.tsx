import {
  FIELD_NAMES, TECHS, TECH_FIELDS, TECH_TIERS, TIERS_BY_ID, availableTiers, getRace, hasTrait,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { researchPerTurn } from "./GameShell";
import { useHelp } from "../help/HelpDialog";

export function ResearchScreen() {
  const { session, view, me, readOnly } = useGame();
  const openHelp = useHelp();
  const rpt = researchPerTurn(view);
  const current = me.research.tierId ? TIERS_BY_ID[me.research.tierId] : undefined;
  const open = new Set(availableTiers(view, me.id));
  const race = getRace(me.raceId);
  const creative = hasTrait(race, "creative");
  const eta = current && rpt > 0 ? Math.max(1, Math.ceil((current.cost - me.research.progress) / rpt)) : null;

  return (
    <div className="col">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Research</h2>
          <span className="research">{fmt(rpt, 1)} points per turn</span>
          {creative && <span className="chip good">Creative: learns every tech in a tier</span>}
          {hasTrait(race, "uncreative") && <span className="chip bad">Uncreative: learns one random tech per tier</span>}
          <span className="spacer" />
          <button className="small" onClick={() => openHelp("page:techTree")}>Full tech tree</button>
        </div>
        {current ? (
          <div className="col" style={{ marginTop: 8 }}>
            <div>
              Researching <b>{current.name}</b> ({FIELD_NAMES[current.field]})
              {me.research.techChoice && <> → <b>{TECHS[me.research.techChoice]?.name}</b></>}
              {eta !== null && <span className="muted"> · about {eta} turn{eta === 1 ? "" : "s"}</span>}
            </div>
            <div className="bar"><div style={{ width: `${Math.min(100, (me.research.progress / current.cost) * 100)}%`, background: "var(--research)" }} /></div>
            <small className="muted">{fmt(me.research.progress)} / {fmt(current.cost)}</small>
          </div>
        ) : (
          <div className="warn">Nothing is being researched. Pick a technology below.</div>
        )}
      </div>
      <div className="grid2">
        {TECH_FIELDS.map((field) => {
          const tiers = TECH_TIERS.filter((t) => t.field === field && t.level > 0);
          const done = tiers.filter((t) => me.tiers.includes(t.id));
          const next = tiers.filter((t) => open.has(t.id));
          return (
            <div className="panel col" key={field}>
              <h3>{FIELD_NAMES[field]} <small className="muted">{done.length}/{tiers.length}</small></h3>
              {next.map((t) => (
                <div key={t.id} className="col" style={{ gap: 4 }}>
                  <div className="row">
                    <b>{t.name}</b>
                    <span className="muted">{fmt(t.cost)} RP{rpt > 0 && `, ~${Math.ceil(t.cost / rpt)} turns`}</span>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {t.techs.map((id) => {
                      const tech = TECHS[id]!;
                      const active = me.research.tierId === t.id && me.research.techChoice === id;
                      return (
                        <button key={id} className={`small${active ? " active" : ""}`} disabled={readOnly} title={tech.description}
                          onClick={() => session.issue({ type: "setResearch", tierId: t.id, techId: id })}>
                          {tech.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {next.length === 0 && <span className="muted">Field complete.</span>}
              {done.length > 0 && (
                <details>
                  <summary className="muted">Known</summary>
                  <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                    {done.flatMap((t) => t.techs.filter((id) => me.techs.includes(id))).map((id) => (
                      <li key={id} title={TECHS[id]?.description}>{TECHS[id]?.name}</li>
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
