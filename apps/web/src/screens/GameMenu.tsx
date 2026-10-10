import { useState } from "react";
import { useGame } from "../ui/hooks";
import { downloadSave, listSaves, writeSave } from "../game/saves";

export function GameMenu({ onQuit }: { onQuit: () => void }) {
  const { session, view, me } = useGame();
  const [name, setName] = useState(`${me.name} turn ${view.turn}`);
  const [message, setMessage] = useState<string | null>(null);
  const saves = listSaves();

  const save = () => {
    try {
      writeSave(name.trim() || "Quick save", session.toJSON());
      setMessage(`Saved as "${name}".`);
    } catch (e) {
      setMessage(`Could not save in the browser (${(e as Error).message}). Use "Download save file" instead.`);
    }
  };

  return (
    <div className="col" style={{ maxWidth: 640 }}>
      <div className="panel col">
        <h2>Game</h2>
        <div className="muted">
          Seed {view.seed} · {view.settings.galaxySize} galaxy · turn {view.turn} of {view.settings.maxTurns}
        </div>
        <div className="row">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" onClick={save}>Save</button>
        </div>
        <div className="row">
          <button onClick={() => downloadSave(session.toJSON(), `starlord-${view.seed}-t${view.turn}.json`)}>Download save file</button>
          {session.record && (
            <button title="Every turn's orders from the start. Load it from the title screen to watch the game again."
              onClick={() => downloadSave(session.record!, `starlord-${view.seed}-replay.json`)}>Download replay</button>
          )}
          <button onClick={() => setMessage(session.verifyRecord().message)}>Verify replay</button>
          <button className="danger" onClick={() => confirm("Quit to the title screen? Unsaved progress is lost.") && onQuit()}>Quit to title</button>
        </div>
        {message && <div>{message}</div>}
        {saves.length > 0 && <div className="muted">{saves.length} saved game{saves.length === 1 ? "" : "s"} in this browser; load them from the title screen.</div>}
      </div>
    </div>
  );
}
