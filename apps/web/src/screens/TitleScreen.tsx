import { useEffect, useState } from "react";
import { audio } from "../audio/sound";
import { GameSession } from "../game/session";
import { listSaves, readSave, readSaveFile } from "../game/saves";
import { AudioControls } from "../ui/AudioControls";
import { useHelp } from "../help/HelpDialog";

/** The game's front door: key art, theme music and the main menu. */
export function TitleScreen({ onNewGame, onStart }: { onNewGame: () => void; onStart: (s: GameSession) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const openHelp = useHelp();
  const latest = listSaves().sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];

  useEffect(() => audio.setMood("menu"), []);

  const load = (data: unknown) => {
    try {
      onStart(GameSession.fromJSON(data));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="title-hero">
      <div className="title-art" />
      <div className="title-vignette" />
      <div className="title-content">
        <h1 className="title-logo">STARLORD</h1>
        <div className="title-tagline">Forge an empire among the stars</div>
        <div className="title-menu">
          <button className="title-button primary" onClick={onNewGame}>New game</button>
          {latest && (
            <button className="title-button" onClick={() => load(readSave(latest.name))} title={latest.name}>
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
          <button className="title-button" onClick={() => setSettings(!settings)}>Sound</button>
          {settings && <div className="panel title-settings"><AudioControls /></div>}
          {error && <div className="bad">{error}</div>}
        </div>
      </div>
    </div>
  );
}
