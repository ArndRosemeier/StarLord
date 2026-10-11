import { useState, useSyncExternalStore } from "react";
import type { SimResult } from "@starlord/ai";
import type { Difficulty, GalaxySize, NewGameOptions, VictoryKind } from "@starlord/sim";
import { simRunner, type SimGame } from "../sim/runner";
import { fmt } from "../ui/format";

const SIZES: GalaxySize[] = ["small", "medium", "large", "huge"];
const COUNTS = [2, 3, 4, 5, 6, 7, 8];
const DIFFICULTIES: Difficulty[] = ["tutor", "easy", "average", "hard", "impossible"];
const VICTORY: Record<VictoryKind, string> = {
  conquest: "Conquest",
  council: "Council vote",
  raiders: "Vex Prime taken",
  score: "Still going at the turn limit",
};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const words = (id: string) => cap(id.replace(/([A-Z])/g, " $1").toLowerCase());

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function status(g: SimGame, paused: boolean): string {
  const r = g.result;
  const playing = g.playing && !paused;
  if (!r) return g.playing ? "starting" : "waiting";
  if (r.crashed) return `Crashed on turn ${r.turns}`;
  if (r.over) return `${VICTORY[r.victory!]}: ${r.winner}, turn ${r.turns}`;
  return `${playing ? "Playing" : g.playing ? "Paused at" : "Stopped at"} turn ${r.turns} of ${r.maxTurns}`;
}

const msPerTurn = (r: SimResult) => (r.turns ? r.ms / r.turns : 0);
const hasProblems = (r: SimResult | null) => !!r && (r.crashed || r.problems.some((p) => p.kind !== "slowTurn"));

/**
 * Plays batches of all-AI games in the background, to check that games
 * still run to an end and nothing breaks along the way. Offered in the debug
 * menu; the run goes on while the menu is closed.
 */
