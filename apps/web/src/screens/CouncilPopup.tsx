import { useEffect, useState } from "react";
import { COUNCIL_INTERVAL, RELATION_EVENTS, councilVotes, voteChance, type PlayerId, type PlayerView } from "@starlord/sim";
import type { GameSession } from "../game/session";
import { useGame } from "../ui/hooks";
import { pct, playerName } from "../ui/format";
import { Envoy } from "../ui/panels";

/** The council session meeting at the end of this turn, if there is one. */
export function councilSession(view: PlayerView) {
  const called = view.council.called;
  return called && called.turn === view.turn ? called : null;
}

/** Whether this ruler has votes to cast at this turn's session; a person declares even as a candidate. */
export function mayCastCouncilVote(view: PlayerView, me: PlayerId): boolean {
  const called = councilSession(view);
  return !!called && !!view.players[me]?.alive && councilVotes(view, me) > 0;
}

/** The ballot cast this turn: a candidate, null for abstain, undefined when none yet. */
export function castBallot(session: GameSession): PlayerId | null | undefined {
  const cmd = session.pending.find((c) => c.type === "castCouncilVote");
  return cmd?.type === "castCouncilVote" ? (cmd.vote === "abstain" ? null : cmd.vote) : undefined;
}

/** Seconds between two delegations' declarations. */
const DECLARE_MS = 1100;

/**
 * The council in session, as the original stages it: every empire's
 * delegation declares in seat order, computer candidates for themselves, and the
 * player declares when their seat comes up. The running count is shown
 * against the two thirds that elect a leader. Computer empires decided when
 * the session was called; the council counts everything at the end of the turn.
 */
