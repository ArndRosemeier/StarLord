import { TECHS } from "@starlord/sim";
import type { ReactNode } from "react";
import { HERO_SKILLS, LEADER_RULES, LEVEL_XP, MAX_LEADERS, abilityValue, type Leader } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { LeaderPortrait } from "../ui/panels";

const kindName = (k: Leader["kind"]) => (k === "captain" ? "Ship officer" : "Colony leader");

function Abilities({ l }: { l: Leader }) {
  return (
    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      {l.abilities.map((a) => {
        const def = HERO_SKILLS[a.skill];
        const text = def.text.replace("{v}", String(abilityValue(a, l.level)));
        return (
          <span key={a.skill} className="chip" title={text}>
            {def.name}{a.improved ? "★" : ""}
          </span>
        );
      })}
      {l.techs.length > 0 && <span className="chip" title={`Teaches these technologies when hired: ${l.techs.map((t) => TECHS[t]?.name ?? t).join(", ")}`}>Brings {l.techs.length} tech{l.techs.length > 1 ? "s" : ""}</span>}
    </span>
  );
}

function LeaderCard({ l, children }: { l: Leader; children: ReactNode }) {
  const next = LEVEL_XP[l.level];
  return (
    <div className="leader-card">
      <LeaderPortrait leader={l} />
      <div className="col" style={{ gap: 4, minWidth: 0 }}>
        <div><b>{l.name}</b> <span className="level-stars" title={`Level ${l.level}`}>{"★".repeat(Math.max(1, Math.min(6, l.level)))}</span></div>
        <small className="muted">{l.title}. {kindName(l.kind)}, level {l.level}, {l.xp}{next !== undefined ? `/${next}` : ""} XP</small>
        <Abilities l={l} />
        <small className="muted">
          {l.abilities.map((a) => HERO_SKILLS[a.skill].text.replace("{v}", String(abilityValue(a, l.level)))).join(" ")}
        </small>
        {children}
      </div>
    </div>
  );
}

export function LeadersScreen() {
  const { session, view, me, readOnly } = useGame();
  const hired = Object.values(view.leaders).filter((l) => l.ownerId === me.id && l.status === "hired");
  const offers = Object.values(view.leaders).filter((l) => l.status === "offered" && l.offeredTo === me.id);
  const ofKind = (k: Leader["kind"]) => hired.filter((l) => l.kind === k).length;
  const systems = [...new Set(Object.values(view.colonies).filter((c) => c.ownerId === me.id).map((c) => view.planets[c.planetId]!.starId))]
    .map((id) => view.galaxy.stars.find((s) => s.id === id)!)
    .filter(Boolean);
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const postName = (id: string) => view.galaxy.stars.find((s) => s.id === id)?.name ?? view.fleets[id]?.name ?? "a new post";

  return (
    <div className="col" style={{ maxWidth: 1100 }}>
      <div className="panel col">
        <h2>
          Leaders <small className="muted">{hired.length}/{MAX_LEADERS}: {ofKind("administrator")}/{LEADER_RULES.maxPerKind} colony leaders,
          {" "}{ofKind("captain")}/{LEADER_RULES.maxPerKind} ship officers</small>
        </h2>
        <div className="muted">
          Colony leaders boost every colony in the system they govern; ship officers boost the fleet they command. Common
          skills help the whole empire. Moving to a post in another system takes {LEADER_RULES.travelTurns} turns.
        </div>
        <div className="leader-grid">
          {hired.map((l) => (
            <LeaderCard key={l.id} l={l}>
              <small className="muted">
                {l.salary < 0 ? `Pays ${fmt(-l.salary)} BC per turn` : `${fmt(l.salary)} BC per turn`}
                {l.travel && `, travelling to ${postName(l.travel.to)} (arrives turn ${l.travel.arrives})`}
              </small>
              <div className="row" style={{ gap: 4 }}>
                <select value={l.travel?.to ?? l.assignedTo ?? ""} disabled={readOnly} style={{ flex: 1, minWidth: 0 }}
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
          {offers.map((l) => {
            const full = hired.length >= MAX_LEADERS || ofKind(l.kind) >= LEADER_RULES.maxPerKind;
            return (
              <LeaderCard key={l.id} l={l}>
                <small className="muted">
                  Upkeep {l.salary < 0 ? `none, pays ${fmt(-l.salary)} BC` : `${fmt(l.salary)} BC`} per turn. Offer open until turn {l.availableUntil}
                </small>
                <div>
                  <button className="small primary" disabled={readOnly || me.bc < l.hireCost || full}
                    title={full ? `No room for another ${kindName(l.kind).toLowerCase()}` : undefined}
                    onClick={() => session.issue({ type: "hireLeader", leaderId: l.id })}>
                    Hire for {fmt(l.hireCost)} BC
                  </button>
                </div>
              </LeaderCard>
            );
          })}
        </div>
        {offers.length === 0 && <div className="muted">Nobody is offering their services right now.</div>}
      </div>
    </div>
  );
}
