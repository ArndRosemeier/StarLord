import { useEffect, useState } from "react";
import { EndFilm } from "./EndFilm";
import type { Ending } from "./endings";

/** Plays one end sequence full screen (debug menu); a click or key skips it, a second one closes it. */
export function EndPreview({ ending, onClose }: { ending: Ending; onClose: () => void }) {
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const onKey = () => (playing ? setPlaying(false) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, onClose]);
  return (
    <div className={`game-over film ${ending.won ? "won" : "lost"} ${playing ? "playing" : ""}`} onClick={() => (playing ? setPlaying(false) : onClose())}>
      <EndFilm ending={ending} playing={playing} onFinished={() => setPlaying(false)} onFailed={onClose} />
      {!playing && <div className="card"><button className="primary" onClick={onClose}>Close preview</button></div>}
    </div>
  );
}
