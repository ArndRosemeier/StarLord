import { useMemo, useState } from "react";
import {
  ARCS, ARMORS, COMPUTERS, bestOf, defaultDesignName, HULLS, HULLS_BY_ID, MISSILE_RACKS, SHIELDS, SPECIALS, WEAPONS, WEAPON_MODS,
  DEFAULT_MISSILE_SHOTS, SHIP_STYLES, designStats, designStyle, raceShipStyle, knows, refinement, swapMountWeapon, validateDesign, weaponUnitCost,
  type FiringArc, type HullSize, type Player, type ShipDesign, type WeaponDef, type WeaponModId, type WeaponMount,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, words } from "../ui/format";
import { ShipModelView, ShipThumb } from "../ui/ShipModel";
import { Tip, tipText } from "../ui/Tip";
import { DesignRefits } from "../ui/RefitPanel";
import {
  arcTip, armorTip, computerTip, designTip, styleTip, hullTip, modTip, rackTip, shieldTip, spaceTip, specialTip, statTip, weaponTip,
} from "./designTips";

export function DesignScreen() {
  const { session, view, me, readOnly } = useGame();
  // Like the original's design template: a new design starts with the best armor, shield and computer known.
  const blank = (): ShipDesign => ({
    id: "", name: defaultDesignName(me, "frigate"), hull: "frigate", armor: (bestOf(me, ARMORS) ?? ARMORS[0]!).id,
    shield: bestOf(me, SHIELDS)?.id ?? null, computer: bestOf(me, COMPUTERS)?.id ?? null,
    weapons: [], specials: [], module: null, obsolete: false,
  });
  const [draft, setDraft] = useState<ShipDesign>(blank);
  // While the name is still the generated one it follows the hull (escort or capital names).
  const [autoName, setAutoName] = useState(true);
  const [addWeapon, setAddWeapon] = useState("");
  const [refitTo, setRefitTo] = useState<string | null>(null);

  const hulls = HULLS.filter((h) => knows(me, h.requires));
  const armors = ARMORS.filter((a) => knows(me, a.requires));
  const shields = SHIELDS.filter((s) => knows(me, s.requires));
  const computers = COMPUTERS.filter((c) => knows(me, c.requires));
  const weapons = WEAPONS.filter((w) => knows(me, w.requires));
  const specials = SPECIALS.filter((s) => knows(me, s.requires));

  const stats = useMemo(() => designStats(me, draft), [me, draft]);
  const style = designStyle(me, draft);
  const ownStyle = raceShipStyle(me.raceId);
  const stepStyle = (dir: number) => {
    const i = SHIP_STYLES.findIndex((s) => s.id === style);
    update({ style: SHIP_STYLES[(i + dir + SHIP_STYLES.length) % SHIP_STYLES.length]!.id });
  };
  const error = validateDesign(me, draft);
  const update = (patch: Partial<ShipDesign>) => {
    const next = { ...draft, ...patch };
    if (autoName && patch.hull && patch.hull !== draft.hull) next.name = defaultDesignName(me, patch.hull);
    setDraft(next);
  };
  // Mounts are edited by position: the same weapon may sit in several mounts with different mods or arcs.
  const editMount = (i: number, patch: Partial<WeaponMount>) => {
    const list = draft.weapons.map((w, j) => (j === i ? { ...w, ...patch } : { ...w }));
    update({ weapons: list.filter((w) => w.count > 0) });
  };
  const addMount = (weaponId: string) => update({ weapons: [...draft.weapons, { weaponId, count: 1 }] });
  const swapMount = (i: number, weaponId: string) => editMount(i, swapMountWeapon(me, draft, i, weaponId));
  const removeMount = (i: number) => update({ weapons: draft.weapons.filter((_, j) => j !== i) });

  const save = () => {
    let n = 1;
    while (me.designs.some((d) => d.id === `u${view.turn}-${n}`)) n++;
    const saved = { ...draft, id: `u${view.turn}-${n}`, obsolete: false };
    session.issue({ type: "saveDesign", design: saved });
    const next = autoName
      ? defaultDesignName({ ...me, designs: [...me.designs, saved] }, draft.hull)
      : `${draft.name.replace(/ Mk \d+$/, "")} Mk ${n + 1}`;
    setDraft({ ...draft, name: next });
  };

  // Colony ships, outpost ships and transports are fixed designs built straight from the build list.
  const designs = me.designs.filter((d) => !d.fixed && !d.module);
  const space = Math.min(100, (stats.spaceUsed / stats.spaceTotal) * 100);

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(380px, 1fr) minmax(380px, 1fr)" }}>
      <div className="panel col">
        <div className="row">
          <h2 style={{ margin: 0 }}>Ship designer</h2>
          <span className="spacer" />
          <Tip card={{ title: "New design", text: ["Start over with an empty frigate fitted with your best armor, shield and computer, named in your race's style."] }}>
            <button className="small" onClick={() => { setDraft(blank()); setAutoName(true); }}>New</button>
          </Tip>
        </div>
        <div className="blueprint">
          <span className="blueprint-label">Schematic · {draft.name || "unnamed"}</span>
          <ShipModelView className="blueprint-model" hull={draft.hull} color={me.color} style={style} />
          <Tip card={{ title: "Previous style", text: ["Show this design in the previous ship style."] }}>
            <button className="small blueprint-step left" onClick={() => stepStyle(-1)}>‹</button>
          </Tip>
          <Tip card={{ title: "Next style", text: ["Show this design in the next ship style."] }}>
            <button className="small blueprint-step right" onClick={() => stepStyle(1)}>›</button>
          </Tip>
          <span className="blueprint-style">{SHIP_STYLES.find((s) => s.id === style)?.name} style</span>
          <span className="blueprint-hull">{HULLS_BY_ID[draft.hull]?.name} · {words(stats.role)}</span>
        </div>
        <Tip block card={{ title: "Design name", text: ["Shown in build lists and fleets. Saving again adds a new Mk number, so older ships keep their design."] }}>
          <input type="text" value={draft.name} onChange={(e) => { setAutoName(false); update({ name: e.target.value }); }} style={{ width: "100%" }} />
        </Tip>
        <div className="row">
          {hulls.map((h) => (
            <Tip key={h.id} card={() => hullTip(me, draft, h.id as HullSize)}>
              <button className={`small${draft.hull === h.id ? " active" : ""}`} onClick={() => update({ hull: h.id as HullSize })}>
                {h.name} <span className="muted">{h.space}</span>
              </button>
            </Tip>
          ))}
        </div>
        <div className="row">
          <Tip card={() => armorTip(me, draft, draft.armor)}>
            <label>Armor <select value={draft.armor} onChange={(e) => update({ armor: e.target.value })}>
              {armors.map((a) => <option key={a.id} value={a.id} title={tipText(armorTip(me, draft, a.id))}>{a.name}</option>)}
            </select></label>
          </Tip>
          <Tip card={() => shieldTip(me, draft, draft.shield)}>
            <label>Shield <select value={draft.shield ?? ""} onChange={(e) => update({ shield: e.target.value || null })}>
              <option value="">None</option>
              {shields.map((s) => <option key={s.id} value={s.id} title={tipText(shieldTip(me, draft, s.id))}>{s.name}</option>)}
            </select></label>
          </Tip>
          <Tip card={() => computerTip(me, draft, draft.computer)}>
            <label>Computer <select value={draft.computer ?? ""} onChange={(e) => update({ computer: e.target.value || null })}>
              <option value="">None</option>
              {computers.map((c) => <option key={c.id} value={c.id} title={tipText(computerTip(me, draft, c.id))}>{c.name}</option>)}
            </select></label>
          </Tip>
          <Tip card={() => styleTip(style, ownStyle)}>
            <label>Style <select value={style} onChange={(e) => update({ style: e.target.value })}>
              {SHIP_STYLES.map((s) => (
                <option key={s.id} value={s.id} title={tipText(styleTip(s.id, ownStyle))}>{s.name}{s.id === ownStyle ? " (your race)" : ""}</option>
              ))}
            </select></label>
          </Tip>
        </div>

        <h4>Weapons</h4>
        {draft.weapons.map((w, i) => (
          <MountRow key={i} player={me} draft={draft} index={i} mount={w} weapons={weapons}
            onChange={(patch) => editMount(i, patch)} onSwap={(id) => swapMount(i, id)} onRemove={() => removeMount(i)} />
        ))}
        <div className="row">
          <Tip card={() => addWeapon ? weaponTip(me, draft, addWeapon) : { title: "Add a weapon", text: ["Pick a weapon you know to add a new mount. Each mount can have its own modifications, arc or missile rack."] }}>
            <select value={addWeapon} onChange={(e) => setAddWeapon(e.target.value)}>
              <option value="">Add weapon…</option>
              {weapons.map((w) => <option key={w.id} value={w.id} title={tipText(weaponTip(me, draft, w.id))}>{w.name} ({w.damageMin}-{w.damageMax})</option>)}
            </select>
          </Tip>
          <Tip card={{ title: "Add mount", text: ["Adds one of the chosen weapon as a new mount. Use + and − on the mount to change how many it holds."] }}>
            <button className="small" disabled={!addWeapon} onClick={() => { addMount(addWeapon); setAddWeapon(""); }}>Add</button>
          </Tip>
        </div>

        {specials.length > 0 && (
          <>
            <h4>Specials</h4>
            <div className="row" style={{ gap: 4 }}>
              {specials.map((s) => {
                const on = draft.specials.includes(s.id);
                return (
                  <Tip key={s.id} card={() => specialTip(me, draft, s.id)}>
                    <button className={`small${on ? " active" : ""}`}
                      onClick={() => update({ specials: on ? draft.specials.filter((x) => x !== s.id) : [...draft.specials, s.id] })}>
                      {s.name}
                    </button>
                  </Tip>
                );
              })}
            </div>
          </>
        )}

        <Tip block card={() => spaceTip(stats.spaceUsed, stats.spaceTotal)}>
        <div className="col" style={{ gap: 4 }}>
          <div className="row"><span>Space</span><span className="spacer" /><span className={stats.spaceUsed > stats.spaceTotal ? "bad" : ""}>{fmt(stats.spaceUsed)} / {fmt(stats.spaceTotal)}</span></div>
          <div className="bar"><div style={{ width: `${space}%`, background: stats.spaceUsed > stats.spaceTotal ? "var(--bad)" : "var(--accent)" }} /></div>
        </div>
        </Tip>
        <StatsTable player={me} stats={stats} />
        {error && <div className="bad">{error}</div>}
        <Tip block card={{ title: "Save design", text: ["Adds this design to your list so colonies can build it. Existing ships are not changed."], note: error ?? (!draft.name.trim() ? "Give the design a name first." : undefined) }}>
          <button className="primary" style={{ width: "100%" }} disabled={readOnly || !!error || !draft.name.trim()} onClick={save}>Save design</button>
        </Tip>
      </div>

      <div className="panel col">
        <h2>Designs</h2>
        {designs.map((d) => {
          const s = designStats(me, d);
          const valid = validateDesign(me, d) === null;
          return (
            <div key={d.id} className="col" style={{ gap: 4, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            <div className="row design-row" style={{ opacity: d.obsolete ? 0.5 : 1 }}>
              <ShipThumb hull={d.hull} color={me.color} style={designStyle(me, d)} size={64} />
              <Tip block card={() => designTip(me, d)}>
              <div style={{ flex: 1 }}>
                <b>{d.name}</b> <span className="muted">{HULLS_BY_ID[d.hull]?.name} · {words(s.role)}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  cost {fmt(s.cost)} · hits {fmt(s.hits)} · attack {fmt(s.attack)} · defense {fmt(s.defense)} · strength {fmt(s.strength)}
                  {!valid && <span className="bad"> · outdated parts</span>}
                </div>
              </div>
              </Tip>
              <Tip card={{ title: "Copy", text: ["Loads this design into the designer so you can change it and save it as a new design."] }}>
                <button className="small" onClick={() => { setDraft({ ...structuredClone(d), id: "", name: `${d.name}`, obsolete: false }); setAutoName(false); }}>Copy</button>
              </Tip>
              <Tip card={d.obsolete
                ? { title: "Restore", text: ["Puts this design back in build lists."] }
                : { title: "Obsolete", text: ["Hides this design from build lists and automation. Ships already built keep flying."] }}>
                <button className="small" disabled={readOnly} onClick={() => session.issue({ type: "obsoleteDesign", designId: d.id, obsolete: !d.obsolete })}>
                  {d.obsolete ? "Restore" : "Obsolete"}
                </button>
              </Tip>
              {!d.obsolete && valid && (
                <Tip card={{ title: "Refit ships to this design", text: [`Lists your ships of other ${HULLS_BY_ID[d.hull]?.name} designs in orbit where a colony could refit them to ${d.name}, with the cost and time.`] }}>
                  <button className={`small${refitTo === d.id ? " active" : ""}`} disabled={readOnly} onClick={() => setRefitTo(refitTo === d.id ? null : d.id)}>Refit…</button>
                </Tip>
              )}
            </div>
            {refitTo === d.id && <DesignRefits design={d} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MountRow({ player, draft, index, mount, weapons, onChange, onSwap, onRemove }: {
  player: Player; draft: ShipDesign; index: number; mount: WeaponMount; weapons: WeaponDef[];
  onChange: (patch: Partial<WeaponMount>) => void; onSwap: (weaponId: string) => void; onRemove: () => void;
}) {
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
        <Tip card={() => weaponTip(player, draft, mount.weaponId, mount)}>
          <select value={mount.weaponId} aria-label="Weapon" style={{ flex: "1 1 0", minWidth: 120 }} onChange={(e) => onSwap(e.target.value)}>
            {(weapons.some((w) => w.id === def.id) ? weapons : [def, ...weapons]).map((w) => {
              // What this row would cost re-armed with `w`: same count, arc and mods where they carry over.
              const swapped = w.id === def.id ? mount : swapMountWeapon(player, draft, index, w.id);
              const u = weaponUnitCost(player, swapped);
              return (
                <option key={w.id} value={w.id} title={tipText(weaponTip(player, draft, w.id, swapped))}>
                  {w.name}{w.damageMax > 0 ? ` · ${w.damageMin === w.damageMax ? w.damageMin : `${w.damageMin}-${w.damageMax}`} dmg` : ""} · {fmt(u.space)} space · {fmt(u.cost)} BC each
                  {w.id !== def.id && swapped.count !== mount.count ? ` (only ${swapped.count} fit${swapped.count === 1 ? "s" : ""})` : ""}
                </option>
              );
            })}
          </select>
        </Tip>
        <Tip card={{ title: "Remove one", text: [mount.count === 1 ? "Removes this mount." : "One fewer weapon on this mount."] }}>
          <button className="small" onClick={() => onChange({ count: mount.count - 1 })}>−</button>
        </Tip>
        <b style={{ width: 24, textAlign: "center" }}>{mount.count}</b>
        <Tip card={{ title: "Add one", text: [`One more ${def.name}: ${fmt(unit.space)} space and ${fmt(unit.cost)} BC.`] }}>
          <button className="small" onClick={() => onChange({ count: mount.count + 1 })}>+</button>
        </Tip>
        <Tip card={{ title: "Remove row", text: [`Removes all ${mount.count} ${def.name} on this row, freeing ${fmt(unit.space * mount.count)} space and ${fmt(unit.cost * mount.count)} BC.`] }}>
          <button className="small" aria-label="Remove weapon row" onClick={onRemove}>✕</button>
        </Tip>
      </div>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {def.kind === "beam" && (
          <Tip card={() => arcTip(mount.arc ?? "forward")}>
            <select value={mount.arc ?? "forward"} onChange={(e) => onChange({ arc: e.target.value as FiringArc })}>
              {(Object.keys(ARCS) as FiringArc[]).map((a) => <option key={a} value={a} title={tipText(arcTip(a))}>{ARCS[a].name}</option>)}
            </select>
          </Tip>
        )}
        {def.kind === "missile" && (
          <Tip card={() => rackTip(player, mount, mount.ammo ?? DEFAULT_MISSILE_SHOTS)}>
            <select value={mount.ammo ?? DEFAULT_MISSILE_SHOTS} onChange={(e) => onChange({ ammo: Number(e.target.value) })}>
              {MISSILE_RACKS.map((r) => <option key={r.shots} value={r.shots} title={tipText(rackTip(player, mount, r.shots))}>{r.shots} shots</option>)}
            </select>
          </Tip>
        )}
        {WEAPON_MODS.filter((m) => def.mods.includes(m.id)).map((m) => {
          const ready = level >= m.refinement && (!m.requires || knows(player, m.requires));
          return (
            <Tip key={m.id} card={() => modTip(player, mount, m.id)}>
              <button className={`small${mods.has(m.id) ? " active" : ""}`} disabled={!ready && !mods.has(m.id)}
                onClick={() => toggle(m.id)}>
                {m.abbr}
              </button>
            </Tip>
          );
        })}
      </div>
    </div>
  );
}

function StatsTable({ player, stats }: { player: Player; stats: ReturnType<typeof designStats> }) {
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
        {[...rows, ["Role", words(stats.role)] as [string, string]].map(([k, v]) => (
          <tr key={k}><td className="muted"><Tip card={() => statTip(player, k)}><span>{k}</span></Tip></td><td>{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
