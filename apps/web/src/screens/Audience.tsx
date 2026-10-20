import { useEffect, useRef, useState } from "react";
import {
  TRIBUTE_PERCENTS, attitude, proposalId, audienceTired, canSign, getRace, giftProblem, government, hasTreaty, isDemand, relation,
  tributeAmount, type Command, type Player, type Proposal, type ProposalKind, type ProposalTerms, type TreatyName,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, starName, words } from "../ui/format";
import { Envoy } from "../ui/panels";
import { audio, raceThemeSrc } from "../audio/sound";
import { speak, type Moment } from "../diplomacy/voices";
import { describeProposal, techName, tradableTechs } from "../diplomacy/terms";
import { GIFT_EFFECT, SURRENDER_EFFECT, endTreatyEffect, incomingEffect, proposalEffect, warEffect, TIRED_TEXT } from "../diplomacy/effects";

/** What an option does, under it. */
const Effect = ({ children }: { children: string }) => <small className="audience-effect">{children}</small>;

/** Why an audience opens: the player asked for it, or the other empire came with news. */
export type AudienceOpening =
  | { kind: "visit" }
  | { kind: "contact" }
  | { kind: "war" }
  | { kind: "proposal"; proposal: Proposal };

export interface AudienceRequest {
  themId: number;
  opening: AudienceOpening;
}

const TREATIES: { kind: ProposalKind; label: string }[] = [
  { kind: "nonAggression", label: "Non-aggression pact" },
  { kind: "alliance", label: "Alliance" },
  { kind: "trade", label: "Trade treaty" },
  { kind: "research", label: "Research treaty" },
];

const DEMANDS: { kind: ProposalKind; label: string }[] = [
  { kind: "demandTribute", label: "Tribute" },
  { kind: "demandTech", label: "A technology" },
  { kind: "demandSystem", label: "A system" },
  { kind: "demandWar", label: "Declare war on…" },
  { kind: "demandPeace", label: "Make peace with…" },
  { kind: "demandBreakAlliance", label: "Break alliance with…" },
  { kind: "demandStopSpying", label: "Recall their spies" },
  { kind: "demandRemoveFleet", label: "Withdraw their fleets" },
];

const BREAKABLE: { treaty: TreatyName; label: string }[] = [
  { treaty: "trade", label: "trade treaty" },
  { treaty: "research", label: "research treaty" },
  { treaty: "nonAggression", label: "pact" },
  { treaty: "alliance", label: "alliance" },
  { treaty: "tribute", label: "tribute" },
];

/** A demand to give in to or refuse; one that comes with a payment is an offer to accept or decline. */
const demanded = (p: Proposal) => isDemand(p.kind) && !p.payment;

export function mood(a: number): { text: string; cls: string } {
  if (a >= 50) return { text: "Warm", cls: "good" };
  if (a >= 20) return { text: "Friendly", cls: "good" };
  if (a > -20) return { text: "Neutral", cls: "" };
  if (a > -50) return { text: "Wary", cls: "warn" };
  return { text: "Hostile", cls: "bad" };
}

type Menu = "main" | "treaty" | "exchange" | "demand" | "gift" | "end";

/**
 * Face to face with another empire's leader, as in the original: their
 * animated portrait, what they say, and the diplomatic options. Computer
 * empires answer proposals on the spot, each race in its own voice.
 */
