import {
  FIELD_NAMES, TECHS, TECH_FIELDS, TIER_OF_TECH, attitude, getRace, government, relation,
  type NumericPick, type PlayerView, type TechField,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { Envoy } from "../ui/panels";
import { Tip } from "../ui/Tip";
import { governmentTip, pickText, techTip, traitTip } from "../ui/explain";
import { leaningsText, temperamentText } from "../diplomacy/effects";
import { mood } from "./Audience";

const PICKS: NumericPick[] = ["growth", "farming", "industry", "science", "money", "shipAttack", "shipDefense", "groundCombat", "spying"];

/** A rule text without the name it opens with, which is already shown in bold. */
const rest = (name: string, text: string) => (text.startsWith(name) ? text.slice(name.length).replace(/^[:.]?\s*/, "") : text);

const STATUS_NAME: Record<string, string> = { war: "War", alliance: "Alliance", nonAggression: "Non-aggression pact", peace: "Peace treaty" };

/** Their treaties and wars with every other empire, the ones you have not met left unnamed. */
function theirRelations(view: PlayerView, them: number): { name: string; color?: string; text: string; cls: string }[] {
  const me = view.players[view.viewer]!;
  const out: { name: string; color?: string; text: string; cls: string }[] = [];
  let unknownWars = 0;
  let unknownAllies = 0;
  for (const p of view.players) {
    if (p.kind !== "empire" || !p.alive || p.id === them) continue;
    const r = relation(view, them, p.id);
    const parts = [STATUS_NAME[r.status], r.trade && "trade treaty", r.research && "research treaty"].filter(Boolean) as string[];
    if (parts.length === 0) continue;
    const known = p.id === me.id || me.contacts.includes(p.id);
    if (!known) {
      if (r.status === "war") unknownWars++;
      if (r.status === "alliance") unknownAllies++;
      continue;
    }
    out.push({
      name: p.id === me.id ? `${p.name} (you)` : p.name, color: p.color, text: parts.join(", "),
      cls: r.status === "war" ? "bad" : r.status === "alliance" ? "good" : "",
    });
  }
  if (unknownWars + unknownAllies > 0) {
    const bits = [unknownWars > 0 && `at war with ${unknownWars}`, unknownAllies > 0 && `allied with ${unknownAllies}`].filter(Boolean);
    out.push({ name: "Empires you have not met", text: `${bits.join(", ")}`, cls: "muted" });
  }
  return out;
}

/**
 * The original's race report: their leader and personality, their agents in
 * your empire, their alliances and wars, and their technologies, marking the
 * ones you don't have.
 */
export function RaceReport({ them, onClose, onAudience }: { them: number; onClose: () => void; onAudience?: () => void }) {
  const { view, me } = useGame();
  const p = view.players[them]!;
  const race = getRace(p.raceId);
  const feel = mood(attitude(view, them, me.id));
  const temper = temperamentText(view, them);
  const lean = leaningsText(view, them);
  const agents = p.spies.abroad[me.id];
  const mine = new Set(me.techs);
  const byField = new Map<TechField, string[]>();
  for (const t of p.techs) {
    const field = TIER_OF_TECH[t]?.field;
    if (!field || !TECHS[t]) continue;
    byField.set(field, [...(byField.get(field) ?? []), t]);
  }
  const lacking = p.techs.filter((t) => TECHS[t] && !mine.has(t)).length;
  const theyLack = me.techs.filter((t) => TECHS[t] && !p.techs.includes(t)).length;
  const relations = theirRelations(view, them);
  const picks = PICKS.filter((k) => (race.picks[k] as number) !== 0);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal race-report" role="dialog" aria-label={`Report on the ${p.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ flexWrap: "nowrap", gap: 16, alignItems: "flex-start" }}>
          <Envoy raceId={p.raceId} color={p.color} className="empire-portrait" />
          <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
            <div className="row"><span className="dot" style={{ background: p.color }} /><h2 style={{ margin: 0 }}>{p.name}</h2></div>
            <div className="muted">
              {race.plural} · <Tip card={governmentTip(p.government)}><span className="explained">{government(p).name}</span></Tip>
              {!p.alive && " · eliminated"}
            </div>
            <div className="muted">{race.description}</div>
            <small className="muted">Report as of turn {view.turn}.</small>
          </div>
          <button className="small" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="race-report-grid">
          <section className="col">
            <h3>Personality</h3>
            <div>Toward you: <span className={feel.cls}>{feel.text}</span></div>
            {temper && <div><b>{temper.name}</b> <span className="muted">{rest(temper.name, temper.text)}</span></div>}
            {lean && <div><b>{lean.objective.name}.</b> <span className="muted">{rest(lean.objective.name, lean.objective.text)}</span></div>}
            {lean && <div><b>{lean.doctrine.name}.</b> <span className="muted">{rest(lean.doctrine.name, lean.doctrine.text)}</span></div>}
            {p.isHuman && <div className="muted">A human player: no computer personality.</div>}
            {(race.picks.traits.length > 0 || picks.length > 0) && (
              <div className="row" style={{ gap: 4 }}>
                {race.picks.traits.map((t) => <Tip key={t} card={traitTip(t)}><span className="chip explained">{traitTip(t).title}</span></Tip>)}
                {picks.map((k) => (
                  <span key={k} className={`chip ${(race.picks[k] as number) > 0 ? "good" : "bad"}`}>{pickText(k, race.picks[k] as number)}</span>
                ))}
              </div>
            )}
          </section>

          <section className="col">
            <h3>Their agents in your empire</h3>
            {agents && agents.count > 0
              ? <div className="bad">{agents.count} spy{agents.count === 1 ? "" : "s"}, {agents.mission === "idle" ? "lying low" : agents.mission === "steal" ? "trying to steal technology" : "trying to sabotage buildings"}.</div>
              : <div className="muted">None known.</div>}
            <small className="muted">Your {me.spies.home} spy{me.spies.home === 1 ? "" : "s"} at home guard against them.</small>

            <h3>Alliances and wars</h3>
            {relations.length === 0 ? <div className="muted">No treaties and no wars.</div> : (
              <ul className="effect-list">
                {relations.map((r) => (
                  <li key={r.name}>
                    {r.color && <span className="dot" style={{ background: r.color, marginRight: 6 }} />}
                    {r.name}: <span className={r.cls}>{r.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <h3>Technology</h3>
        <div className="muted">
          {p.techs.length} technologies known. <span className={lacking > 0 ? "good" : ""}>{lacking} you don't have</span> (highlighted; a spy can steal them, or ask
          in an audience); they lack {theyLack} of yours.
        </div>
        <div className="race-report-techs">
          {TECH_FIELDS.filter((f) => byField.has(f)).map((f) => (
            <div key={f} className="col" style={{ gap: 4 }}>
              <b>{FIELD_NAMES[f]}</b>
              <div className="row" style={{ gap: 4 }}>
                {byField.get(f)!.map((t) => (
                  <Tip key={t} card={() => techTip(t)}>
                    <span className={`chip explained${mine.has(t) ? "" : " new-tech"}`}>{TECHS[t]!.name}</span>
                  </Tip>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          {onAudience && p.alive && <button className="primary" onClick={onAudience}>Request audience</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
