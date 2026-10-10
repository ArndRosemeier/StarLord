import {
  attitude, canSign, getRace, government, relation,
  type ProposalKind,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { words } from "../ui/format";
import { Envoy } from "../ui/panels";

const KINDS: { kind: ProposalKind; label: string }[] = [
  { kind: "peace", label: "Peace treaty" },
  { kind: "alliance", label: "Alliance" },
  { kind: "trade", label: "Trade treaty" },
  { kind: "research", label: "Research treaty" },
];

function mood(a: number): { text: string; cls: string } {
  if (a >= 50) return { text: "Warm", cls: "good" };
  if (a >= 20) return { text: "Friendly", cls: "good" };
  if (a > -20) return { text: "Neutral", cls: "" };
  if (a > -50) return { text: "Wary", cls: "warn" };
  return { text: "Hostile", cls: "bad" };
}

export function DiplomacyScreen() {
  const { session, view, me, readOnly } = useGame();
  const known = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && me.contacts.includes(p.id));
  const unknown = view.players.filter((p) => p.kind === "empire" && p.id !== me.id && !me.contacts.includes(p.id)).length;
  const incoming = view.proposals.filter((p) => p.to === me.id);
  const outgoing = view.proposals.filter((p) => p.from === me.id);
  const responded = new Set(session.pending.flatMap((c) => (c.type === "respond" ? [c.proposalId] : [])));
  const council = view.council;

  return (
    <div className="col">
      {incoming.length > 0 && (
        <div className="panel col incoming">
          <h3>Proposals to you</h3>
          {incoming.map((p) => (
            <div className="row" key={p.id}>
              <span className="dot" style={{ background: view.players[p.from]!.color }} />
              <b>{view.players[p.from]!.name}</b> proposes a {words(p.kind)} {p.kind === "ceasefire" ? "" : "treaty"}.
              <span className="spacer" />
              {responded.has(p.id) ? <span className="muted">answered</span> : (
                <>
                  <button className="small primary" disabled={readOnly} onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: true })}>Accept</button>
                  <button className="small" disabled={readOnly} onClick={() => session.issue({ type: "respond", proposalId: p.id, accept: false })}>Decline</button>
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
                  <span className={`chip ${r.status === "war" ? "bad" : r.status === "alliance" ? "good" : ""}`}>{r.status === "none" ? "No treaty" : words(r.status)}</span>
                  <small className={feel.cls}>{feel.text}</small>
                </div>
              </div>
              {!p.alive ? <div className="muted">Eliminated.</div> : (
                <>
                  <div className="row">
                    {r.trade && <span className="chip">Trade</span>}
                    {r.research && <span className="chip">Research</span>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {(r.status === "war" ? [{ kind: "peace" as const, label: "Offer peace" }] : KINDS.filter((k) => k.kind !== "peace")).map(({ kind, label }) => {
                      const why = canSign(view, me.id, p.id, kind);
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
            Every {25} turns from turn 100 the two most populous empires stand for election; a two-thirds majority of population-weighted votes wins the game.
            Next session: turn {council.nextTurn}.
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
