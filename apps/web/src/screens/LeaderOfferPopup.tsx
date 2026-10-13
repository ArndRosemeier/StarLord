import { useEffect, useMemo } from "react";
import {
  HERO_SKILLS, LEADER_RULES, LEVEL_XP, MAX_LEADERS, TECHS, abilityValue, administratorGain, type AdministratorGain, type GameEvent, type Leader,
  type PlayerId, type PlayerView,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed } from "../ui/format";
import { LeaderPortrait } from "../ui/panels";
import { techTip } from "../ui/explain";
import { heroIntro } from "../leaders/intros";
import { audio } from "../audio/sound";

const KIND_NAME: Record<Leader["kind"], string> = { captain: "Ship officer", administrator: "Colony leader" };
const GROUP_NOTE = { common: "Works for the whole empire while in service.", ship: "Works for the fleet they command.", colony: "Works in the system they govern." };

/** Heroes who offered their services to an empire last turn and are still waiting for its answer. */
export function newLeaderOffers(events: GameEvent[], view: PlayerView, playerId: PlayerId): string[] {
  const ids = events.flatMap((e) => (e.kind === "leader" && e.offer && e.playerId === playerId ? [e.leaderId] : []));
  return [...new Set(ids)].filter((id) => view.leaders[id]?.status === "offered" && view.leaders[id]?.offeredTo === playerId);
}

/** The system where a colony leader would do most right now, and what they would change there. */
function bestPost(view: PlayerView, playerId: PlayerId, l: Leader): AdministratorGain | null {
  const stars = new Set(Object.values(view.colonies).filter((c) => c.ownerId === playerId).map((c) => view.planets[c.planetId]!.starId));
  let best: AdministratorGain | null = null;
  let bestScore = 0;
  for (const starId of stars) {
    const g = administratorGain(view, playerId, starId, l.skills);
    const score = g.food + g.industry + g.research + g.bc + g.morale / 10;
    if (score > bestScore) [best, bestScore] = [g, score];
  }
  return best;
}

function gainText(g: AdministratorGain): string {
  const parts: string[] = [];
  const add = (n: number, what: string) => {
    const r = Math.round(n * 10) / 10;
    if (r !== 0) parts.push(`${signed(r, Number.isInteger(r) ? 0 : 1)} ${what}`);
  };
  add(g.food, "food");
  add(g.industry, "industry");
  add(g.research, "research");
  add(g.bc, "BC");
  const morale = g.morale ? `${signed(Math.round(g.morale))}% morale` : "";
  if (parts.length === 0) return morale;
  return `${parts.join(", ")} per turn${morale ? `, and ${morale}` : ""}`;
}

/**
 * A hero introduces themself when they offer their services, as in MoO2: who
 * they are, what each skill does at their level, the price and the upkeep.
 * Hire now, or leave them in the hiring queue until their offer runs out.
 */
