import { useState } from "react";
import { useGame } from "../ui/hooks";
import { downloadSave, listSaves, writeSave } from "../game/saves";
import { inFrame } from "../net/cuedPlayer";
import { SettingsPanel } from "./SettingsPanel";
import { autosave } from "../game/autosave";
import { ask } from "../ui/confirm";

/** Why downloads are off inside another page (cued): its frame blocks them. */
const FRAMED = "Downloads are blocked while StarLord runs inside another page (like cued). Saves in this browser still work; open apps.futuremagic.de/starlord directly to download a file.";

export function GameMenu({ onQuit }: { onQuit: () => void }) {
  const { session, view, me, readOnly } = useGame();
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
          Seed {view.seed} · {view.settings.galaxySize} galaxy · turn {view.turn}{view.settings.maxTurns > 0 ? ` of ${view.settings.maxTurns}` : ""}
        </div>
        <div className="row">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" onClick={save}>Save</button>
        </div>
        <div className="row">
          <button disabled={inFrame} title={inFrame ? FRAMED : undefined}
            onClick={() => downloadSave(session.toJSON(), `starlord-${view.seed}-t${view.turn}.json`)}>Download save file</button>
          {session.record && (
            <button disabled={inFrame} title={inFrame ? FRAMED : "Every turn's orders from the start. Load it from the title screen to watch the game again."}
              onClick={() => downloadSave(session.record!, `starlord-${view.seed}-replay.json`)}>Download replay</button>
          )}
          <button onClick={() => setMessage(session.verifyRecord().message)}>Verify replay</button>
          <button className="danger" onClick={async () => {
            const saved = !readOnly && autosave(session)?.ok;
            if (session.online) {
              if (await ask(`Leave the online game? Your empire waits for you: open the room link (or join room ${session.online.roomCode}) to come back. Until then the turn waits for you, unless the host lets the computer play your empire.`)) onQuit();
              return;
            }
            if (await ask(saved ? "Quit to the title screen? The game was autosaved; Continue on the title screen picks it up." : "Quit to the title screen? Unsaved progress is lost.")) onQuit();
          }}>Quit to title</button>
        </div>
        {message && <div>{message}</div>}
        {saves.length > 0 && <div className="muted">{saves.length} saved game{saves.length === 1 ? "" : "s"} in this browser; load them from the title screen.</div>}
      </div>
      <div className="panel col" id="settings">
        <h2>Settings</h2>
        {!readOnly && (
          <section className="col" style={{ gap: 6 }}>
            <h4 style={{ margin: 0 }}>This game</h4>
            <label className="row" style={{ gap: 6 }}
              title="Only for this game. Early on every colony should build something; with many colonies Trade Goods are often fine.">
              <input type="checkbox" checked={!me.idleAlertOff} onChange={(e) => session.issue({ type: "setIdleAlert", on: e.target.checked })} />
              <span>Before ending the turn, warn me about colonies making only Trade Goods</span>
            </label>
            <label className="row" style={{ gap: 6 }}
              title="When on, the turn stops at every battle you take part in: you choose to command it (move and target each of your ships, stations and planets on their turns) or let it resolve. When off, battles resolve by your combat doctrine and you watch the replay after the turn.">
              <input type="checkbox" checked={!me.autoBattles} onChange={(e) => session.issue({ type: "setAutoBattles", on: !e.target.checked })} />
              <span>Let me command my battles (otherwise they resolve by themselves)</span>
            </label>
          </section>
        )}
        <SettingsPanel />
      </div>
    </div>
  );
}
