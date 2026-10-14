import { useState, type PointerEvent } from "react";
import { HISTORY_STATS, empires, getRace, knowsStats, scoreBreakdown, type HistoryStat, type Player, type PlayerView } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { Tip } from "../ui/Tip";
import { scoreTip } from "../ui/explain";

const STAT_INFO: Record<HistoryStat, { label: string; text: string }> = {
  score: { label: "Score", text: "The original's score: research, population, conquests and victories, less a point a turn." },
  population: { label: "Population", text: "Population units in all colonies, androids included." },
  colonies: { label: "Colonies", text: "Colonies and outposts." },
  techs: { label: "Technologies", text: "Applications known." },
  industry: { label: "Industry", text: "Industry produced a turn, after pollution." },
  fleet: { label: "Fleet strength", text: "Combined combat strength of all ships." },
};

const W = 720;
const H = 260;
const PAD = { left: 48, right: 12, top: 12, bottom: 26 };

/** The empires the viewer has statistics for: themselves and those they are in contact with (a spectator sees all). */
function known(view: PlayerView, all: boolean): Player[] {
  return empires(view).filter((p) => all || knowsStats(view, view.viewer, p.id));
}

/** Rounded axis maximum and a few gridline values. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(v);
  return out;
}

function HistoryGraph({ view, stat, all }: { view: PlayerView; stat: HistoryStat; all: boolean }) {
  const history = view.history ?? [];
  const k = HISTORY_STATS.indexOf(stat);
  const players = known(view, all);
  const [hover, setHover] = useState<number | null>(null);
  const { lines, yTicks, x, y } = (() => {
    let max = 0;
    let min = 0;
    for (const h of history) for (const p of players) {
      const v = h.rows[p.id]?.[k];
      if (v === undefined) continue;
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    const yTicks = ticks(max);
    const top = yTicks[yTicks.length - 1]!;
    const first = history[0]?.turn ?? 1;
    const last = Math.max(first + 1, history[history.length - 1]?.turn ?? first + 1);
    const x = (turn: number) => PAD.left + ((turn - first) / (last - first)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - ((v - Math.min(0, min)) / (top - Math.min(0, min) || 1)) * (H - PAD.top - PAD.bottom);
    const lines = players.map((p) => {
      let d = "";
      let pen = false;
      for (const h of history) {
        const v = h.rows[p.id]?.[k];
        if (v === undefined) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(h.turn).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return { p, d };
    });
    return { lines, yTicks, x, y };
  })();

  if (history.length < 2) return <p className="muted">The graphs fill in as turns go by.</p>;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < history.length; i++) if (Math.abs(x(history[i]!.turn) - px) < Math.abs(x(history[best]!.turn) - px)) best = i;
    setHover(best);
  };
  const at = hover !== null ? history[hover] : undefined;
  const xTickTurns = [history[0]!.turn, history[Math.floor(history.length / 2)]!.turn, history[history.length - 1]!.turn];
  return (
    <div className="history-graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${STAT_INFO[stat].label} by turn`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="graph-grid" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="graph-label">{fmt(v)}</text>
          </g>
        ))}
        {xTickTurns.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="graph-label">turn {t}</text>)}
        {lines.map(({ p, d }) => (
          <path key={p.id} d={d} fill="none" stroke={p.color} strokeWidth={p.id === view.viewer ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {at && (
          <g>
            <line x1={x(at.turn)} x2={x(at.turn)} y1={PAD.top} y2={H - PAD.bottom} className="graph-cursor" />
            {players.map((p) => {
              const v = at.rows[p.id]?.[k];
              return v === undefined ? null : <circle key={p.id} cx={x(at.turn)} cy={y(v)} r={4} fill={p.color} className="graph-dot" />;
            })}
          </g>
        )}
      </svg>
      <div className="graph-legend">
        {at && <b>Turn {at.turn}</b>}
        {players.map((p) => {
          const row = (at ?? history[history.length - 1]!).rows[p.id];
          return (
            <span key={p.id} className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}: {row ? fmt(row[k]!) : "—"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The info screen: how the empires compare, now and over time. As in the
 * original, it covers the player and the empires they are in contact with;
 * the others are listed as unknown.
 */
export function InfoScreen() {
  const { view, me, readOnly } = useGame();
  const [stat, setStat] = useState<HistoryStat>("score");
  const latest = view.history?.[view.history.length - 1];
  const all = empires(view);
  const mine = scoreBreakdown(view, me.id);
  return (
    <div className="col">
      <div className="panel col">
        <h2 style={{ margin: 0 }}>Standings</h2>
        <small className="muted">
          Statistics of your empire and the empires you are in contact with, as of the start of this turn. Empires you have not met stay unknown.
        </small>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Empire</th>
                {HISTORY_STATS.map((s) => <th key={s} className="num"><Tip card={{ title: STAT_INFO[s].label, text: [STAT_INFO[s].text] }}><span className="explained">{STAT_INFO[s].label}</span></Tip></th>)}
              </tr>
            </thead>
            <tbody>
              {all.map((p) => {
                const seen = readOnly || knowsStats(view, me.id, p.id);
                const row = seen ? latest?.rows[p.id] : null;
                return (
                  <tr key={p.id} className={p.id === me.id ? "mine" : ""} style={{ opacity: p.alive ? 1 : 0.5 }}>
                    <td>
                      {seen ? <><span className="dot" style={{ background: p.color, marginRight: 6 }} />{p.name} <small className="muted">{getRace(p.raceId).plural}</small></>
                        : <span className="muted">Unknown empire</span>}
                    </td>
                    {HISTORY_STATS.map((s, i) => (
                      <td key={s} className="num">
                        {!seen ? <span className="muted">unknown</span>
                          : !p.alive ? <span className="muted">{p.surrenderedTo !== undefined ? "surrendered" : "eliminated"}</span>
                          : s === "score" && p.id === me.id ? <Tip card={scoreTip(mine)}><span className="explained">{fmt(mine.total)}</span></Tip>
                          : row ? fmt(row[i]!) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel col">
        <div className="row">
          <h2 style={{ margin: 0 }}>History</h2>
          <span className="spacer" />
          {HISTORY_STATS.map((s) => (
            <button key={s} className={`small${s === stat ? " active" : ""}`} title={STAT_INFO[s].text} onClick={() => setStat(s)}>{STAT_INFO[s].label}</button>
          ))}
        </div>
        <HistoryGraph view={view} stat={stat} all={readOnly} />
      </div>
    </div>
  );
}
