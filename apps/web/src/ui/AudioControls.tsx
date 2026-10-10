import { audio, useAudioSettings } from "../audio/sound";

/** Music and effects volume sliders plus a mute switch. */
export function AudioControls() {
  const s = useAudioSettings();
  return (
    <div className="col" style={{ gap: 6, minWidth: 220 }}>
      <label className="row" style={{ justifyContent: "space-between" }}>
        Music
        <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => audio.update({ music: Number(e.target.value) })} />
      </label>
      <label className="row" style={{ justifyContent: "space-between" }}>
        Effects
        <input type="range" min={0} max={1} step={0.05} value={s.effects}
          onChange={(e) => audio.update({ effects: Number(e.target.value) })} onPointerUp={() => audio.play("select")} />
      </label>
      <label className="row">
        <input type="checkbox" checked={s.muted} onChange={(e) => audio.update({ muted: e.target.checked })} /> Mute all sound
      </label>
    </div>
  );
}

/** A compact speaker button for the top bar. */
export function MuteButton() {
  const s = useAudioSettings();
  return (
    <button className="small" title={s.muted ? "Sound off" : "Sound on"} onClick={() => audio.update({ muted: !s.muted })}>
      {s.muted ? "🔇" : "🔊"}
    </button>
  );
}
