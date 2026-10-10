import { useEffect, useMemo, useRef, useState } from "react";
import { FIELD_HEIGHT, FIELD_WIDTH, WEAPONS_BY_ID, type CombatReport, type CombatRoundEvent } from "@starlord/sim";
import { useGame } from "../ui/hooks";

const CELL = 26;
const STEP_MS = 160;

interface ShipState {
  x: number;
  y: number;
  hits: number;
  alive: boolean;
  gone: boolean;
}

/** Plays back a battle from its recorded events, one event per step. */
export function CombatReplay({ report }: { report: CombatReport }) {
  const { view } = useGame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const steps = useMemo(() => report.rounds.flatMap((r, round) => r.map((e) => ({ round, e }))), [report]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Ship states after `step` events.
  const frame = useMemo(() => {
    const ships = new Map<string, ShipState>(report.ships.map((s) => [s.key, { x: s.x, y: s.y, hits: s.maxHits, alive: true, gone: false }]));
    for (let i = 0; i < step && i < steps.length; i++) apply(ships, steps[i]!.e);
    return ships;
  }, [report, steps, step]);

  useEffect(() => {
    if (!playing || step >= steps.length) return;
    const t = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, steps.length]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FIELD_WIDTH * CELL, FIELD_HEIGHT * CELL);
    ctx.fillStyle = "#04050b";
    ctx.fillRect(0, 0, FIELD_WIDTH * CELL, FIELD_HEIGHT * CELL);
    ctx.strokeStyle = "rgba(90,110,160,0.08)";
    for (let x = 0; x <= FIELD_WIDTH; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, FIELD_HEIGHT * CELL); ctx.stroke(); }
    for (let y = 0; y <= FIELD_HEIGHT; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(FIELD_WIDTH * CELL, y * CELL); ctx.stroke(); }

    const current = steps[step - 1]?.e;
    if (current?.kind === "fire" && current.target) {
      const a = frame.get(current.ship);
      const b = frame.get(current.target);
      if (a && b) {
        const kind = current.weapon ? WEAPONS_BY_ID[current.weapon]?.kind : undefined;
        ctx.strokeStyle = !current.hit ? "rgba(200,200,200,0.4)" : kind === "beam" || !kind ? "#ff5a5a" : "#ffd32a";
        ctx.lineWidth = current.hit ? 2.5 : 1;
        ctx.setLineDash(kind === "missile" || kind === "torpedo" ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo((a.x + 0.5) * CELL, (a.y + 0.5) * CELL);
        ctx.lineTo((b.x + 0.5) * CELL, (b.y + 0.5) * CELL);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const s of report.ships) {
      const st = frame.get(s.key)!;
      if (st.gone) continue;
      const color = view.players[s.ownerId]?.color ?? "#999";
      const cx = (st.x + 0.5) * CELL;
      const cy = (st.y + 0.5) * CELL;
      ctx.globalAlpha = st.alive ? 1 : 0.25;
      ctx.fillStyle = color;
      if (s.isPlanet) {
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const dir = s.ownerId === report.sides[0] ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + dir * CELL * 0.45, cy);
        ctx.lineTo(cx - dir * CELL * 0.35, cy - CELL * 0.3);
        ctx.lineTo(cx - dir * CELL * 0.35, cy + CELL * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      if (st.alive) {
        const w = CELL * 0.9;
        ctx.fillStyle = "#300";
        ctx.fillRect(cx - w / 2, cy + CELL * 0.45, w, 3);
        ctx.fillStyle = "#4fd18b";
        ctx.fillRect(cx - w / 2, cy + CELL * 0.45, w * Math.max(0, st.hits / s.maxHits), 3);
      }
      ctx.globalAlpha = 1;
    }
  }, [frame, report, step, steps, view]);

  const round = steps[Math.max(0, step - 1)]?.round ?? 0;
  const [a, b] = report.sides;
  const name = (id: number) => view.players[id]?.name ?? "Unknown";

  return (
    <div className="col">
      <div className="row">
        <span><span className="dot" style={{ background: view.players[a]?.color }} /> {name(a)}</span>
        <span className="muted">vs</span>
        <span><span className="dot" style={{ background: view.players[b]?.color }} /> {name(b)}</span>
        <span className="spacer" />
        <span className="muted">Round {round + 1}</span>
      </div>
      <canvas ref={canvas} width={FIELD_WIDTH * CELL} height={FIELD_HEIGHT * CELL} style={{ width: "100%", borderRadius: 8 }} />
      <div className="row">
        <button className="small" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <button className="small" onClick={() => { setStep(0); setPlaying(true); }}>Restart</button>
        <button className="small" onClick={() => { setPlaying(false); setStep(steps.length); }}>Skip to end</button>
        <input type="range" min={0} max={steps.length} value={step} style={{ flex: 1 }} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} />
        <span className="muted">
          {step >= steps.length
            ? report.winner === null ? "No winner" : `${name(report.winner)} won`
            : describe(report, steps[step - 1]?.e)}
        </span>
      </div>
    </div>
  );
}

function apply(ships: Map<string, ShipState>, e: CombatRoundEvent): void {
  const s = ships.get(e.ship);
  if (!s) return;
  switch (e.kind) {
    case "move":
      s.x = e.x ?? s.x;
      s.y = e.y ?? s.y;
      break;
    case "fire": {
      const t = e.target ? ships.get(e.target) : undefined;
      if (t) t.hits -= e.damage ?? 0;
      break;
    }
    case "destroyed":
      s.alive = false;
      break;
    case "retreat":
      s.gone = true;
      break;
  }
}

function describe(report: CombatReport, e: CombatRoundEvent | undefined): string {
  if (!e) return "";
  const n = (k?: string) => report.ships.find((s) => s.key === k)?.name ?? "?";
  switch (e.kind) {
    case "move": return `${n(e.ship)} moves`;
    case "fire": return e.hit ? `${n(e.ship)} hits ${n(e.target)} for ${e.damage}` : `${n(e.ship)} misses ${n(e.target)}`;
    case "destroyed": return `${n(e.ship)} destroyed`;
    case "retreat": return `${n(e.ship)} retreats`;
  }
}
