import {
  ATTITUDE, COUNCIL, COUNCIL_INTERVAL, COUNCIL_MAJORITY, attitude, attitudeParts, audienceTired, canSign, getRace, government, nextCouncilTurn, relation,
  settledShare,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { pct, playerName, signed, words } from "../ui/format";
import { Envoy } from "../ui/panels";
import { describeProposal } from "../diplomacy/terms";
import { mood, type AudienceRequest } from "./Audience";
import { activeEffects, incomingEffect, TIRED_TEXT, temperamentText } from "../diplomacy/effects";

/** How they feel about you, why, and where it is heading. */
function AttitudeBreakdown({ them }: { them: number }) {
  const { view, me } = useGame();
  const now = attitude(view, them, me.id);
  const parts = attitudeParts(view, them, me.id);
  const target = parts.reduce((s, x) => s + x.value, 0);
  return (
    <details className="attitude-breakdown">
      <summary>
        Attitude {signed(now)}{target !== now ? `, drifting ${ATTITUDE.driftPerTurn} a turn toward ${signed(target)}` : ""}
      </summary>
      <ul className="effect-list">
        {parts.length === 0 && <li className="muted">Nothing pushes their feelings either way.</li>}
        {parts.map((x) => <li key={x.why}><span className={x.value > 0 ? "good" : "bad"}>{signed(x.value)}</span> {x.why}</li>)}
        <li className="muted">
          Events shift it at once (gifts, accepted or refused deals, wars, spies caught) and then it drifts back. Computer empires accept
          treaties more readily the higher it is.
        </li>
      </ul>
    </details>
  );
}


export function DiplomacyScreen({ onAudience }: { onAudience: (r: AudienceRequest) => void }) {
  const { session, view, me, readOnly } = useGame();
  const known = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && me.contacts.includes(p.id));
  const unknown = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && !me.contacts.includes(p.id)).length;
  const incoming = view.proposals.filter((p) => p.to === me.id);
  const responded = new Set(session.pending.flatMap((c) => (c.type === "respond" ? [c.proposalId] : [])));
  const council = view.council;
  const pending = council.pending;
  const myAnswer = session.pending.find((c) => c.type === "councilResponse");
  const nextSession = nextCouncilTurn(view);

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
              <small className="muted" style={{ flexBasis: "100%" }}>Accepting: {incomingEffect(view, p).accept} Refusing: {incomingEffect(view, p).refuse}</small>
              <span className="spacer" />
              {responded.has(p.id) ? <span className="muted">answered</span> : (
                <>
                  <button className="small" onClick={() => onAudience({ themId: p.from, opening: { kind: "proposal", proposal: p } })}>Hear them</button>
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
                  {activeEffects(view, me.id, p.id).length > 0 && (
                    <ul className="effect-list">
                      {activeEffects(view, me.id, p.id).map((e, i) => (
                        <li key={i}><b className={e.tone ?? ""}>{e.label}:</b> {e.text}</li>
                      ))}
                    </ul>
                  )}
                  <AttitudeBreakdown them={p.id} />
                  <div className="row">
                    <button className="primary" onClick={() => onAudience({ themId: p.id, opening: { kind: "visit" } })}>
                      {readOnly ? "View audience" : "Request audience"}
                    </button>
                    {tired && <small className="muted">{TIRED_TEXT}</small>}
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