export function LeaderOfferPopup({ leaderId, onClose, onLeaders }: { leaderId: string; onClose: () => void; onLeaders: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const l = view.leaders[leaderId];
  useEffect(() => {
    audio.play("warp");
  }, [leaderId]);
  const post = useMemo(() => (l && l.kind === "administrator" ? bestPost(view, me.id, l) : null), [view, me.id, l]);
  if (!l) return null;

  const hired = Object.values(view.leaders).filter((x) => x.ownerId === me.id && x.status === "hired");
  const sameKind = hired.filter((x) => x.kind === l.kind).length;
  const full = hired.length >= MAX_LEADERS || sameKind >= LEADER_RULES.maxPerKind;
  const short = me.bc < l.hireCost;
  const why = full
    ? `You already have ${hired.length >= MAX_LEADERS ? `${MAX_LEADERS} leaders` : `${LEADER_RULES.maxPerKind} ${KIND_NAME[l.kind].toLowerCase()}s`}; dismiss one on the Leaders screen to make room.`
    : short ? `You need ${fmt(l.hireCost - me.bc)} BC more.` : null;
  const next = LEVEL_XP[l.level];
  const hire = () => {
    session.issue({ type: "hireLeader", leaderId: l.id });
    audio.play("fanfare");
    onClose();
  };

  return (
    <div className="modal-back leader-offer-back" onClick={onClose}>
      <div className="modal leader-offer" role="dialog" aria-label={`${l.name} offers their services`} onClick={(e) => e.stopPropagation()}>
        <div className="lo-head">
          <div className="lo-portrait"><LeaderPortrait name={l.name} size={150} /></div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="lo-kicker">A leader offers their services</div>
            <div className="lo-name">{l.name}</div>
            <div className="muted">
              {l.title}. {KIND_NAME[l.kind]}, level {l.level} <span className="level-stars">{"★".repeat(Math.max(1, Math.min(6, l.level)))}</span>
              , {l.xp}{next !== undefined ? `/${next}` : ""} XP
            </div>
            <blockquote className="lo-quote">
              “Greetings, ruler of the {me.name}. I am {l.name}, {l.title.toLowerCase()}. {heroIntro(l)}”
            </blockquote>
          </div>
        </div>

        <div className="lo-section">What {l.name} brings</div>
        {l.abilities.map((a) => {
          const def = HERO_SKILLS[a.skill];
          const fits = def.group === "common" || (def.group === "ship") === (l.kind === "captain");
          return (
            <div key={a.skill} className={`lo-skill${fits ? "" : " muted"}`}>
              <b>{def.name}{a.improved ? " ★" : ""}</b>{" "}
              {fits ? def.text.replace("{v}", String(abilityValue(a, l.level))) : `No effect for a ${KIND_NAME[l.kind].toLowerCase()}.`}
              {fits && <small className="muted"> {GROUP_NOTE[def.group]}</small>}
            </div>
          );
        })}
        {l.techs.length > 0 && (
          <div className="lo-skill">
            <b>Technology</b> Teaches your empire {l.techs.map((t) => TECHS[t]?.name ?? t).join(", ")} the moment they are hired.
            {l.techs.map((t) => {
              const tip = techTip(t);
              const first = tip.rows?.[0] ? `${tip.rows[0][0]}: ${tip.rows[0][1]}` : tip.text?.[0];
              return first ? <small key={t} className="muted lo-tech">{TECHS[t]?.name ?? t}: {first}</small> : null;
            })}
          </div>
        )}
        {l.kind === "administrator" && (
          <div className="lo-skill lo-now">
            {post ? <>Governing <b>{view.galaxy.stars.find((s) => s.id === post.starId)?.name ?? "a system"}</b>, where they would help most now: {gainText(post)}.</>
              : "None of your systems would gain from them right now."}
          </div>
        )}

        <div className="lo-terms">
          <div><small className="muted">Hiring price</small><b>{fmt(l.hireCost)} BC</b><small className="muted">treasury {fmt(me.bc)} BC</small></div>
          <div><small className="muted">Upkeep</small><b>{l.salary < 0 ? `pays ${fmt(-l.salary)} BC` : `${fmt(l.salary)} BC`}</b><small className="muted">per turn</small></div>
          <div><small className="muted">{KIND_NAME[l.kind]}s</small><b>{sameKind}/{LEADER_RULES.maxPerKind}</b><small className="muted">{hired.length}/{MAX_LEADERS} leaders</small></div>
        </div>
        <div className="muted lo-queue">
          Not now: {l.name} waits in the hiring queue on the Leaders screen until turn {l.availableUntil}, then leaves and may offer again later.
          {l.kind === "administrator" ? " Once hired, send them to a system" : " Once hired, give them a fleet"} on the Leaders screen; reaching a post away from your home star takes {LEADER_RULES.travelTurns} turns.
        </div>
        {why && <div className="lo-why">{why}</div>}
        <div className="row lo-buttons">
          <button onClick={() => { onClose(); onLeaders(); }}>Leaders screen</button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>Not now</button>
          <button className="primary" autoFocus disabled={readOnly || full || short} title={why ?? undefined} onClick={hire}>Hire for {fmt(l.hireCost)} BC</button>
        </div>
      </div>
    </div>
  );
}
