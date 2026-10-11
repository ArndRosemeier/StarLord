import { useState } from "react";
import {
  COUNCIL, COUNCIL_INTERVAL, COUNCIL_MAJORITY, TECHS, TIER_OF_TECH, TRIBUTE_PERCENTS, attitude, audienceTired, canSign, getRace,
  giftProblem, government, hasTreaty, nextCouncilTurn, relation, settledShare, tributeAmount,
  type Command, type Player, type PlayerView, type Proposal, type ProposalKind, type ProposalTerms, type TreatyName,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, playerName, starName, words } from "../ui/format";
import { Envoy } from "../ui/panels";

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

function mood(a: number): { text: string; cls: string } {
  if (a >= 50) return { text: "Warm", cls: "good" };
  if (a >= 20) return { text: "Friendly", cls: "good" };
  if (a > -20) return { text: "Neutral", cls: "" };
  if (a > -50) return { text: "Wary", cls: "warn" };
  return { text: "Hostile", cls: "bad" };
}

const techName = (t: string | undefined) => (t ? TECHS[t]?.name ?? words(t) : "?");

/** One line describing a proposal and its terms. */
export function describeProposal(view: PlayerView, p: Proposal): string {
  const third = p.third !== undefined ? playerName(view, p.third) : "";
  switch (p.kind) {
    case "peace":
    case "ceasefire":
      return "offers a peace treaty";
    case "nonAggression":
      return "proposes a non-aggression pact";
    case "alliance":
      return "proposes an alliance";
    case "trade":
      return "proposes a trade treaty";
    case "research":
      return "proposes a research treaty";
    case "techExchange":
      return `offers ${techName(p.techId)} in exchange for ${techName(p.wantTechId)}`;
    case "demandTribute":
      return `demands a tribute of ${p.percent}% of your income`;
    case "demandTech":
      return `demands ${techName(p.wantTechId)}`;
    case "demandSystem":
      return `demands the ${starName(view, p.starId ?? "")} system`;
    case "demandWar":
      return `demands that you declare war on the ${third}`;
    case "demandPeace":
      return `demands that you make peace with the ${third}`;
    case "demandBreakAlliance":
      return `demands that you break your alliance with the ${third}`;
    case "demandStopSpying":
      return "demands that you recall your spies";
    case "demandRemoveFleet":
      return "demands that you withdraw your fleets from their systems";
  }
}

function tradableTechs(from: Player, to: Player): string[] {
  return from.techs.filter((t) => !to.techs.includes(t) && TIER_OF_TECH[t]).sort((a, b) => techName(a).localeCompare(techName(b)));
}

