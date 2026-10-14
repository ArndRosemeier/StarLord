import { useEffect, useRef, useState } from "react";
import { audio } from "../audio/sound";
import { useReducedMotion } from "../ui/fx";
import type { EndScene3D } from "./endScene3d";
import type { Ending } from "./endings";

/** The scene says when its script ends; this is only a safety net if frames stall (a hidden tab). */
const LONGEST_MS = 40_000;

/**
 * The 3D end sequence behind the game-over card. While `playing`, it shows
 * letterbox bars and the ending's captions and calls `onFinished` when the
 * script ends; once `playing` turns false (finished or skipped) the scene
 * jumps to its end and keeps running quietly behind the card.
 */
export function EndFilm({ ending, playing, onFinished, onFailed }: { ending: Ending; playing: boolean; onFinished: () => void; onFailed: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EndScene3D | null>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  const failed = useRef(onFailed);
  failed.current = onFailed;

  useEffect(() => {
    let cancelled = false;
    let made: EndScene3D | null = null;
    let timer = 0;
    import("./endScene3d").then(async ({ EndScene3D }) => {
      if (cancelled || !host.current) return;
      made = new EndScene3D(host.current, ending.spec, { onSound: (e) => audio.play(e), onFinished: () => finished.current() }, reduced);
      scene.current = made;
      await made.ready();
      if (cancelled) return;
      made.start();
      setReady(true);
      timer = window.setTimeout(() => finished.current(), reduced ? 2500 : LONGEST_MS);
    }).catch(() => {
      if (!cancelled) failed.current();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      made?.destroy();
      scene.current = null;
    };
  }, [ending, reduced]);

  useEffect(() => {
    if (!playing) scene.current?.skip();
  }, [playing]);

  return (
    <div className={`end-film ${ready ? "ready" : ""} ${playing ? "playing" : "done"}`}>
      <div className="end-stage" ref={host} />
      <div className="end-bar top" />
      <div className="end-bar bottom" />
      {playing && ready && (
        <div className="end-captions" aria-live="polite">
          <h1>{ending.text.title}</h1>
          {ending.text.lines.map((l, i) => <p key={i} style={{ animationDelay: `${2.2 + i * 1.6}s` }}>{l}</p>)}
        </div>
      )}
    </div>
  );
}
