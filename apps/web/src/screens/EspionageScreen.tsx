import { securityLevel, spyingLevel, type SpyMission } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, words } from "../ui/format";

export function EspionageScreen() {
  const { session, view, me, readOnly } = useGame();
  const targets = view.players.filter((p) => p.kind === "empire" && p.alive && p.id !== me.id && me.contacts.includes(p.id));
  const set = (target: number, count: number, mission: SpyMission) => session.issue({ type: "setSpies", target, count, mission });

  return (
    <div className="col" style={{ maxWidth: 900 }}>
      <div className="panel row" style={{ flexWrap: "nowrap", gap: 18, alignItems: "center" }}>
        <div className="radar" aria-hidden>
          {targets.map((p, i) => {
            const a = (i / Math.max(1, targets.length)) * Math.PI * 2 + 0.6;
            const d = 22 + ((i * 37) % 24);
            return <i key={p.id} style={{ left: `${50 + Math.cos(a) * d}%`, top: `${50 + Math.sin(a) * d}%`, animationDelay: `${(a / (Math.PI * 2)) * 3}s` }} />;
          })}
        </div>
        <div className="col" style={{ flex: 1 }}>
        <h2>Espionage</h2>
        <div className="row">
          <span className="chip">Spies at home: <b>{me.spies.home}</b> <span className="spy-chip">{Array.from({ length: Math.min(12, me.spies.home) }, (_, i) => <i key={i} />)}</span></span>
          <span className="chip">Spying level {fmt(spyingLevel(me, view), 1)}</span>
          <span className="chip">Security level {fmt(securityLevel(view, me.id), 1)}</span>
        </div>
        <div className="muted">
          Spies at home protect you from enemy agents. Train more with the "Train Spy" project in any colony's build queue.
          Abroad they steal technology or sabotage; each point of spying over the target's security improves the odds.
        </div>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Empire</th><th>Spies</th><th>Mission</th></tr></thead>
          <tbody>
            {targets.map((p) => {
              const a = me.spies.abroad[p.id] ?? { count: 0, mission: "steal" as SpyMission };
              return (
                <tr key={p.id}>
                  <td><span className="dot" style={{ background: p.color, marginRight: 6 }} />{p.name}</td>
                  <td>
                    <div className="row">
                      <button className="small" disabled={readOnly || a.count === 0} onClick={() => set(p.id, a.count - 1, a.mission)}>−</button>
                      <b style={{ width: 22, textAlign: "center" }}>{a.count}</b>
                      <button className="small" disabled={readOnly || me.spies.home === 0} onClick={() => set(p.id, a.count + 1, a.mission === "idle" ? "steal" : a.mission)}>+</button>
                    </div>
                  </td>
                  <td>
                    {(["steal", "sabotage", "idle"] as const).map((m) => (
                      <button key={m} className={`small${a.mission === m && a.count > 0 ? " active" : ""}`} disabled={readOnly || a.count === 0}
                        onClick={() => set(p.id, a.count, m)} style={{ marginRight: 4 }}>{m === "idle" ? "Lie low" : words(m)}</button>
                    ))}
                  </td>
                </tr>
              );
            })}
            {targets.length === 0 && <tr><td colSpan={3} className="muted">No known empires to spy on.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
