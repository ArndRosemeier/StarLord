import {
  COUNCIL_VOTE, TEMPERAMENTS, councilCandidates, councilVotes, voteChance,
  COUNCIL, COUNCIL_INTERVAL, COUNCIL_MAJORITY, RELATION, TREATY_WARMTH, attitude, audienceTired, baselineOf, canSign, getRace, government, nextCouncilTurn,
  noWarTurns, relation, strikesOf,
  settledShare, spyingLevel, PROPOSAL_LIFETIME, securityLevel, type SpyMission,
} from "@starlord/sim";
import { useState } from "react";
import { Tip } from "../ui/Tip";
import { fmt } from "../ui/format";
import { RaceReport } from "./RaceReport";
import { missionTip, oddsLine } from "./EspionageScreen";
import { useGame } from "../ui/hooks";
import { pct, playerName, signed, words } from "../ui/format";
import { Envoy } from "../ui/panels";
import { describeProposal } from "../diplomacy/terms";
import { mood, type AudienceRequest } from "./Audience";
import { CouncilResult, castBallot, councilSession, mayCastCouncilVote } from "./CouncilPopup";
import { activeEffects, incomingEffect, leaningsText, TIRED_TEXT, temperamentText } from "../diplomacy/effects";

/** Your relation with them, where it drifts, and what holds it up or down. */
function AttitudeBreakdown({ them }: { them: number }) {
  const { view, me } = useGame();
  const now = attitude(view, them, me.id);
  const base = baselineOf(view, them, me.id);
  const r = relation(view, me.id, them);
  const drift = now === base || r.status === "war" ? 0 : ((RELATION.driftDie - Math.abs(now)) / RELATION.driftDie) / (2 * RELATION.driftOneIn);
  const warmth = r.status === "alliance" ? TREATY_WARMTH.alliance
    : Math.max(r.status === "nonAggression" ? TREATY_WARMTH.nonAggression : 0, r.trade ? TREATY_WARMTH.trade : 0, r.research ? TREATY_WARMTH.research : 0);
  const strikes = view.players[them]?.isHuman ? 0 : strikesOf(view, them, me.id);
  const calm = noWarTurns(view, them, me.id);
  return (
    <details className="attitude-breakdown">
      <summary>
        Relation {signed(now)}{now !== base && r.status !== "war" ? `, drifting toward ${signed(base)}` : ""}
      </summary>
      <ul className="effect-list">
        <li>
          Baseline {signed(base)}: where your races' history, wars, gifts and broken treaties have left it.
          {drift > 0 && ` On a quiet turn it moves a step toward it with chance ${pct(drift)}.`}
        </li>
        {r.status === "war" && <li className="bad">At war it stays at {RELATION.warCeiling} or below.</li>}
        {warmth > 0 && (
          <li className="good">
            Your treaties add 1 to {warmth} a turn{r.status === "alliance" ? "" : ` with chance ${100 - Math.max(0, now)}%`}.
          </li>
        )}
        {r.status !== "alliance" && <li className="muted">Without an alliance it cannot rise above {RELATION.capWithoutAlliance}.</li>}
        {strikes > 0 && (
          <li className="bad">
            {strikes} strike{strikes === 1 ? "" : "s"} against you: {strikes >= 2 ? "one more grievance may mean war" : "a warning"}.
          </li>
        )}
        {calm > 0 && r.status !== "war" && <li className="muted">They will not start a war with you for {calm} more turn{calm === 1 ? "" : "s"}.</li>}
        <li className="muted">
          Events shift it at once (gifts, deals, council votes, spies, fleets near their colonies); gains count for less the better
          it is. Computer empires accept treaties more readily the higher it is.
        </li>
      </ul>
    </details>
  );
}


const IGNORE_TEXT = `Ignored: their proposals no longer open an audience at the start of your turn. They still wait under Proposals to you for ${PROPOSAL_LIFETIME} turns; a demand for a system left unanswered counts as refused. First contact and declarations of war still come to you.`;