export function CouncilSession({ onClose, instant = false }: { onClose: () => void; instant?: boolean }) {
  const { session, view, me, readOnly } = useGame();
  const called = councilSession(view);
  const ballot = castBallot(session);
  // Declarations play out one by one, except when the player comes back after declaring.
  const [shown, setShown] = useState(instant || ballot !== undefined ? Infinity : 0);
  const seats = called ? view.players.filter((p) => p.kind === "empire" && p.alive).map((p) => p.id) : [];
  const myIndex = seats.indexOf(me.id);
  const mustChoose = mayCastCouncilVote(view, me.id) && ballot === undefined && !readOnly;
  // Declarations stop at the player's seat until they have voted.
  const stop = mustChoose && myIndex >= 0 ? myIndex : seats.length;
  useEffect(() => {
    if (shown >= stop) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : DECLARE_MS);
    return () => clearTimeout(t);
  }, [shown, stop]);
  if (!called) return null;
  const [a, b] = called.candidates as [PlayerId, PlayerId];
  const weight = (id: PlayerId) => called.votes?.[id] ?? councilVotes(view, id);
  const total = seats.reduce((n, id) => n + weight(id), 0);
  const needed = Math.trunc((2 * total + 2) / 3);
  const name = (id: PlayerId) => (id === me.id ? "You" : playerName(view, id));
  /** What a seat declares: a candidate, null to abstain, "secret" for another person, undefined while undecided. */
  const declaration = (id: PlayerId): PlayerId | null | "secret" | undefined => {
    if (weight(id) === 0) return null;
    if (id === me.id) return ballot === undefined ? (readOnly ? "secret" : undefined) : ballot;
    if (view.players[id]?.isHuman) return "secret";
    if (called.candidates.includes(id)) return id;
    return called.ballots[id] ?? null;
  };
  const revealed = seats.slice(0, Math.min(shown, stop));
  const tally = (c: PlayerId) => revealed.reduce((n, id) => n + (declaration(id) === c ? weight(id) : 0), 0);
  const done = revealed.length === seats.length;
  const secret = seats.some((id) => declaration(id) === "secret");
  const winner = done && !secret ? [a, b].find((c) => tally(c) >= needed) ?? null : null;
  const cast = (vote: PlayerId | "abstain") => session.issue({ type: "castCouncilVote", vote });
  const undecided = seats.slice(myIndex + 1).filter((id) => !called.candidates.includes(id) && !view.players[id]?.isHuman && weight(id) > 0);
  const atMySeat = mustChoose && shown >= stop;
  return (
    <div className="modal-back">
      <div className="modal council-session" role="dialog" aria-label="Galactic council in session">
        <h3>The Galactic Council is in session</h3>
        <div className="muted">
          {total} votes (one per 10 population, rounded up). {needed} votes, two thirds, elect a leader of the galaxy, and that
          empire wins the game.
        </div>
        <div className="council-tally">
          {[a, b].map((c) => (
            <div key={c} className="council-bar">
              <div className="row"><span className="dot" style={{ background: view.players[c]!.color }} /> <b>{name(c)}</b><span className="spacer" />{tally(c)} / {needed}</div>
              <div className="council-track">
                <div className="council-fill" style={{ width: `${(100 * tally(c)) / Math.max(1, total)}%`, background: view.players[c]!.color }} />
                <div className="council-mark" style={{ left: `${(100 * needed) / Math.max(1, total)}%` }} title={`${needed} votes elect`} />
              </div>
            </div>
          ))}
        </div>
        <ol className="council-seats">
          {seats.map((id, i) => {
            const p = view.players[id]!;
            const d = i < revealed.length ? declaration(id) : undefined;
            const speaking = i === revealed.length - 1 && !done;
            return (
              <li key={id} className={`${i < revealed.length ? "declared" : i === stop && atMySeat ? "choosing" : "waiting"}${id === me.id ? " me" : ""}`}>
                <Envoy raceId={p.raceId} color={p.color} className="council-envoy" autoPlay={speaking} once />
                <span className="col" style={{ gap: 0 }}>
                  <b>{name(id)}</b>
                  <small className="muted">{weight(id)} vote{weight(id) === 1 ? "" : "s"}{called.candidates.includes(id) ? ", candidate" : ""}</small>
                </span>
                <span className="spacer" />
                <span className="council-declares">
                  {i >= revealed.length ? (i === stop && atMySeat ? "your turn to declare" : "")
                    : d === "secret" ? "votes in secret"
                      : weight(id) === 0 ? "has no votes"
                        : d === null ? "abstains"
                          : d === id ? (id === me.id ? "vote for yourselves" : "votes for itself")
                            : `${id === me.id ? "vote" : "votes"} for ${d === me.id ? "you" : name(d!)}`}
                </span>
              </li>
            );
          })}
        </ol>
        {atMySeat && (
          <div className="panel col council-my-vote">
            <div>
              <b>Declare your {weight(me.id)} vote{weight(me.id) === 1 ? "" : "s"}.</b>{" "}
              {called.candidates.includes(me.id)
                ? "You stand as a candidate, so your vote moves no relations: back yourselves, your rival, or abstain."
                : <>Backing a candidate moves your relation with them by +{RELATION_EVENTS.councilFor} and with the other by{" "}
                  {RELATION_EVENTS.councilAgainst}; abstaining costs {RELATION_EVENTS.councilAbstain} with both (before the usual modifiers).</>}
            </div>
            {undecided.length > 0 && (
              <small className="muted">
                Still to declare: {undecided.map((id) => `${playerName(view, id)} (${weight(id)}) ${pct(voteChance(view, id, a, b) * (1 - voteChance(view, id, b, a)))} for ${name(a)}, ${pct(voteChance(view, id, b, a) * (1 - voteChance(view, id, a, b)))} for ${name(b)}`).join(" · ")}
              </small>
            )}
            <div className="row" style={{ flexWrap: "wrap" }}>
              {[a, b].map((c) => <button key={c} className="primary" onClick={() => cast(c)}>{c === me.id ? "Vote for yourselves" : `Vote for ${playerName(view, c)}`}</button>)}
              <button onClick={() => cast("abstain")}>Abstain</button>
            </div>
          </div>
        )}
        {done && (
          <div className="council-verdict">
            {secret ? "Some votes were cast in secret; the council announces its decision at the end of the turn."
              : winner !== null ? <b>{name(winner)} {winner === me.id ? "are" : "is"} elected leader of the galaxy with {tally(winner)} of {total} votes.</b>
                : <><b>No leader is elected.</b> {name(tally(a) >= tally(b) ? a : b)} came closest with {Math.max(tally(a), tally(b))}, {needed - Math.max(tally(a), tally(b))} short of {needed}. The council meets again on turn {called.turn + COUNCIL_INTERVAL}.</>}
            {!secret && <small className="muted"> The decision takes effect when this turn ends.</small>}
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          {!done && !atMySeat && <button onClick={() => setShown(stop)}>Skip to {stop < seats.length ? "your seat" : "the count"}</button>}
          <span className="spacer" />
          {done ? <button className="primary" onClick={onClose}>Leave the chamber</button>
            : <button onClick={onClose} title="The council waits for your vote: the Diplomacy screen or End Turn brings you back to the chamber.">Look around first</button>}
        </div>
      </div>
    </div>
  );
}

/** How the council voted last turn: who stood, every empire's votes, and why it elected someone or no one. */
export function CouncilResult({ verdict = true }: { verdict?: boolean }) {
  const { session, view, me, readOnly } = useGame();
  const r = view.council.lastResult;
  if (!r) return null;
  const [a, b] = r.candidates as [PlayerId, PlayerId];
  const name = (id: PlayerId) => (id === me.id ? "You" : playerName(view, id));
  const voters = Object.keys(r.weights ?? {}).map(Number).sort((x, y) => {
    const rank = (id: number) => (id === a ? 0 : id === b ? 1 : 2);
    return rank(x) - rank(y) || (r.weights![y] ?? 0) - (r.weights![x] ?? 0);
  });
  const backed = (r.votes[a] ?? 0) + (r.votes[b] ?? 0);
  const abstained = r.total !== undefined ? r.total - backed : null;
  const best = (r.votes[a] ?? 0) >= (r.votes[b] ?? 0) ? a : b;
  const pending = view.council.pending;
  const answer = session.pending.find((c) => c.type === "councilResponse");
  return (
    <div className="col" style={{ gap: 8 }}>
      {voters.length > 0 && (
        <table className="council-table">
          <thead><tr><th>Empire</th><th>Votes</th><th>Voted for</th></tr></thead>
          <tbody>
            {voters.map((id) => {
              const v = r.ballots?.[id];
              return (
                <tr key={id} className={id === me.id ? "me" : ""}>
                  <td><span className="dot" style={{ background: view.players[id]?.color }} /> {name(id)}{id === a || id === b ? " (candidate)" : ""}</td>
                  <td>{r.weights![id]}</td>
                  <td>{r.weights![id] === 0 ? "no votes" : v === null || v === undefined ? "abstained" : v === id ? "itself" : name(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div>
        {name(a)} {r.votes[a] ?? 0}, {name(b)} {r.votes[b] ?? 0}
        {abstained ? `, ${abstained} abstained` : ""}
        {r.total !== undefined && r.needed !== undefined ? ` of ${r.total} votes; ${r.needed} (two thirds) needed.` : "."}
      </div>
      {r.winner !== null ? (
        <div><b>{name(r.winner)} {r.winner === me.id ? "were" : "was"} elected leader of the galaxy.</b></div>
      ) : (
        <div>
          <b>No leader was elected.</b>{" "}
          {r.needed !== undefined && `${name(best)} came closest with ${r.votes[best] ?? 0}, ${r.needed - (r.votes[best] ?? 0)} short of ${r.needed}. `}
          The council meets again on turn {r.turn + COUNCIL_INTERVAL}.
        </div>
      )}
      {verdict && pending && pending.winner !== me.id && (
        <div className="col" style={{ gap: 6 }}>
          <div>
            Accept the verdict, or refuse it
            {view.players[pending.winner]?.isHuman
              ? " and stand at war with every empire that accepts it."
              : ": every other computer empire then joins the winner, and the united empire goes to war with you."}
          </div>
          <div className="row">
            {answer?.type === "councilResponse" ? <span className="muted">{answer.accept ? "You accept." : "You refuse."}</span> : (
              <>
                <button className="primary" disabled={readOnly} onClick={() => session.issue({ type: "councilResponse", accept: true })}>Accept</button>
                <button className="danger" disabled={readOnly} onClick={() => session.issue({ type: "councilResponse", accept: false })}>Refuse</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CouncilResultPopup({ onClose }: { onClose: () => void }) {
  const { view } = useGame();
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal research-warning" role="dialog" aria-label="Council result" onClick={(e) => e.stopPropagation()}>
        <h3>The Galactic Council has voted</h3>
        <small className="muted">Session of turn {view.council.lastResult?.turn}</small>
        <CouncilResult />
        <div className="row" style={{ marginTop: 12 }}>
          <span className="spacer" />
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
