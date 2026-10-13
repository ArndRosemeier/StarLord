import { COUNCIL_INTERVAL, RELATION_EVENTS, councilVotes, voteChance, type PlayerId, type PlayerView } from "@starlord/sim";
import type { GameSession } from "../game/session";
import { useGame } from "../ui/hooks";
import { fmt, pct, playerName } from "../ui/format";

/** The council session meeting at the end of this turn, if there is one. */
export function councilSession(view: PlayerView) {
  const called = view.council.called;
  return called && called.turn === view.turn ? called : null;
}

/** Whether this ruler has votes to cast at this turn's session (candidates vote for themselves). */
export function mayCastCouncilVote(view: PlayerView, me: PlayerId): boolean {
  const called = councilSession(view);
  return !!called && !!view.players[me]?.alive && !called.candidates.includes(me) && councilVotes(view, me) > 0;
}

/** The ballot cast this turn: a candidate, null for abstain, undefined when none yet. */
export function castBallot(session: GameSession): PlayerId | null | undefined {
  const cmd = session.pending.find((c) => c.type === "castCouncilVote");
  return cmd?.type === "castCouncilVote" ? (cmd.vote === "abstain" ? null : cmd.vote) : undefined;
}

/**
 * Votes each candidate can expect: their own, plus every computer voter's
 * weight times its chance of backing that candidate and not the other (it
 * abstains when both or neither pass its d200).
 */
function expectedVotes(view: PlayerView, a: PlayerId, b: PlayerId, me: PlayerId) {
  const out = { [a]: councilVotes(view, a), [b]: councilVotes(view, b) } as Record<number, number>;
  const voters = view.players.filter((p) => p.kind === "empire" && p.alive && p.id !== a && p.id !== b && p.id !== me && !p.isHuman);
  const rows = voters.map((p) => {
    const w = councilVotes(view, p.id);
    const pa = voteChance(view, p.id, a, b);
    const pb = voteChance(view, p.id, b, a);
    out[a]! += w * pa * (1 - pb);
    out[b]! += w * pb * (1 - pa);
    return { id: p.id, votes: w, forA: pa * (1 - pb), forB: pb * (1 - pa) };
  });
  return { expected: out, rows };
}

/** Candidates, the numbers that decide it, and this ruler's ballot. Used by the popup and the Diplomacy screen. */
export function CouncilBallot({ onCast }: { onCast?: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const called = councilSession(view);
  if (!called) return null;
  const [a, b] = called.candidates as [PlayerId, PlayerId];
  const alive = view.players.filter((p) => p.kind === "empire" && p.alive);
  const total = alive.reduce((n, p) => n + councilVotes(view, p.id), 0);
  const needed = Math.trunc((2 * total + 2) / 3);
  const mine = councilVotes(view, me.id);
  const { expected, rows } = expectedVotes(view, a, b, me.id);
  const ballot = castBallot(session);
  const standing = me.councilVote === "auto" ? "as a computer empire would (by your relations with the candidates)"
    : me.councilVote === "abstain" ? "abstain" : `for ${playerName(view, me.councilVote)} if they stand, otherwise as a computer empire would`;
  const cast = (vote: PlayerId | "abstain") => {
    session.issue({ type: "castCouncilVote", vote });
    onCast?.();
  };
  const name = (id: PlayerId) => (id === me.id ? "You" : playerName(view, id));
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="council-candidates">
        {[a, b].map((c) => (
          <div key={c} className="council-candidate">
            <span className="dot" style={{ background: view.players[c]!.color }} />
            <b>{name(c)}</b>
            <span>{councilVotes(view, c)} vote{councilVotes(view, c) === 1 ? "" : "s"} of their own</span>
            <small className="muted">expected about {fmt(Math.round(expected[c]!))} without you</small>
          </div>
        ))}
      </div>
      <div>
        {total} votes in the council (one per 10 population, rounded up). A leader needs <b>{needed}</b>, two thirds; a candidate
        elected by the council wins the game.
      </div>
      {rows.length > 0 && (
        <details>
          <summary>How the computer empires are leaning</summary>
          <ul className="effect-list">
            {rows.map((r) => (
              <li key={r.id}>
                {playerName(view, r.id)} ({r.votes} votes): {pct(r.forA)} backs {name(a)}, {pct(r.forB)} backs {name(b)}, else abstains
              </li>
            ))}
          </ul>
        </details>
      )}
      {called.candidates.includes(me.id) ? (
        <div>You stand, so your {mine} votes go to you.</div>
      ) : mine === 0 ? (
        <div>Your empire has no population, so it has no votes in this session.</div>
      ) : (
        <>
          <div>
            You have <b>{mine}</b> vote{mine === 1 ? "" : "s"}. Backing a candidate moves your relation with them by +{RELATION_EVENTS.councilFor} and with the
            other by {RELATION_EVENTS.councilAgainst}; abstaining costs {RELATION_EVENTS.councilAbstain} with both (before the usual
            modifiers).
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {[a, b].map((c) => (
              <button key={c} className={ballot === c ? "primary" : ""} disabled={readOnly} onClick={() => cast(c)}>
                Vote for {playerName(view, c)}
              </button>
            ))}
            <button className={ballot === null ? "primary" : ""} disabled={readOnly} onClick={() => cast("abstain")}>Abstain</button>
          </div>
          <small className="muted">
            {ballot === undefined ? `Not cast yet. If you end the turn without casting them, your votes go ${standing}.`
              : `Your vote: ${ballot === null ? "abstain" : playerName(view, ballot)}. The council counts it at the end of this turn.`}
          </small>
        </>
      )}
    </div>
  );
}

/** The council meets at the end of this turn: the player casts their votes, as the original asks by menu. */
export function CouncilVotePopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back">
      <div className="modal research-warning" role="dialog" aria-label="Galactic council">
        <h3>The Galactic Council meets</h3>
        <CouncilBallot onCast={onClose} />
        <div className="row" style={{ marginTop: 12 }}>
          <span className="spacer" />
          <button onClick={onClose}>Decide later</button>
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