export function DiplomacyScreen({ onAudience, onCouncil }: { onAudience: (r: AudienceRequest) => void; onCouncil: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const known = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && me.contacts.includes(p.id));
  const unknown = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && !me.contacts.includes(p.id)).length;
  const incoming = view.proposals.filter((p) => p.to === me.id);
  const responded = new Set(session.pending.flatMap((c) => (c.type === "respond" ? [c.proposalId] : [])));
  const council = view.council;
  const pending = council.pending;
  const myAnswer = session.pending.find((c) => c.type === "councilResponse");
  const nextSession = nextCouncilTurn(view);
  const [report, setReport] = useState<number | null>(null);
  const ignoring = new Set(me.ignoring ?? []);
  const setSpies = (target: number, count: number, mission: SpyMission) => session.issue({ type: "setSpies", target, count, mission });

  return (
    <div className="col">
      {pending && pending.winner !== me.id && (
        <div className="panel col incoming">
          <h3>The council has spoken</h3>
          <div>
            The council elected <b>{playerName(view, pending.winner)}</b> ruler of the galaxy. Accept the verdict, or refuse it
            {view.players[pending.winner]?.isHuman
              ? " and stand at war with every empire that does."
              : ": every other computer empire then joins the winner, and the united empire goes to war with you."}
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
              <b>{view.players[p.from]!.name}</b> {describeProposal(view, p)}.{ignoring.has(p.from) && <small className="muted"> (ignored)</small>}
              <small className="muted" style={{ flexBasis: "100%" }}>Accepting: {incomingEffect(view, p).accept} Refusing: {incomingEffect(view, p).refuse}</small>
              <span className="spacer" />
              {responded.has(p.id) ? <span className="muted">answered</span> : (
                <>
                  <button className="small" onClick={() => onAudience({ themId: p.from, opening: { kind: "proposal", proposal: p } })}>Hear them</button>
                  <button className="small primary" disabled={readOnly || !!canSign(view, p.from, p.to, p.kind, p)}
                    title={canSign(view, p.from, p.to, p.kind, p) ?? undefined}
                    onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: true })}>Accept</button>
                  <button className="small" disabled={readOnly} onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: false })}>
                    {p.kind.startsWith("demand") && !p.payment ? "Refuse" : "Decline"}
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
          const tired = audienceTired(view, me.id, p.id);
          return (
            <div className={`panel col empire-card ${r.status}`} key={p.id} style={{ opacity: p.alive ? 1 : 0.5 }}>
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <button className="envoy-button" title="Request an audience" onClick={() => onAudience({ themId: p.id, opening: { kind: "visit" } })}>
                  <Envoy raceId={p.raceId} color={p.color} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row"><span className="dot" style={{ background: p.color }} /><b>{p.name}</b></div>
                  <div className="muted">{race.plural} · {government(p).name}{temperamentText(view, p.id) && <> · <span className="explained" title={temperamentText(view, p.id)!.text}>{temperamentText(view, p.id)!.name}</span></>}</div>
                  {(() => {
                    const lean = leaningsText(view, p.id);
                    return lean && (
                      <div className="muted">
                        <span className="explained" title={lean.objective.text}>{lean.objective.name}</span>
                        {" · "}
                        <span className="explained" title={lean.doctrine.text}>{lean.doctrine.name}</span>
                      </div>
                    );
                  })()}
                  <div className="mood-meter" style={{ marginTop: 10 }} title={`Relation with you: ${feel.text}`}>
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
                  {activeEffects(view, me.id, p.id).length > 0 && (
                    <ul className="effect-list">
                      {activeEffects(view, me.id, p.id).map((e, i) => (
                        <li key={i}><b className={e.tone ?? ""}>{e.label}:</b> {e.text}</li>
                      ))}
                    </ul>
                  )}
                  <AttitudeBreakdown them={p.id} />
                  {(() => {
                    const a = me.spies.abroad[p.id] ?? { count: 0, mission: "steal" as SpyMission };
                    return (
                      <div className="col" style={{ gap: 4 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <span>Your spies</span>
                          <button className="small" disabled={readOnly || a.count === 0} onClick={() => setSpies(p.id, a.count - 1, a.mission)} aria-label="Recall a spy">−</button>
                          <b style={{ minWidth: 18, textAlign: "center" }}>{a.count}</b>
                          <button className="small" disabled={readOnly || me.spies.home === 0} onClick={() => setSpies(p.id, a.count + 1, a.mission === "idle" ? "steal" : a.mission)} aria-label="Send a spy">+</button>
                          <span className="spy-chip">{Array.from({ length: Math.min(8, a.count) }, (_, i) => <i key={i} />)}</span>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <span className="muted">Mission</span>
                          {(["steal", "sabotage", "idle"] as const).map((m) => (
                            <Tip key={m} card={() => missionTip(view, me.id, p.id, Math.max(1, a.count), m)}>
                              <button className={`small${a.mission === m && a.count > 0 ? " active" : ""}`} disabled={readOnly || a.count === 0}
                                onClick={() => setSpies(p.id, a.count, m)}>{m === "idle" ? "Hide" : m === "steal" ? "Espionage" : "Sabotage"}</button>
                            </Tip>
                          ))}
                        </div>
                        {a.count > 0 && <small className="muted">Each turn: {oddsLine(view, me.id, p.id, a.count, a.mission)}.</small>}
                      </div>
                    );
                  })()}
                  <div className="row">
                    <button className="primary" onClick={() => onAudience({ themId: p.id, opening: { kind: "visit" } })}>
                      {readOnly ? "View audience" : "Audience"}
                    </button>
                    <button onClick={() => setReport(p.id)}>Report</button>
                    <button className={ignoring.has(p.id) ? "active" : ""} disabled={readOnly}
                      title={ignoring.has(p.id) ? "Hear their proposals again" : IGNORE_TEXT}
                      onClick={() => session.issue({ type: "setIgnore", target: p.id, on: !ignoring.has(p.id) })}>
                      {ignoring.has(p.id) ? "Ignored" : "Ignore"}
                    </button>
                    {tired && <small className="muted">{TIRED_TEXT}</small>}
                  </div>
                  {ignoring.has(p.id) && <small className="muted">{IGNORE_TEXT}</small>}
                </>
              )}
            </div>
          );
        })}
        {known.length === 0 && <div className="panel muted">You have not met any other empire yet. Explore to make contact.</div>}
      </div>
      {unknown > 0 && <div className="muted">{unknown} empire{unknown === 1 ? "" : "s"} not yet met.</div>}
      {known.length > 0 && (
        <div className="panel row" style={{ gap: 8 }}>
          <span className="chip">Agents at home: <b>{me.spies.home}</b> <span className="spy-chip">{Array.from({ length: Math.min(12, me.spies.home) }, (_, i) => <i key={i} />)}</span></span>
          <span className="chip" title="Your spying level: added to your agents' rolls abroad">Agent bonus {fmt(spyingLevel(me, view), 1)}</span>
          <span className="chip" title="Your security level: how hard your empire is for enemy agents">Security {fmt(securityLevel(view, me.id), 1)}</span>
          <small className="muted">Spies at home guard your empire; train more with the "Train Spy" project in a colony's build queue.</small>
        </div>
      )}
      {report !== null && (
        <RaceReport them={report} onClose={() => setReport(null)}
          onAudience={() => { const them = report; setReport(null); onAudience({ themId: them, opening: { kind: "visit" } }); }} />
      )}

      {view.settings.council && (
        <div className="panel col">
          <h3>Galactic council</h3>
          <div className="muted">
            The council first convenes once {pct(COUNCIL.settledShare)} of the galaxy's systems are owned (not before turn {COUNCIL.earliestTurn}),
            then every {COUNCIL_INTERVAL} turns; each session plays out as a turn starts, with every empire declaring its vote in turn. The two empires with the most votes (one per {COUNCIL.popPerVote} population, rounded up) stand; {pct(COUNCIL_MAJORITY)} of all votes elects one.
            Computer empires back a candidate on a d{COUNCIL_VOTE.die} against relation + trust + 2 × reputation, +{COUNCIL_VOTE.sameAsLastTime} for the one it backed last time, +{COUNCIL_VOTE.nonAggression} for a non-aggression pact,
            +{COUNCIL_VOTE.trade} each for trade and research treaties, +{COUNCIL_VOTE.charismatic} for a charismatic candidate, +{COUNCIL_VOTE.holdsOrion} for one holding Orion,
            +{COUNCIL_VOTE.xenoPsychology} for Xeno Psychology, +{COUNCIL_VOTE.atWarWithRival} if at war with the other candidate, {COUNCIL_VOTE.repulsive} for a repulsive one,
            and toward a human candidate −{COUNCIL_VOTE.mood} × the ruler's mood toward humans (from {signed(TEMPERAMENTS.xenophobic.vsHumans)} for a xenophobe to {signed(TEMPERAMENTS.pacifistic.vsHumans)} for a pacifist);
            always for an ally, never for an enemy, and they abstain unless exactly one candidate passes.{" "}
            {nextSession !== null ? `Next session: turn ${nextSession}.` : `Owned so far: ${pct(settledShare(view))}.`}
          </div>
          {councilSession(view) ? (
            <div className="panel col incoming">
              <b>The council is in session this turn</b>
              <div>
                {view.players[councilSession(view)!.candidates[0]!]!.name} and {view.players[councilSession(view)!.candidates[1]!]!.name} stand.{" "}
                {mayCastCouncilVote(view, me.id)
                  ? (() => { const b = castBallot(session); return b === undefined ? "You have not declared your votes yet." : `You declared: ${b === null ? "abstain" : playerName(view, b)}.`; })()
                  : ""}
              </div>
              <div className="row"><button className="small primary" onClick={onCouncil}>Enter the council chamber</button></div>
            </div>
          ) : (() => {
            const [a, b] = councilCandidates(view);
            if (a === undefined || b === undefined) return null;
            const voters = view.players.filter((p) => p.kind === "empire" && p.alive && p.id !== a && p.id !== b && !p.isHuman);
            return (
              <div>
                If it met now: {view.players[a]!.name} ({councilVotes(view, a)} votes) vs {view.players[b]!.name} ({councilVotes(view, b)} votes).
                {voters.length > 0 && (
                  <div className="muted">
                    {voters.map((p) => `${p.name} (${councilVotes(view, p.id)}): ${pct(voteChance(view, p.id, a, b))} / ${pct(voteChance(view, p.id, b, a))}`).join(" · ")}
                  </div>
                )}
              </div>
            );
          })()}
          {council.lastResult && (
            <details>
              <summary>
                Last vote (turn {council.lastResult.turn}):{" "}
                {council.lastResult.candidates.map((c) => `${view.players[c]!.name} ${council.lastResult!.votes[c] ?? 0}`).join(" vs ")}
                {council.lastResult.winner === null ? " · no winner" : ` · ${view.players[council.lastResult.winner]!.name} elected`}
              </summary>
              <CouncilResult verdict={false} />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
