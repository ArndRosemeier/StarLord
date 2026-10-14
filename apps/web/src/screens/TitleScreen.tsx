import { useEffect, useRef, useState } from "react";
import { audio } from "../audio/sound";
import { GameSession } from "../game/session";
import { latestSave } from "../game/saves";
import { LoadGame } from "./LoadGame";
import { SettingsPanel } from "./SettingsPanel";
import { useHelp } from "../help/HelpDialog";
import type { TitleScene3D } from "../title/titleScene3d";
import { webglAvailable } from "../three/webgl";
import { RaceShowcase } from "../title/RaceShowcase";
import { NewsTicker } from "../title/NewsTicker";
import { VERSION } from "../changelog/changelog";
import { WhatsNew } from "../changelog/WhatsNew";
import { HallOfFame } from "./HallOfFame";
import { openContactMail } from "../title/contact";

/** Painted nebulae behind the title scene; each start picks one, maybe mirrored and slightly re-tinted. */
const NEBULAE = ["art/title-nebula.webp", "art/title-nebula-2.webp", "art/title-nebula-3.webp"];

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

/** The game's front door: a living 3D space scene, theme music, the races and the main menu. */
export function TitleScreen({ onNewGame, onStart }: { onNewGame: (raceId?: string) => void; onStart: (s: GameSession) => void }) {
  const [settings, setSettings] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);
  const [hall, setHall] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const openHelp = useHelp();
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TitleScene3D | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [nebula] = useState(() => ({
    backgroundImage: `url(${NEBULAE[Math.floor(Math.random() * NEBULAE.length)]})`,
    scale: Math.random() < 0.5 ? "-1 1" : undefined,
    filter: `hue-rotate(${Math.round(Math.random() * 50 - 25)}deg)`,
  }));
  const latest = latestSave();

  useEffect(() => { audio.setMood("menu"); }, []);

  // The 3D scene loads after the title is up; until it is ready the painted nebula shows on its own.
  useEffect(() => {
    if (!webglAvailable()) return;
    let cancelled = false;
    let scene: TitleScene3D | null = null;
    void import("../title/titleScene3d").then(async ({ TitleScene3D }) => {
      if (cancelled || !stageRef.current) return;
      scene = new TitleScene3D(stageRef.current, artRef.current, {
        onToast: (text) => setToast({ text, id: Date.now() }),
        onSound: (effect) => audio.play(effect),
      }, reduced);
      sceneRef.current = scene;
      await scene.ready();
      if (cancelled) return;
      scene.start();
      setSceneReady(true);
    });
    return () => {
      cancelled = true;
      scene?.destroy();
      sceneRef.current = null;
      setSceneReady(false);
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

  return (
    <div className={`title-hero${leaving ? " leaving" : ""}${reduced ? " still" : ""}`}>
      <div className="title-art" ref={artRef} style={nebula} />
      <div className="title-vignette" />
      <div className={`title-canvas${sceneReady ? " ready" : ""}`} ref={stageRef} onClick={(e) => sceneRef.current?.click(e.clientX, e.clientY)} />
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
          <button className="title-button" onClick={() => setLoading(true)} title="Pick one of your saves, or load a save or replay file">
            Load game {latest && <small>newest: {latest.empire}, turn {latest.turn}</small>}
          </button>
          <button className="title-button" onClick={() => openHelp()}>Encyclopedia</button>
          <button className="title-button" onClick={() => setHall(true)}>Hall of Fame</button>
          <button className="title-button" onClick={() => setWhatsNew(true)}>What's new <small>v{VERSION}</small></button>
          <button className="title-button" onClick={() => setSettings(!settings)}>Settings</button>
          <button className="title-button" onClick={() => openContactMail(VERSION)} title="Write an email to the developer: feedback, bugs, ideas">Contact</button>
          {settings && <div className="panel title-settings"><SettingsPanel shortcuts={false} /></div>}
        </div>
        <RaceShowcase onPick={newGame} reduced={reduced} />
        {!reduced && <div className="title-hint">Psst: the ships can be clicked. So can empty space.</div>}
      </div>
      <div className="title-version">v{VERSION}</div>
      <NewsTicker reduced={reduced} />
      {whatsNew && <WhatsNew onClose={() => setWhatsNew(false)} />}
      {hall && <HallOfFame onClose={() => setHall(false)} />}
      {loading && <LoadGame onLoad={(data) => onStart(GameSession.fromJSON(data))} onClose={() => setLoading(false)} />}
    </div>
  );
}