export function Audience({ request, onClose }: { request: AudienceRequest; onClose: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const them = view.players[request.themId]!;
  const race = getRace(them.raceId);
  const said = useRef(0);
  const names = { you: me.name, us: them.name };
  const line = (m: Moment) => speak(them.raceId, m, view.turn * 31 + them.id * 7 + me.id * 3 + said.current++, names);

  const opening = (): string => {
    const o = request.opening;
    if (o.kind === "contact") return line("contact");
    if (o.kind === "war") return line("war");
    if (o.kind === "proposal") {
      const k = o.proposal.kind;
      return line(k === "peace" || k === "ceasefire" ? "peace" : demanded(o.proposal) ? "demand" : "offer");
    }
    const feel = attitude(view, them.id, me.id);
    if (relation(view, me.id, them.id).status === "war") return line("greetWar");
    return line(feel >= 20 ? "greetWarm" : feel <= -20 ? "greetCold" : "greet");
  };
  const [speech, setSpeech] = useState(opening);
  const [speechKey, setSpeechKey] = useState(0);
  const [menu, setMenu] = useState<Menu>("main");
  const [answered, setAnswered] = useState<boolean | null>(null);
  // A price they named for a treaty they would otherwise refuse, answered here like any proposal.
  const [counter, setCounter] = useState<Proposal | null>(null);
  const [leaving, setLeaving] = useState(false);

  const say = (m: Moment) => {
    setSpeech(line(m));
    setSpeechKey((k) => k + 1);
  };

  // The race's own theme plays over the ducked background music while their leader is on screen.
  useEffect(() => {
    const stop = audio.sting(raceThemeSrc(race.assetKey));
    return stop;
  }, [race.assetKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    say("farewell");
    setTimeout(onClose, 1100);
  };

  const r = relation(view, me.id, them.id);
  const feel = mood(attitude(view, them.id, me.id));
  const tired = audienceTired(view, me.id, them.id);
  const atWar = r.status === "war";
  // Repulsive races (either side) can only declare war or sue for peace, as in the original.
  const repulsive = [me, them].some((p) => getRace(p.raceId).picks.traits.includes("repulsive"));

  const propose = (cmd: Extract<Command, { type: "propose" }>) => {
    audio.play("click");
    const answer = session.audience(cmd);
    if (answer === null) {
      say(tired ? "tired" : "refuse");
      return;
    }
    const offer = answer ? undefined : session.counterTo(proposalId(view.turn, me.id, cmd.to, cmd.kind));
    if (offer) {
      setCounter(offer);
      setAnswered(null);
      say("offer");
    } else {
      say(isDemand(cmd.kind) ? (answer ? "yield" : "defy") : answer ? "accept" : "refuse");
    }
    setMenu("main");
  };

  const status = r.status === "none" ? "No treaty" : r.status === "nonAggression" ? "Non-aggression pact" : words(r.status);
  const incoming = counter ?? (request.opening.kind === "proposal" ? request.opening.proposal : null);
  const lateWar = request.opening.kind === "war";

  return (
    <div className="modal-back audience-back" onClick={onClose}>
      <div className="audience" role="dialog" aria-label={`Audience with the ${them.name}`} onClick={(e) => e.stopPropagation()}
        style={{ ["--envoy" as string]: them.color }}>
        <div className="audience-portrait">
          <Envoy raceId={them.raceId} color={them.color} className="envoy audience-envoy" autoPlay once />
          <div className="audience-plate">
            <div className="row"><span className="dot" style={{ background: them.color }} /><b>{them.name}</b></div>
            <div className="muted">{race.archetype} · {government(them).name}</div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <span className={`chip ${atWar ? "bad" : r.status === "alliance" ? "good" : ""}`}>{status}</span>
              {r.trade && <span className="chip">Trade</span>}
              {r.research && <span className="chip">Research</span>}
              <span className={`chip ${feel.cls}`}>{feel.text}</span>
            </div>
          </div>
        </div>
        <div className="audience-talk">
          <blockquote className="audience-speech" key={speechKey}>{speech}</blockquote>

          {incoming && (
            <div className="audience-terms">
              The {them.name} {describeProposal(view, incoming)}.
              {(() => {
                const fx = incomingEffect(view, incoming);
                return (
                  <ul className="audience-outcomes">
                    <li><b>{demanded(incoming) ? "If you give in:" : "If you accept:"}</b> {fx.accept}</li>
                    <li><b>{demanded(incoming) ? "If you refuse:" : "If you decline:"}</b> {fx.refuse}</li>
                  </ul>
                );
              })()}
            </div>
          )}

          <div className="audience-menu">
            {incoming ? (
              answered === null && !readOnly && view.proposals.some((p) => p.id === incoming.id) ? (
                <>
                  <button className="primary" disabled={!!canSign(view, incoming.from, incoming.to, incoming.kind, incoming)}
                    title={canSign(view, incoming.from, incoming.to, incoming.kind, incoming) ?? undefined}
                    onClick={() => {
                      session.issue({ type: "respond", proposalId: incoming.id, accept: true });
                      setAnswered(true);
                      say(demanded(incoming) ? "obeyed" : "thanks");
                    }}>{demanded(incoming) ? "Give in" : "Accept"}</button>
                  <button onClick={() => {
                    session.issue({ type: "respond", proposalId: incoming.id, accept: false });
                    setAnswered(false);
                    say(demanded(incoming) ? "threat" : "spurned");
                  }}>{demanded(incoming) ? "Refuse" : "Decline"}</button>
                  <button className="ghost" onClick={counter ? () => setCounter(null) : onClose}>Think it over</button>
                </>
              ) : <button className="primary" onClick={counter ? () => { setCounter(null); setAnswered(null); } : onClose}>Continue</button>
            ) : lateWar ? (
              <button className="primary" onClick={onClose}>So be it</button>
            ) : readOnly ? (
              <button onClick={onClose}>Close</button>
            ) : leaving ? null : menu === "main" ? (
              <>
                {(!repulsive || atWar) && <button disabled={tired} onClick={() => setMenu("treaty")}>{atWar ? "Offer peace" : "Propose a treaty"}</button>}
                {!repulsive && <button disabled={tired || atWar} onClick={() => setMenu("exchange")}>Exchange technology</button>}
                {!repulsive && <button disabled={tired} onClick={() => setMenu("demand")}>Make a demand</button>}
                {!repulsive && <button onClick={() => setMenu("gift")}>Offer a gift</button>}
                {repulsive && <div className="muted">{REPULSIVE_TEXT}</div>}
                {BREAKABLE.some((b) => hasTreaty(view, me.id, them.id, b.treaty)) && <button onClick={() => setMenu("end")}>End a treaty</button>}
                {!atWar && (
                  <button className="danger" onClick={() => {
                    if (!confirm(`Declare war on the ${them.name}?\n\n${warEffect(view, me.id, them.id)}`)) return;
                    session.issue({ type: "declareWar", target: them.id });
                    say("warReply");
                  }}>Declare war</button>
                )}
                {!atWar && <Effect>{warEffect(view, me.id, them.id)}</Effect>}
                <button className="danger" onClick={() => {
                  if (!confirm(`Surrender your whole empire to the ${them.name}? You will leave the game.`)) return;
                  session.issue({ type: "surrender", to: them.id });
                  onClose();
                }}>Surrender</button>
                <Effect>{SURRENDER_EFFECT}</Effect>
                <button className="primary" onClick={leave}>Good day</button>
              </>
            ) : (
              <SubMenu menu={menu} them={them} onPropose={propose} onSay={say} onBack={() => setMenu("main")} />
            )}
          </div>
          {tired && !incoming && !lateWar && <div className="muted">{TIRED_TEXT}</div>}
        </div>
      </div>
    </div>
  );
}

const REPULSIVE_TEXT = "A repulsive race is part of this audience: the only diplomacy possible is declaring war or suing for peace. No treaties, trades, demands or gifts.";

function SubMenu({ menu, them, onPropose, onSay, onBack }: {
  menu: Menu; them: Player; onPropose: (c: Extract<Command, { type: "propose" }>) => void; onSay: (m: Moment) => void; onBack: () => void;
}) {
  const { session, view, me } = useGame();
  const [give, setGive] = useState("");
  const [want, setWant] = useState("");
  const [demand, setDemand] = useState<ProposalKind>("demandTribute");
  const [param, setParam] = useState("");
  const [bc, setBc] = useState(50);
  const sent = new Set(session.pending.flatMap((c) => (c.type === "propose" && c.to === them.id ? [c.kind] : [])));
  const others = view.players.filter((p) => p.kind === "empire" && p.alive && p.id !== me.id && p.id !== them.id);
  const systemsOf = (id: number) => [...new Set(Object.values(view.colonies).filter((c) => c.ownerId === id).map((c) => view.planets[c.planetId]!.starId))];
  const back = <button className="ghost" onClick={onBack}>Back</button>;
  const atWar = relation(view, me.id, them.id).status === "war";

  if (menu === "treaty") {
    const options = atWar ? [{ kind: "peace" as const, label: "Peace treaty" }] : TREATIES;
    return (
      <>
        {options.map(({ kind, label }) => {
          const why = sent.has(kind) ? "already proposed this turn" : canSign(view, me.id, them.id, kind);
          return (
            <div key={kind} className="col" style={{ gap: 2 }}>
              <button disabled={!!why} title={why ?? undefined} onClick={() => onPropose({ type: "propose", to: them.id, kind })}>
                {label}{why ? ` (${why})` : ""}
              </button>
              <Effect>{proposalEffect(view, me.id, them.id, kind)}</Effect>
            </div>
          );
        })}
        {back}
      </>
    );
  }

  if (menu === "exchange") {
    const terms = { techId: give, wantTechId: want };
    const why = canSign(view, me.id, them.id, "techExchange", terms);
    return (
      <>
        <select value={give} onChange={(e) => setGive(e.target.value)}>
          <option value="">Give…</option>
          {tradableTechs(me, them).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
        </select>
        <select value={want} onChange={(e) => setWant(e.target.value)}>
          <option value="">For…</option>
          {tradableTechs(them, me).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
        </select>
        <button className="primary" disabled={!!why} title={why ?? undefined}
          onClick={() => onPropose({ type: "propose", to: them.id, kind: "techExchange", ...terms })}>Propose</button>
        <Effect>{proposalEffect(view, me.id, them.id, "techExchange")}</Effect>
        {back}
      </>
    );
  }

  if (menu === "demand") {
    const terms = ((): ProposalTerms => {
      switch (demand) {
        case "demandTribute":
          return { percent: Number(param) || TRIBUTE_PERCENTS[0] };
        case "demandTech":
          return { wantTechId: param };
        case "demandSystem":
          return { starId: param };
        case "demandWar":
        case "demandPeace":
        case "demandBreakAlliance":
          return param === "" ? {} : { third: Number(param) };
        default:
          return {};
      }
    })();
    const why = sent.has(demand) ? "already demanded this turn" : canSign(view, me.id, them.id, demand, terms);
    return (
      <>
        <select value={demand} onChange={(e) => { setDemand(e.target.value as ProposalKind); setParam(""); }}>
          {DEMANDS.map((d) => <option key={d.kind} value={d.kind}>{d.label}</option>)}
        </select>
        {demand === "demandTribute" && (
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            {TRIBUTE_PERCENTS.map((p) => <option key={p} value={p}>{p}% of income</option>)}
          </select>
        )}
        {demand === "demandTech" && (
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            <option value="">Technology…</option>
            {tradableTechs(them, me).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
          </select>
        )}
        {demand === "demandSystem" && (
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            <option value="">System…</option>
            {systemsOf(them.id).map((s) => <option key={s} value={s}>{starName(view, s)}</option>)}
          </select>
        )}
        {(demand === "demandWar" || demand === "demandPeace" || demand === "demandBreakAlliance") && (
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            <option value="">Empire…</option>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button className="primary" disabled={!!why} title={why ?? undefined}
          onClick={() => onPropose({ type: "propose", to: them.id, kind: demand, ...terms })}>Demand</button>
        <Effect>{demand === "demandTribute"
          ? `${proposalEffect(view, me.id, them.id, demand)} ${Number(param) || TRIBUTE_PERCENTS[0]}% of their income is about ${fmt(tributeAmount(view, them.id, Number(param) || TRIBUTE_PERCENTS[0]), 1)} BC a turn.`
          : proposalEffect(view, me.id, them.id, demand)}</Effect>
        {back}
      </>
    );
  }

  if (menu === "gift") {
    const gift = (cmd: Extract<Command, { type: "gift" }>) => {
      session.issue(cmd);
      onSay("gift");
      onBack();
    };
    const bcWhy = giftProblem(view, me.id, them.id, { bc });
    return (
      <>
        <div className="row" style={{ gap: 6 }}>
          <input type="number" min={1} step={10} value={bc} style={{ width: 90 }} onChange={(e) => setBc(Number(e.target.value))} />
          <button disabled={!!bcWhy} title={bcWhy ?? undefined} onClick={() => gift({ type: "gift", to: them.id, bc })}>Give BC</button>
        </div>
        <Effect>{GIFT_EFFECT.bc}</Effect>
        <div className="row" style={{ gap: 6 }}>
          <select value={give} onChange={(e) => setGive(e.target.value)}>
            <option value="">Technology…</option>
            {tradableTechs(me, them).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
          </select>
          <button disabled={!give} onClick={() => gift({ type: "gift", to: them.id, techId: give })}>Give tech</button>
        </div>
        <Effect>{GIFT_EFFECT.tech}</Effect>
        <div className="row" style={{ gap: 6 }}>
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            <option value="">System…</option>
            {systemsOf(me.id).map((s) => <option key={s} value={s}>{starName(view, s)}</option>)}
          </select>
          <button disabled={!param} onClick={() => {
            if (confirm(`Give the ${starName(view, param)} system to the ${them.name}?`)) gift({ type: "gift", to: them.id, starId: param });
          }}>Give system</button>
        </div>
        <Effect>{GIFT_EFFECT.system}</Effect>
        <div className="row" style={{ gap: 6 }}>
          {TRIBUTE_PERCENTS.map((p) => (
            <button key={p} disabled={hasTreaty(view, me.id, them.id, "tribute")} 
              onClick={() => gift({ type: "gift", to: them.id, tribute: p })}>Pay {p}% tribute (about {fmt(tributeAmount(view, me.id, p), 1)} BC a turn)</button>
          ))}
        </div>
        <Effect>{GIFT_EFFECT.tribute}</Effect>
        {back}
      </>
    );
  }

  // End a treaty.
  return (
    <>
      {BREAKABLE.filter((b) => hasTreaty(view, me.id, them.id, b.treaty)).map((b) => (
        <button key={b.treaty} className="danger" onClick={() => {
          if (!confirm(`End the ${b.label} with the ${them.name}?`)) return;
          session.issue({ type: "breakTreaty", target: them.id, treaty: b.treaty });
          onSay("broken");
          onBack();
        }}>End {b.label}</button>
      ))}
      {BREAKABLE.filter((b) => hasTreaty(view, me.id, them.id, b.treaty)).map((b) => (
        <Effect key={`fx-${b.treaty}`}>{`Ending the ${b.label}: ${endTreatyEffect(view, me.id, them.id, b.treaty)}`}</Effect>
      ))}
      {back}
    </>
  );
}