/** Negotiation panel for one empire: tech exchange, demands and gifts. */
function Negotiate({ them }: { them: Player }) {
  const { session, view, me, readOnly } = useGame();
  const [mode, setMode] = useState<"" | "exchange" | "demand" | "gift">("");
  const [give, setGive] = useState("");
  const [want, setWant] = useState("");
  const [demand, setDemand] = useState<ProposalKind>("demandTribute");
  const [param, setParam] = useState("");
  const [bc, setBc] = useState(50);
  const issue = (c: Command) => session.issue(c);
  const tired = audienceTired(view, me.id, them.id);
  const others = view.players.filter((p) => p.kind === "empire" && p.alive && p.id !== me.id && p.id !== them.id);
  const theirSystems = [...new Set(Object.values(view.colonies).filter((c) => c.ownerId === them.id).map((c) => view.planets[c.planetId]!.starId))];
  const mySystems = [...new Set(Object.values(view.colonies).filter((c) => c.ownerId === me.id).map((c) => view.planets[c.planetId]!.starId))];

  const demandTerms = (): ProposalTerms => {
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
  };

  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 4 }}>
        {(["exchange", "demand", "gift"] as const).map((m) => (
          <button key={m} className={`small${mode === m ? " primary" : ""}`} disabled={readOnly} onClick={() => setMode(mode === m ? "" : m)}>
            {m === "exchange" ? "Exchange tech" : m === "demand" ? "Demand" : "Gift"}
          </button>
        ))}
      </div>
      {mode === "exchange" && (() => {
        const terms = { techId: give, wantTechId: want };
        const why = canSign(view, me.id, them.id, "techExchange", terms);
        return (
          <div className="row" style={{ gap: 4 }}>
            <select value={give} onChange={(e) => setGive(e.target.value)}>
              <option value="">Give…</option>
              {tradableTechs(me, them).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
            </select>
            <select value={want} onChange={(e) => setWant(e.target.value)}>
              <option value="">For…</option>
              {tradableTechs(them, me).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
            </select>
            <button className="small" disabled={!!why || tired} title={tired ? "They will hear no more this turn" : why ?? undefined}
              onClick={() => issue({ type: "propose", to: them.id, kind: "techExchange", ...terms })}>Propose</button>
          </div>
        );
      })()}
      {mode === "demand" && (() => {
        const terms = demandTerms();
        const why = canSign(view, me.id, them.id, demand, terms);
        return (
          <div className="row" style={{ gap: 4 }}>
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
                {theirSystems.map((s) => <option key={s} value={s}>{starName(view, s)}</option>)}
              </select>
            )}
            {(demand === "demandWar" || demand === "demandPeace" || demand === "demandBreakAlliance") && (
              <select value={param} onChange={(e) => setParam(e.target.value)}>
                <option value="">Empire…</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button className="small" disabled={!!why || tired} title={tired ? "They will hear no more this turn" : why ?? undefined}
              onClick={() => issue({ type: "propose", to: them.id, kind: demand, ...terms })}>Demand</button>
          </div>
        );
      })()}
      {mode === "gift" && (
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 4 }}>
            <input type="number" min={1} step={10} value={bc} style={{ width: 80 }} onChange={(e) => setBc(Number(e.target.value))} />
            <button className="small" disabled={!!giftProblem(view, me.id, them.id, { bc })} title={giftProblem(view, me.id, them.id, { bc }) ?? undefined}
              onClick={() => issue({ type: "gift", to: them.id, bc })}>Give BC</button>
            <select value={give} onChange={(e) => setGive(e.target.value)}>
              <option value="">Technology…</option>
              {tradableTechs(me, them).map((t) => <option key={t} value={t}>{techName(t)}</option>)}
            </select>
            <button className="small" disabled={!give} onClick={() => issue({ type: "gift", to: them.id, techId: give })}>Give tech</button>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <select value={param} onChange={(e) => setParam(e.target.value)}>
              <option value="">System…</option>
              {mySystems.map((s) => <option key={s} value={s}>{starName(view, s)}</option>)}
            </select>
            <button className="small" disabled={!param} onClick={() => {
              if (confirm(`Give the ${starName(view, param)} system to the ${them.name}?`)) issue({ type: "gift", to: them.id, starId: param });
            }}>Give system</button>
            {TRIBUTE_PERCENTS.map((p) => (
              <button key={p} className="small" disabled={hasTreaty(view, me.id, them.id, "tribute")}
                title={`About ${fmt(tributeAmount(view, me.id, p))} BC a turn`}
                onClick={() => issue({ type: "gift", to: them.id, tribute: p })}>Pay {p}% tribute</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiplomacyScreen() {
  const { session, view, me, readOnly } = useGame();
  const known = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && me.contacts.includes(p.id));
  const unknown = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && !me.contacts.includes(p.id)).length;
  const incoming = view.proposals.filter((p) => p.to === me.id);
  const outgoing = view.proposals.filter((p) => p.from === me.id);
  const responded = new Set(session.pending.flatMap((c) => (c.type === "respond" ? [c.proposalId] : [])));
  const council = view.council;
  const pending = council.pending;
  const myAnswer = session.pending.find((c) => c.type === "councilResponse");
  const nextSession = nextCouncilTurn(view);
  const tributes = view.tributes ?? [];

  return (
    <div className="col">
      {pending && pending.winner !== me.id && (
        <div className="panel col incoming">
          <h3>The council has spoken</h3>
          <div>
            The council elected <b>{playerName(view, pending.winner)}</b> ruler of the galaxy. Accept the verdict, or refuse it and
            stand at war with every empire that does.
          </div>
          <div className="row">
            {myAnswer ? <span className="muted">{myAnswer.type === "councilResponse" && myAnswer.accept ? "You accept." : "You refuse."}</span> : (
              <>
                <button className="small primary" disabled={readOnly} onClick={() => session.issue({ type: "councilResponse", accept: true })}>Accept</button>
                <button className="small danger" disabled={readOnly} onClick={() => session.issue({ type: "councilResponse", accept: false })}>Refuse</button>
              </>
            )}
          </div>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="panel col incoming">
          <h3>Proposals to you</h3>
          {incoming.map((p) => (
            <div className="row" key={p.id}>
              <span className="dot" style={{ background: view.players[p.from]!.color }} />
              <b>{view.players[p.from]!.name}</b> {describeProposal(view, p)}.
              <span className="spacer" />
              {responded.has(p.id) ? <span className="muted">answered</span> : (
                <>
                  <button className="small primary" disabled={readOnly || !!canSign(view, p.from, p.to, p.kind, p)}
                    title={canSign(view, p.from, p.to, p.kind, p) ?? undefined}
                    onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: true })}>Accept</button>
                  <button className="small" disabled={readOnly} onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: false })}>
                    {p.kind.startsWith("demand") ? "Refuse" : "Decline"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid2">
        {known.map((p) => {
          const r = relation(view, me.id, p.id);
          const feel = mood(attitude(view, p.id, me.id));
          const race = getRace(p.raceId);
          const sent = new Set(outgoing.filter((o) => o.to === p.id).map((o) => o.kind));
          const tired = audienceTired(view, me.id, p.id);
          const paysMe = tributes.find((t) => t.from === p.id && t.to === me.id);
          const iPay = tributes.find((t) => t.from === me.id && t.to === p.id);
          return (
            <div className={`panel col empire-card ${r.status}`} key={p.id} style={{ opacity: p.alive ? 1 : 0.5 }}>
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <Envoy raceId={p.raceId} color={p.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row"><span className="dot" style={{ background: p.color }} /><b>{p.name}</b></div>
                  <div className="muted">{race.plural} · {government(p).name}</div>
                  <div className="mood-meter" style={{ marginTop: 10 }} title={`Attitude toward you: ${feel.text}`}>
                    <span style={{ left: `${(attitude(view, p.id, me.id) + 100) / 2}%` }} />
                  </div>
                </div>
                <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
                  <span className={`chip ${r.status === "war" ? "bad" : r.status === "alliance" ? "good" : ""}`}>
                    {r.status === "none" ? "No treaty" : r.status === "nonAggression" ? "Non-aggression pact" : words(r.status)}
                  </span>
                  <small className={feel.cls}>{feel.text}</small>
                </div>
              </div>
              {!p.alive ? <div className="muted">Eliminated.</div> : (
                <>
                  <div className="row">
                    {r.trade && <span className="chip">Trade</span>}
                    {r.research && <span className="chip">Research</span>}
                    {paysMe && <span className="chip good">Pays you {paysMe.percent}% tribute</span>}
                    {iPay && <span className="chip warn">You pay {iPay.percent}% tribute</span>}
                    {(r.peaceUntil ?? 0) > view.turn && <span className="chip">Peace holds until turn {r.peaceUntil}</span>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {(r.status === "war" ? [{ kind: "peace" as const, label: "Offer peace" }] : TREATIES).map(({ kind, label }) => {
                      const why = canSign(view, me.id, p.id, kind) ?? (tired ? "They will hear no more this turn" : null);
                      return (
                        <button key={kind} className="small" disabled={readOnly || !!why || sent.has(kind)} title={why ?? undefined}
                          onClick={() => session.issue({ type: "propose", to: p.id, kind })}>
                          {sent.has(kind) ? `${label} sent` : label}
                        </button>
                      );
                    })}
                    {r.status !== "war" && (
                      <button className="small danger" disabled={readOnly} onClick={() => {
                        if (confirm(`Declare war on ${p.name}? Breaking a treaty angers everyone.`)) session.issue({ type: "declareWar", target: p.id });
                      }}>Declare war</button>
                    )}
                  </div>
                  {BREAKABLE.some((b) => hasTreaty(view, me.id, p.id, b.treaty)) && (
                    <div className="row" style={{ gap: 4 }}>
                      {BREAKABLE.filter((b) => hasTreaty(view, me.id, p.id, b.treaty)).map((b) => (
                        <button key={b.treaty} className="small" disabled={readOnly} onClick={() => {
                          if (confirm(`End the ${b.label} with the ${p.name}?`)) session.issue({ type: "breakTreaty", target: p.id, treaty: b.treaty });
                        }}>End {b.label}</button>
                      ))}
                    </div>
                  )}
                  <Negotiate them={p} />
                  <div className="row">
                    <button className="small danger" disabled={readOnly} onClick={() => {
                      if (confirm(`Surrender your whole empire to the ${p.name}? You will leave the game.`)) session.issue({ type: "surrender", to: p.id });
                    }}>Surrender to them</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {known.length === 0 && <div className="panel muted">You have not met any other empire yet. Explore to make contact.</div>}
      </div>
      {unknown > 0 && <div className="muted">{unknown} empire{unknown === 1 ? "" : "s"} not yet met.</div>}

      {view.settings.council && (
        <div className="panel col">
          <h3>Galactic council</h3>
          <div className="muted">
            The council first convenes once {pct(COUNCIL.settledShare)} of the galaxy's systems are owned (not before turn {COUNCIL.earliestTurn}),
            then every {COUNCIL_INTERVAL} turns. The two most populous empires stand; {pct(COUNCIL_MAJORITY)} of the votes elects one.{" "}
            {nextSession !== null ? `Next session: turn ${nextSession}.` : `Owned so far: ${pct(settledShare(view))}.`}
          </div>
          {council.lastResult && (
            <div>
              Last vote (turn {council.lastResult.turn}):{" "}
              {council.lastResult.candidates.map((c) => `${view.players[c]!.name} ${council.lastResult!.votes[c] ?? 0}`).join(" vs ")}
              {council.lastResult.winner === null ? " · no winner" : ` · ${view.players[council.lastResult.winner]!.name} elected`}
            </div>
          )}
          <label className="row">
            Your vote
            <select value={String(me.councilVote)} disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value;
                session.issue({ type: "setCouncilVote", vote: v === "auto" || v === "abstain" ? v : Number(v) });
              }}>
              <option value="auto">Automatic (yourself, or the candidate you like)</option>
              <option value="abstain">Abstain</option>
              {view.players.filter((p) => p.kind === "empire" && p.alive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