export function Simulator() {
  const run = useSyncExternalStore(simRunner.subscribe, simRunner.get);
  const [sizes, setSizes] = useState<GalaxySize[]>(["small", "medium"]);
  const [counts, setCounts] = useState<number[]>([2, 4, 6]);
  const [seeds, setSeeds] = useState(2);
  const [firstSeed, setFirstSeed] = useState("1");
  const [maxTurns, setMaxTurns] = useState(400);
  const [difficulty, setDifficulty] = useState<Difficulty>("average");
  const [monsters, setMonsters] = useState(true);
  const [raiders, setRaiders] = useState(true);
  const [council, setCouncil] = useState(true);
  const [randomEvents, setRandomEvents] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);

  const busy = run.state === "running" || run.state === "paused";
  const total = sizes.length * counts.length * seeds;

  const start = () => {
    const games: NewGameOptions[] = [];
    for (const galaxySize of sizes) {
      for (const playerCount of [...counts].sort((a, b) => a - b)) {
        for (let i = 0; i < seeds; i++) {
          const n = Number(firstSeed);
          const seed = Number.isFinite(n) && firstSeed.trim() !== "" ? String(n + i) : `${firstSeed}-${i + 1}`;
          games.push({ seed, galaxySize, playerCount, maxTurns, difficulty, monsters, raiders, council, randomEvents });
        }
      }
    }
    setPicked(null);
    simRunner.start(games);
  };

  const results = run.games.map((g) => g.result).filter((r): r is SimResult => !!r);
  const ended = results.filter((r) => r.over || r.crashed);
  const endings: Record<string, number> = {};
  for (const r of ended) {
    const k = r.crashed ? "Crashed" : VICTORY[r.victory!];
    endings[k] = (endings[k] ?? 0) + 1;
  }
  const turns = ended.filter((r) => r.over).map((r) => r.turns);
  const totalMs = results.reduce((n, r) => n + r.ms, 0);
  const totalTurns = results.reduce((n, r) => n + r.turns, 0);
  const troubled = run.games.filter((g) => hasProblems(g.result)).length;
  const detail = picked !== null ? run.games[picked] : undefined;

  return (
    <div className="simulator">
      <p className="muted">
        Plays complete games between computer empires in the background, with no one watching, then reports how each ended.
        After every turn it checks the game for broken rules (colonies without a planet, fleets of unknown ships, numbers that
        are not numbers, eliminated empires that still own things) and notes AI orders the rules turned down.
      </p>

      <fieldset disabled={busy} className="sim-settings">
        <div className="row debug-row">
          <strong>Galaxy</strong>
          {SIZES.map((s) => (
            <label key={s} className="sim-check"><input type="checkbox" checked={sizes.includes(s)} onChange={() => setSizes(toggle(sizes, s))} /> {cap(s)}</label>
          ))}
        </div>
        <div className="row debug-row">
          <strong>Empires</strong>
          {COUNTS.map((n) => (
            <label key={n} className="sim-check"><input type="checkbox" checked={counts.includes(n)} onChange={() => setCounts(toggle(counts, n))} /> {n}</label>
          ))}
        </div>
        <div className="row debug-row">
          <label>Games per setup <input type="number" min={1} max={20} value={seeds} onChange={(e) => setSeeds(Math.min(20, Math.max(1, Math.floor(Number(e.target.value) || 1))))} style={{ width: 56 }} /></label>
          <label title="Each game gets its own seed counting up from this one; the same seed and setup always plays the same game.">
            First seed <input value={firstSeed} onChange={(e) => setFirstSeed(e.target.value)} style={{ width: 72 }} />
          </label>
          <label title="Real games have no turn limit unless you set one, but a simulation needs a stopping point: a game still going at this turn is called for the highest score.">
            Turn limit <input type="number" min={50} max={1000} step={50} value={maxTurns} onChange={(e) => setMaxTurns(Math.min(1000, Math.max(50, Math.floor(Number(e.target.value) || 400))))} style={{ width: 72 }} />
          </label>
          <label>AI level <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
          </select></label>
        </div>
        <div className="row debug-row">
          <label className="sim-check" title="Monsters guard systems and Orion; random events can send more."><input type="checkbox" checked={monsters} onChange={(e) => setMonsters(e.target.checked)} /> Monsters</label>
          <label className="sim-check" title="Vexari raids, and the Vex Prime assault victory through a Dimensional Portal."><input type="checkbox" checked={raiders} onChange={(e) => setRaiders(e.target.checked)} /> Vexari</label>
          <label className="sim-check" title="The Galactic Council meets every 25 turns once half the stars are owned; a 2/3 vote wins the game."><input type="checkbox" checked={council} onChange={(e) => setCouncil(e.target.checked)} /> Council</label>
          <label className="sim-check" title="Disasters, windfalls and invading monsters."><input type="checkbox" checked={randomEvents} onChange={(e) => setRandomEvents(e.target.checked)} /> Random events</label>
        </div>
      </fieldset>

      <div className="row debug-row">
        {!busy && (
          <button className="primary" onClick={start} disabled={total === 0}>
            Play {total} {total === 1 ? "game" : "games"}
          </button>
        )}
        {run.state === "running" && <button onClick={simRunner.pause}>Pause</button>}
        {run.state === "paused" && <button className="primary" onClick={simRunner.resume}>Resume</button>}
        {busy && <button onClick={simRunner.stop}>Stop</button>}
        <small className="muted">
          {total === 0
            ? "Pick at least one galaxy size and one empire count."
            : `${sizes.length} galaxy ${sizes.length === 1 ? "size" : "sizes"} × ${counts.length} empire ${counts.length === 1 ? "count" : "counts"} × ${seeds} ${seeds === 1 ? "game" : "games"}, ${run.workers} played at a time.`}
        </small>
      </div>

      {run.games.length > 0 && (
        <>
          <div className="panel sim-summary">
            <strong>{ended.length} of {run.games.length} games ended</strong>
            {run.state === "paused" && <span className="muted"> (paused)</span>}
            {run.state === "stopped" && <span className="muted"> (stopped)</span>}
            {Object.keys(endings).length > 0 && (
              <div>{Object.entries(endings).map(([k, n]) => `${k} ${n}`).join(" · ")}</div>
            )}
            {turns.length > 0 && (
              <div className="muted">
                Length {Math.min(...turns)}–{Math.max(...turns)} turns, average {Math.round(turns.reduce((a, b) => a + b, 0) / turns.length)}
                {totalTurns > 0 && ` · ${fmt(Math.round(totalMs / totalTurns))} ms per turn`}
              </div>
            )}
            <div className={troubled ? "bad" : "good"}>
              {troubled ? `${troubled} ${troubled === 1 ? "game" : "games"} crashed or broke a rule. Tap a game for details.` : "No crashes or broken rules so far."}
            </div>
          </div>

          <div className="sim-table-wrap">
            <table className="sim-table">
              <thead>
                <tr><th>#</th><th>Galaxy</th><th>Empires</th><th>Seed</th><th>Result</th><th>ms/turn</th><th>Problems</th></tr>
              </thead>
              <tbody>
                {run.games.map((g, i) => {
                  const r = g.result;
                  const problems = r?.problems.filter((p) => p.kind !== "slowTurn").length ?? 0;
                  return (
                    <tr key={i} className={`${picked === i ? "sim-picked" : ""} ${hasProblems(r) ? "bad" : ""}`} onClick={() => setPicked(picked === i ? null : i)}>
                      <td>{i + 1}</td>
                      <td>{cap(g.options.galaxySize!)}</td>
                      <td>{g.options.playerCount}</td>
                      <td>{String(g.options.seed)}</td>
                      <td>{status(g, run.state === "paused")}</td>
                      <td>{r && r.turns ? fmt(Math.round(msPerTurn(r))) : ""}</td>
                      <td>{r ? (r.crashed ? "crash" : problems || "") : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {detail?.result && <GameDetail game={detail} />}
        </>
      )}
    </div>
  );
}

function GameDetail({ game }: { game: SimGame }) {
  const r = game.result!;
  const events = Object.entries(r.events).filter(([k]) => k !== "commandRejected").sort((a, b) => b[1] - a[1]);
  const rejected = Object.entries(r.rejected).sort((a, b) => b[1] - a[1]);
  return (
    <div className="panel sim-detail">
      <h3>{cap(game.options.galaxySize!)} galaxy, {game.options.playerCount} empires, seed {String(game.options.seed)}</h3>
      <p className="muted">
        {r.turns} turns played{r.turns ? `, ${fmt(Math.round(msPerTurn(r)))} ms per turn on average, slowest ${fmt(Math.round(r.slowestTurnMs))} ms` : ""}.
        Simulating the same seed and settings again plays out exactly the same game.
      </p>
      <div className="sim-table-wrap">
        <table className="sim-table">
          <thead>
            <tr><th>Empire</th><th>Status</th><th>Colonies</th><th>Pop</th><th>Techs</th><th>Ships</th><th>BC</th><th>Score</th></tr>
          </thead>
          <tbody>
            {[...r.empires].sort((a, b) => b.score - a.score).map((e) => (
              <tr key={e.id}>
                <td>{e.name}{r.winner === e.name ? " ★" : ""}</td>
                <td className={e.alive ? "" : "muted"}>{e.alive ? "alive" : `out on turn ${e.eliminatedTurn}`}</td>
                <td>{e.colonies}</td>
                <td>{e.population}</td>
                <td>{e.techs}</td>
                <td>{e.ships}</td>
                <td>{fmt(e.bc)}</td>
                <td>{fmt(e.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Problems</h4>
      {r.problems.length === 0 ? <p className="good">None.</p> : (
        <ul className="sim-problems">
          {r.problems.map((p, i) => (
            <li key={i} className={p.kind === "slowTurn" ? "muted" : "bad"}>
              Turn {p.turn}, {p.kind === "crash" ? "crash" : p.kind === "slowTurn" ? "slow turn" : "broken rule"}: <code>{p.message}</code>
            </li>
          ))}
        </ul>
      )}

      <h4>What happened</h4>
      <p className="sim-events">{events.map(([k, n]) => `${words(k)} ${fmt(n)}`).join(" · ") || "Nothing yet."}</p>

      <h4>AI orders the rules turned down</h4>
      {rejected.length === 0 ? <p className="muted">None.</p> : (
        <ul className="sim-problems">
          {rejected.map(([k, n]) => <li key={k}><code>{k}</code> × {fmt(n)}</li>)}
        </ul>
      )}
    </div>
  );
}
