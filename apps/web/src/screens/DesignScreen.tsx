import { useMemo, useState } from "react";
import {
  ARMORS, COMPUTERS, HULLS, HULLS_BY_ID, MODULES, SHIELDS, SPECIALS, WEAPONS, designStats, knows, validateDesign,
  type DesignModule, type HullSize, type ShipDesign,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, words } from "../ui/format";
import { ShipSprite } from "../ui/panels";

export function DesignScreen() {
  const { session, view, me, readOnly } = useGame();
  const bestArmor = [...ARMORS].reverse().find((a) => knows(me, a.requires)) ?? ARMORS[0]!;
  const blank = (): ShipDesign => ({
    id: "", name: "New design", hull: "frigate", armor: bestArmor.id, shield: null, computer: null,
    weapons: [], specials: [], module: null, obsolete: false,
  });
  const [draft, setDraft] = useState<ShipDesign>(blank);
  const [addWeapon, setAddWeapon] = useState("");

  // Colony, outpost and troop ships may use hulls not yet researched, like MoO2's fixed colony ship.
  const hulls = HULLS.filter((h) => knows(me, h.requires) || draft.module);
  const armors = ARMORS.filter((a) => knows(me, a.requires));
  const shields = SHIELDS.filter((s) => knows(me, s.requires));
  const computers = COMPUTERS.filter((c) => knows(me, c.requires));
  const weapons = WEAPONS.filter((w) => knows(me, w.requires));
  const specials = SPECIALS.filter((s) => knows(me, s.requires));
  const modules = (Object.keys(MODULES) as DesignModule[]).filter((m) => m !== "outpost" || knows(me, "outpostShip"));

  const stats = useMemo(() => designStats(me, draft), [me, draft]);
  const error = validateDesign(me, draft);
  const update = (patch: Partial<ShipDesign>) => setDraft({ ...draft, ...patch });
  const mount = (weaponId: string, delta: number) => {
    const list = draft.weapons.map((w) => ({ ...w }));
    const m = list.find((w) => w.weaponId === weaponId);
    if (m) m.count = Math.max(0, m.count + delta);
    else if (delta > 0) list.push({ weaponId, count: delta });
    update({ weapons: list.filter((w) => w.count > 0) });
  };

  const save = () => {
    let n = 1;
    while (me.designs.some((d) => d.id === `u${view.turn}-${n}`)) n++;
    session.issue({ type: "saveDesign", design: { ...draft, id: `u${view.turn}-${n}`, obsolete: false } });
    setDraft({ ...draft, name: `${draft.name.replace(/ Mk \d+$/, "")} Mk ${n + 1}` });
  };

  const designs = me.designs.filter((d) => !d.fixed);
  const space = Math.min(100, (stats.spaceUsed / stats.spaceTotal) * 100);

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(380px, 1fr) minmax(380px, 1fr)" }}>
      <div className="panel col">
        <div className="row">
          <h2 style={{ margin: 0 }}>Ship designer</h2>
          <span className="spacer" />
          <button className="small" onClick={() => setDraft(blank())}>New</button>
        </div>
        <div className="blueprint">
          <span className="blueprint-label">Schematic · {draft.name || "unnamed"}</span>
          <span className="blueprint-ship" key={draft.hull}><ShipSprite hull={draft.hull} variantKey={draft.name} size={124} /></span>
          <span className="blueprint-hull">{HULLS_BY_ID[draft.hull]?.name} · {words(stats.role)}</span>
        </div>
        <input type="text" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        <div className="row">
          {hulls.map((h) => (
            <button key={h.id} className={`small${draft.hull === h.id ? " active" : ""}`} onClick={() => update({ hull: h.id as HullSize })}>
              {h.name} <span className="muted">{h.space}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <label>Armor <select value={draft.armor} onChange={(e) => update({ armor: e.target.value })}>
            {armors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
          <label>Shield <select value={draft.shield ?? ""} onChange={(e) => update({ shield: e.target.value || null })}>
            <option value="">None</option>
            {shields.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>Computer <select value={draft.computer ?? ""} onChange={(e) => update({ computer: e.target.value || null })}>
            <option value="">None</option>
            {computers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>Module <select value={draft.module ?? ""} onChange={(e) => update({ module: (e.target.value || null) as DesignModule | null })}>
            <option value="">None</option>
            {modules.map((m) => <option key={m} value={m}>{MODULES[m].name}</option>)}
          </select></label>
        </div>

        <h4>Weapons</h4>
        {draft.weapons.map((w) => {
          const def = WEAPONS.find((x) => x.id === w.weaponId);
          return (
            <div className="row" key={w.weaponId}>
              <span style={{ flex: 1 }}>{def?.name ?? w.weaponId} <small className="muted">{def && `${def.damageMin}-${def.damageMax} dmg, ${words(def.kind)}`}</small></span>
              <button className="small" onClick={() => mount(w.weaponId, -1)}>−</button>
              <b style={{ width: 24, textAlign: "center" }}>{w.count}</b>
              <button className="small" onClick={() => mount(w.weaponId, 1)}>+</button>
            </div>
          );
        })}
        <div className="row">
          <select value={addWeapon} onChange={(e) => setAddWeapon(e.target.value)}>
            <option value="">Add weapon…</option>
            {weapons.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.damageMin}-{w.damageMax})</option>)}
          </select>
          <button className="small" disabled={!addWeapon} onClick={() => { mount(addWeapon, 1); setAddWeapon(""); }}>Add</button>
        </div>

        {specials.length > 0 && (
          <>
            <h4>Specials</h4>
            <div className="row" style={{ gap: 4 }}>
              {specials.map((s) => {
                const on = draft.specials.includes(s.id);
                return (
                  <button key={s.id} className={`small${on ? " active" : ""}`}
                    onClick={() => update({ specials: on ? draft.specials.filter((x) => x !== s.id) : [...draft.specials, s.id] })}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="col" style={{ gap: 4 }}>
          <div className="row"><span>Space</span><span className="spacer" /><span className={stats.spaceUsed > stats.spaceTotal ? "bad" : ""}>{fmt(stats.spaceUsed)} / {fmt(stats.spaceTotal)}</span></div>
          <div className="bar"><div style={{ width: `${space}%`, background: stats.spaceUsed > stats.spaceTotal ? "var(--bad)" : "var(--accent)" }} /></div>
        </div>
        <StatsTable stats={stats} />
        {error && <div className="bad">{error}</div>}
        <button className="primary" disabled={readOnly || !!error || !draft.name.trim()} onClick={save}>Save design</button>
      </div>

      <div className="panel col">
        <h2>Designs</h2>
        {designs.map((d) => {
          const s = designStats(me, d);
          const valid = validateDesign(me, d) === null;
          return (
            <div key={d.id} className="row design-row" style={{ opacity: d.obsolete ? 0.5 : 1, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
              <ShipSprite hull={d.hull} variantKey={d.name} />
              <div style={{ flex: 1 }}>
                <b>{d.name}</b> <span className="muted">{HULLS_BY_ID[d.hull]?.name} · {words(s.role)}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  cost {fmt(s.cost)} · hits {fmt(s.hits)} · attack {fmt(s.attack)} · defense {fmt(s.defense)} · strength {fmt(s.strength)}
                  {!valid && <span className="bad"> · outdated parts</span>}
                </div>
              </div>
              <button className="small" onClick={() => setDraft({ ...structuredClone(d), id: "", name: `${d.name}`, obsolete: false })}>Copy</button>
              <button className="small" disabled={readOnly} onClick={() => session.issue({ type: "obsoleteDesign", designId: d.id, obsolete: !d.obsolete })}>
                {d.obsolete ? "Restore" : "Obsolete"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatsTable({ stats }: { stats: ReturnType<typeof designStats> }) {
  const rows: [string, string][] = [
    ["Cost", fmt(stats.cost)],
    ["Hit points", fmt(stats.hits)],
    ["Shield", fmt(stats.shield)],
    ["Attack", fmt(stats.attack)],
    ["Defense", fmt(stats.defense)],
    ["Combat speed", fmt(stats.combatSpeed)],
    ["Troops", fmt(stats.troops)],
    ["Strength", fmt(stats.strength)],
  ];
  if (stats.missileEvasion) rows.push(["Missile evasion", pct(stats.missileEvasion)]);
  if (stats.pointDefense) rows.push(["Point defense", pct(stats.pointDefense)]);
  if (stats.repair) rows.push(["Repair per round", pct(stats.repair)]);
  return (
    <table>
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}
        <tr><td className="muted">Role</td><td>{words(stats.role)}</td></tr>
      </tbody>
    </table>
  );
}
