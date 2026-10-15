import { SPY, securityLevel, spyEdge, spyOdds, spyingLevel, type PlayerView, type SpyMission } from "@starlord/sim";
import { Tip, type TipCard } from "../ui/Tip";
import { pct } from "../ui/format";
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
          <thead><tr><th>Empire</th><th>Spies</th><th>Mission</th><th>Each turn</th></tr></thead>
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
                      <Tip key={m} card={() => missionTip(view, me.id, p.id, Math.max(1, a.count), m)}>
                        <button className={`small${a.mission === m && a.count > 0 ? " active" : ""}`} disabled={readOnly || a.count === 0}
                          onClick={() => set(p.id, a.count, m)} style={{ marginRight: 4 }}>{m === "idle" ? "Lie low" : words(m)}</button>
                      </Tip>
                    ))}
                  </td>
                  <td className="muted">{a.count > 0 ? oddsLine(view, me.id, p.id, a.count, a.mission) : "—"}</td>
                </tr>
              );
            })}
            {targets.length === 0 && <tr><td colSpan={4} className="muted">No known empires to spy on.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MISSION_TEXT: Record<SpyMission, string> = {
  steal: "Steals a technology they know and you don't (never from the field you are researching); pricier techs are likelier.",
  sabotage: "Destroys one of their buildings; pricier buildings are likelier.",
  idle: "No mission: the spies only hide, which makes them harder to catch.",
};

export function oddsLine(view: PlayerView, me: number, target: number, count: number, mission: SpyMission): string {
  const o = spyOdds(spyEdge(view, me, target, count), mission);
  const lines = mission === "idle" ? [] : [`${pct(o.success)} success`];
  lines.push(`${pct(o.lost)} lose a spy`);
  if (view.players[target]!.spies.home > 0) lines.push(`${pct(o.killDefender)} kill one of theirs`);
  return lines.join(", ");
}

export function missionTip(view: PlayerView, me: number, target: number, count: number, mission: SpyMission): TipCard {
  const o = spyOdds(spyEdge(view, me, target, count), mission);
  const rows: [string, string][] = [];
  if (mission !== "idle") {
    rows.push(["Success", pct(o.success)]);
    rows.push(["Blamed on a third empire", pct(o.blame)]);
  }
  rows.push(["One of your spies caught", pct(o.lost)]);
  if (view.players[target]!.spies.home > 0) rows.push(["One of their spies killed", pct(o.killDefender)]);
  return {
    title: mission === "idle" ? "Lie low" : mission === "steal" ? "Steal" : "Sabotage", kind: `${count} spy${count > 1 ? "s" : ""}, each turn`,
    rows,
    text: [MISSION_TEXT[mission], `Success needs ${mission === "steal" ? SPY.steal : SPY.sabotage} on d100 + your edge − d100; ${SPY.blame}+ frames someone else. More spies and higher spying over their security raise the edge; their spies at home lower it.`],
    note: "Each theft or sabotage costs relations with the victim -(d15 + d5) (or with whoever was framed), and a computer ruler may count it as a strike.",
  };
}
