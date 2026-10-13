import { AudioControls } from "../ui/AudioControls";
import { REPLAY_SPEEDS, updatePrefs, usePrefs } from "../game/prefs";
import { useLastAutosave } from "../game/autosave";
import { AUTOSAVES_KEPT } from "../game/saves";
import { OTHER_KEYS, SHORTCUTS } from "../ui/shortcuts";
import { STEP_MS } from "./combat/replayModel";

/** Settings kept in this browser for every game: sound, battle replay speed, autosave, plus the keyboard shortcuts. */
export function SettingsPanel({ shortcuts = true }: { shortcuts?: boolean }) {
  const prefs = usePrefs();
  const last = useLastAutosave();
  return (
    <div className="col settings-panel" style={{ gap: 12 }}>
      <section className="col" style={{ gap: 6 }}>
        <h4 style={{ margin: 0 }}>Sound</h4>
        <AudioControls />
      </section>
      <section className="col" style={{ gap: 6 }}>
        <h4 style={{ margin: 0 }}>Battles</h4>
        <label className="row" style={{ justifyContent: "space-between" }}
          title="How fast battle replays play. Each shot or move of the replay takes this long.">
          Replay speed
          <select value={prefs.replaySpeed} onChange={(e) => updatePrefs({ replaySpeed: Number(e.target.value) })}>
            {REPLAY_SPEEDS.map((s) => (
              <option key={s} value={s}>{s}× ({Math.round(STEP_MS / s)} ms per step)</option>
            ))}
          </select>
        </label>
      </section>
      <section className="col" style={{ gap: 6 }}>
        <h4 style={{ margin: 0 }}>Autosave</h4>
        <label className="row" style={{ gap: 6 }}
          title={`Saves the game in this browser at the start of every turn and when you leave the page. The newest ${AUTOSAVES_KEPT} autosaves are kept; "Continue" on the title screen loads the newest save.`}>
          <input type="checkbox" checked={prefs.autosave} onChange={(e) => updatePrefs({ autosave: e.target.checked })} />
          <span>Save automatically every turn</span>
        </label>
        <small className="muted">At every new turn and when you leave the page. The newest {AUTOSAVES_KEPT} are kept; Continue on the title screen loads your newest save.</small>
        {last && (last.ok
          ? <small className="muted">Last autosave: turn {last.turn}.</small>
          : <small className="bad">Autosave failed on turn {last.turn}: {last.reason}. Delete old saves or use "Download save file".</small>)}
      </section>
      {shortcuts && <ShortcutList />}
    </div>
  );
}

/** Every keyboard shortcut; each also has a button on screen. */
export function ShortcutList() {
  const rows = [...SHORTCUTS.map((s) => ({ label: s.label, what: s.what })), ...OTHER_KEYS];
  return (
    <section className="col" style={{ gap: 6 }}>
      <h4 style={{ margin: 0 }}>Keyboard shortcuts</h4>
      <table className="shortcut-list">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ whiteSpace: "nowrap", paddingRight: 12 }}><kbd>{r.label}</kbd></td>
              <td>{r.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className="muted">Letter keys do nothing while you type in a field or while a window is open.</small>
    </section>
  );
}
