import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CombatReport } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { aftermathLines } from "../ui/format";
import { audio } from "../audio/sound";
import { useReducedMotion } from "../ui/fx";
import { webglAvailable } from "../three/webgl";
import { REPLAY_SPEEDS, updatePrefs, usePrefs } from "../game/prefs";
import { Combat2D } from "./combat/Combat2D";
import { stepMs, describe, framesAt, replaySteps, unitAlive, unitInfo } from "./combat/replayModel";

const Combat3D = lazy(() => import("./combat/Combat3D"));

const VIEW_KEY = "starlord.combatView";

function savedView(): "3d" | "2d" {
  try {
    return localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

/** Plays back a battle from its recorded events, one event per step, with the moves and shots animated between steps. */
export function CombatReplay({ report }: { report: CombatReport }) {
  const { view } = useGame();
  const steps = useMemo(() => replaySteps(report), [report]);
  // Built once per battle, so the 3D scene is not rebuilt when unrelated game state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const units = useMemo(() => unitInfo(report, view), [report]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const reduced = useReducedMotion();
  const { replaySpeed } = usePrefs();
  const [mode, setMode] = useState<"3d" | "2d">(() => (webglAvailable() ? savedView() : "2d"));
  const [failed, setFailed] = useState(false);
  const use3d = mode === "3d" && !failed;

  const frames = useMemo(() => framesAt(report, steps, step), [report, steps, step]);
  const event = steps[step - 1]?.e;

  useEffect(() => {
    // Back to whatever played before (galaxy, or victory/defeat when the battle ended the game).
    const before = audio.setMood("combat");
    return () => {
      if (audio.getMood() === "combat") audio.setMood(before === "none" ? "galaxy" : before);
    };
  }, []);

  useEffect(() => {
    if (!playing || step >= steps.length) return;
    const t = setTimeout(() => setStep(step + 1), stepMs());
    return () => clearTimeout(t);
  }, [playing, step, steps.length]);

  // A kill booms while the battle plays; scrubbing stays quiet.
  useEffect(() => {
    if (playing && event?.kind === "destroyed") audio.play("boom");
  }, [playing, event]);

  const switchView = (next: "3d" | "2d") => {
    setMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage may be blocked; the choice then lasts for this replay only.
    }
  };

  const round = steps[Math.max(0, step - 1)]?.round ?? 0;
  const [a, b] = report.sides;
  const name = (id: number) => view.players[id]?.name ?? "Unknown";
  const alive = (id: number) => report.ships.filter((s) => s.ownerId === id && unitAlive(frames, s.key)).length;
  const done = step >= steps.length;
  const props = { report, view, units, frames, event, step, reduced, resetKey };
  const flat = <Combat2D {...props} />;

  return (
    <div className="col combat">
      <div className="combat-head">
        <span className="combat-side" style={{ color: view.players[a]?.color }}>
          <span className="dot glow" style={{ background: view.players[a]?.color }} /> {name(a)} <small>{alive(a)} ships</small>
        </span>
        <span className="combat-round">Round {round + 1}</span>
        <span className="combat-side right" style={{ color: view.players[b]?.color }}>
          <small>{alive(b)} ships</small> {name(b)} <span className="dot glow" style={{ background: view.players[b]?.color }} />
        </span>
      </div>
      <div className="combat-field">
        {use3d ? (
          <Fallback onError={() => setFailed(true)} fallback={flat}>
            <Suspense fallback={<div className="combat-3d" />}>
              <Combat3D {...props} onFail={() => setFailed(true)} />
            </Suspense>
          </Fallback>
        ) : flat}
        {done && (
          <div className="combat-result">
            {report.winner === null ? "No winner" : <><span style={{ color: view.players[report.winner]?.color }}>{name(report.winner)}</span> victorious</>}
          </div>
        )}
      </div>
      <div className="row">
        <button className="small" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <button className="small" onClick={() => { setStep(0); setPlaying(true); setResetKey((k) => k + 1); }}>Restart</button>
        <button className="small" onClick={() => { setPlaying(false); setStep(steps.length); }}>Skip to end</button>
        <button className="small" title="Replay speed (also in Game › Settings). Click for the next speed."
          onClick={() => updatePrefs({ replaySpeed: REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(replaySpeed as never) + 1) % REPLAY_SPEEDS.length]! })}>
          {replaySpeed}×
        </button>
        {webglAvailable() && !failed && (
          <button className="small" title="Switch between the 3D and the flat battle view" onClick={() => switchView(use3d ? "2d" : "3d")}>
            {use3d ? "2D view" : "3D view"}
          </button>
        )}
        <input type="range" min={0} max={steps.length} value={step} style={{ flex: 1 }} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} />
        <span className="muted combat-log">
          {done
            ? report.winner === null ? "No winner" : `${name(report.winner)} won`
            : describe(report, event)}
        </span>
      </div>
      {done && aftermathLines(view, report).map((line) => <p key={line} className="muted" style={{ margin: "4px 0 0" }}>{line}</p>)}
    </div>
  );
}

/** Shows `fallback` instead of children that throw, e.g. when the 3D view fails to start. */
class Fallback extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
