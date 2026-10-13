import { useEffect, useRef, useState } from "react";
import { audio } from "../audio/sound";
import { GameSession } from "../game/session";
import { latestSave, readSave, readSaveFile } from "../game/saves";
import { SettingsPanel } from "./SettingsPanel";
import { useHelp } from "../help/HelpDialog";
import { HeroScene } from "../title/heroScene";
import { RaceShowcase } from "../title/RaceShowcase";
import { NewsTicker } from "../title/NewsTicker";
import { VERSION } from "../changelog/changelog";
import { WhatsNew } from "../changelog/WhatsNew";
import { openContactMail } from "../title/contact";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** The game's front door: living key art, theme music, the races and the main menu. */
export function TitleScreen({ onNewGame, onStart }: { onNewGame: (raceId?: string) => void; onStart: (s: GameSession) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const openHelp = useHelp();
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const latest = latestSave();

  useEffect(() => { audio.setMood("menu"); }, []);

  useEffect(() => {
    const scene = new HeroScene(canvasRef.current!, artRef.current, {
      onToast: (text) => setToast({ text, id: Date.now() }),
      onSound: (effect) => audio.play(effect),
    }, reduced);
    sceneRef.current = scene;
    scene.start();
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Up, up, down, down, left, right, left, right, B, A.
  useEffect(() => {
    let at = 0;
    const onKey = (e: KeyboardEvent) => {
      const want = KONAMI[at]!;
      at = e.key.toLowerCase() === want.toLowerCase() ? at + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (at === KONAMI.length) {
        at = 0;
        sceneRef.current?.armada();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const newGame = (raceId?: string) => {
    if (leaving) return;
    setLeaving(true);
    const go = () => onNewGame(raceId);
    if (sceneRef.current) sceneRef.current.jump(go);
    else go();
  };

  const load = (data: unknown) => {
    try {
      onStart(GameSession.fromJSON(data));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className={`title-hero${leaving ? " leaving" : ""}${reduced ? " still" : ""}`}>
      <div className="title-art" ref={artRef} />
      <div className="title-vignette" />
      <canvas className="title-canvas" ref={canvasRef} onClick={(e) => sceneRef.current?.click(e.clientX, e.clientY)} />
      <div className="title-content">
        <h1 className="title-logo" aria-label="StarLord">
          {"STARLORD".split("").map((c, i) => <span key={i} className="title-letter" style={{ ["--i" as string]: i }} aria-hidden="true">{c}</span>)}
          <span className="title-shine" aria-hidden="true">STARLORD</span>
          <span className="title-glint" aria-hidden="true" />
        </h1>
        <div className="title-tagline">Forge an empire among the stars</div>
        <div className="title-tribute">A tribute to the masterful Master of Orion II</div>
        {toast && <div className="title-toast" key={toast.id}>{toast.text}</div>}
        <div className="title-menu">
          <button className="title-button primary" onClick={() => newGame()}>New game</button>
          {latest && (
            <button className="title-button" onClick={() => load(readSave(latest.name))} title={`Loads your newest save: ${latest.name}`}>
              Continue <small>{latest.empire}, turn {latest.turn}</small>
            </button>
          )}
          <label className="title-button">
            Load file
            <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await readSaveFile(f).catch((err: Error) => setError(err.message)));
            }} />
          </label>
          <button className="title-button" onClick={() => openHelp()}>Encyclopedia</button>
          <button className="title-button" onClick={() => setWhatsNew(true)}>What's new <small>v{VERSION}</small></button>
          <button className="title-button" onClick={() => setSettings(!settings)}>Settings</button>
          <button className="title-button" onClick={() => openContactMail(VERSION)} title="Write an email to the developer: feedback, bugs, ideas">Contact</button>
          {settings && <div className="panel title-settings"><SettingsPanel shortcuts={false} /></div>}
          {error && <div className="bad">{error}</div>}
        </div>
        <RaceShowcase onPick={newGame} reduced={reduced} />
        {!reduced && <div className="title-hint">Psst: the ships can be clicked. So can empty space.</div>}
      </div>
      <div className="title-version">v{VERSION}</div>
      <NewsTicker reduced={reduced} />
      {whatsNew && <WhatsNew onClose={() => setWhatsNew(false)} />}
    </div>
  );
}
