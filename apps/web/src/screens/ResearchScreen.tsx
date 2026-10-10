import {
  FIELD_NAMES, TECHS, TECH_FIELDS, TECH_TIERS, TIERS_BY_ID, availableTiers, getRace, hasTrait,
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
          <div className="research-now" style={{ marginTop: 8 }}>
            <ProgressRing value={me.research.progress} max={current.cost} size={124} color={FIELD_LOOK[current.field]?.color}>
              <b>{Math.floor((me.research.progress / current.cost) * 100)}%</b>
              {eta !== null && <small>{eta} turn{eta === 1 ? "" : "s"}</small>}
            </ProgressRing>
            <div className="col" style={{ gap: 4, flex: 1 }}>
              <small className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}>Now researching</small>
              <div style={{ fontSize: 18 }}>
                <b>{current.name}</b> <span className="muted">({FIELD_NAMES[current.field]})</span>
              </div>
              {me.research.techChoice && <div>Goal: <b style={{ color: FIELD_LOOK[current.field]?.color }}>{TECHS[me.research.techChoice]?.name}</b> <span className="muted">{TECHS[me.research.techChoice]?.description}</span></div>}
              <small className="muted">{fmt(me.research.progress)} / {fmt(current.cost)} research points</small>
            </div>
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
            <div className="panel col field-card" key={field} style={{ ["--field" as string]: FIELD_LOOK[field]?.color }}>
              <h3><span className="field-glyph">{FIELD_LOOK[field]?.glyph}</span>{FIELD_NAMES[field]} <small className="muted">{done.length}/{tiers.length}</small></h3>
              <div className="field-meter"><span style={{ width: `${(done.length / Math.max(1, tiers.length)) * 100}%` }} /></div>
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
                        <button key={id} className={`small tech${active ? " active" : ""}`} disabled={readOnly} title={tech.description}
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
