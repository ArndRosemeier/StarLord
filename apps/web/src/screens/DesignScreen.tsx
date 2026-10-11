import { useMemo, useState } from "react";
import {
  ARCS, ARMORS, COMPUTERS, HULLS, HULLS_BY_ID, MISSILE_RACKS, MODULES, SHIELDS, SPECIALS, WEAPONS, WEAPON_MODS,
  DEFAULT_MISSILE_SHOTS, designStats, knows, refinement, validateDesign, weaponUnitCost,
  type DesignModule, type FiringArc, type HullSize, type Player, type ShipDesign, type WeaponModId, type WeaponMount,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, words } from "../ui/format";
import { ShipModelView, ShipThumb } from "../ui/ShipModel";

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
  // Mounts are edited by position: the same weapon may sit in several mounts with different mods or arcs.
  const editMount = (i: number, patch: Partial<WeaponMount>) => {
    const list = draft.weapons.map((w, j) => (j === i ? { ...w, ...patch } : { ...w }));
    update({ weapons: list.filter((w) => w.count > 0) });
  };
  const addMount = (weaponId: string) => update({ weapons: [...draft.weapons, { weaponId, count: 1 }] });

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
          <ShipModelView className="blueprint-model" hull={draft.hull} color={me.color} />
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
        {draft.weapons.map((w, i) => (
          <MountRow key={i} player={me} mount={w} onChange={(patch) => editMount(i, patch)} />
        ))}
        <div className="row">
          <select value={addWeapon} onChange={(e) => setAddWeapon(e.target.value)}>
            <option value="">Add weapon…</option>
            {weapons.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.damageMin}-{w.damageMax})</option>)}
          </select>
          <button className="small" disabled={!addWeapon} onClick={() => { addMount(addWeapon); setAddWeapon(""); }}>Add</button>
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
              <ShipThumb hull={d.hull} color={me.color} size={64} />
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

function MountRow({ player, mount, onChange }: { player: Player; mount: WeaponMount; onChange: (patch: Partial<WeaponMount>) => void }) {
  const def = WEAPONS.find((x) => x.id === mount.weaponId);
  if (!def) return null;
  const level = refinement(player, def.requires);
  const mods = new Set(mount.mods ?? []);
  const unit = weaponUnitCost(player, mount);
  const toggle = (id: WeaponModId) => {
    const next = new Set(mods);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ mods: [...next] });
  };
  return (
    <div className="col" style={{ gap: 2, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      <div className="row">
        <span style={{ flex: 1 }}>
          {def.name} <small className="muted">{def.damageMin}-{def.damageMax} dmg, {words(def.kind)} · {fmt(unit.space)} space, {fmt(unit.cost)} BC each</small>
        </span>
        <button className="small" onClick={() => onChange({ count: mount.count - 1 })}>−</button>
        <b style={{ width: 24, textAlign: "center" }}>{mount.count}</b>
        <button className="small" onClick={() => onChange({ count: mount.count + 1 })}>+</button>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {def.kind === "beam" && (
          <select value={mount.arc ?? "forward"} onChange={(e) => onChange({ arc: e.target.value as FiringArc })}>
            {(Object.keys(ARCS) as FiringArc[]).map((a) => <option key={a} value={a}>{ARCS[a].name}</option>)}
          </select>
        )}
        {def.kind === "missile" && (
          <select value={mount.ammo ?? DEFAULT_MISSILE_SHOTS} onChange={(e) => onChange({ ammo: Number(e.target.value) })}>
            {MISSILE_RACKS.map((r) => <option key={r.shots} value={r.shots}>{r.shots} shots</option>)}
          </select>
        )}
        {WEAPON_MODS.filter((m) => def.mods.includes(m.id)).map((m) => {
          const ready = level >= m.refinement && (!m.requires || knows(player, m.requires));
          return (
            <button key={m.id} className={`small${mods.has(m.id) ? " active" : ""}`} disabled={!ready && !mods.has(m.id)}
              title={ready ? m.name : `${m.name}: needs ${m.refinement} refinement level${m.refinement === 1 ? "" : "s"} beyond this weapon's tech`}
              onClick={() => toggle(m.id)}>
              {m.abbr}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatsTable({ stats }: { stats: ReturnType<typeof designStats> }) {
  const rows: [string, string][] = [
    ["Cost", fmt(stats.cost)],
    ["Armor", fmt(stats.armor)],
    ["Structure", fmt(stats.structure)],
    ["Shield class", fmt(stats.shield)],
    ["Shield strength per facing", fmt(stats.shieldStrength)],
    ["Attack", fmt(stats.attack)],
    ["Defense", fmt(stats.defense)],
    ["Combat speed", fmt(stats.combatSpeed)],
    ["Marines", fmt(stats.marines)],
    ["Troops", fmt(stats.troops)],
    ["Strength", fmt(stats.strength)],
  ];
  if (stats.missileEvasion) rows.push(["Missile evasion", fmt(stats.missileEvasion)]);
  if (stats.effects.repair) rows.push(["Repair per round", pct(stats.effects.repair)]);
  return (
    <table>
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}
        <tr><td className="muted">Role</td><td>{words(stats.role)}</td></tr>
      </tbody>
    </table>
  );
}
