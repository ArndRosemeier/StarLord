import { useState } from "react";
import {
  CUSTOM_RACE_POINTS, EXCLUSIVE_TRAITS, GOVERNMENT_COSTS, MAX_NEGATIVE_POINTS, PICK_OPTIONS, RACES, TRAIT_COSTS,
  raceCost, validateCustomRace,
  type CustomRaceSpec, type Government, type NumericPick, type RaceTrait,
} from "@starlord/sim";
import { words } from "../ui/format";

export const blankRace = (): CustomRaceSpec => ({
  name: "", plural: "", description: "", color: "#4fb3ff", assetKey: RACES[0]!.assetKey,
  picks: {
    growth: 0, farming: 0, industry: 0, science: 0, money: 0, shipAttack: 0, shipDefense: 0, groundCombat: 0, spying: 0,
    government: "dictatorship", traits: [],
  },
});

const signedCost = (c: number) => (c > 0 ? `${c}` : c < 0 ? `+${-c}` : "0");

/** MoO2-style race designer: spend picks within a budget, borrow another race's look. */
export function RaceBuilder({ initial, isNew = true, onSave, onCancel, onDelete }: {
  initial: CustomRaceSpec;
  isNew?: boolean;
  onSave: (spec: CustomRaceSpec) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [spec, setSpec] = useState<CustomRaceSpec>(initial);
  const picks = spec.picks;
  const { total, negative } = raceCost(picks);
  // The plural defaults to the name.
  const effective = { ...spec, plural: spec.plural.trim() || spec.name };
  const error = spec.name.trim() ? validateCustomRace(effective) : "Give your race a name.";
  const setPick = (patch: Partial<CustomRaceSpec["picks"]>) => setSpec({ ...spec, picks: { ...picks, ...patch } });
  const toggleTrait = (t: RaceTrait) => {
    if (picks.traits.includes(t)) return setPick({ traits: picks.traits.filter((x) => x !== t) });
    // Taking a trait drops any trait it excludes.
    const clash = EXCLUSIVE_TRAITS.find((g) => g.includes(t)) ?? [];
    setPick({ traits: [...picks.traits.filter((x) => !clash.includes(x)), t] });
  };
  const left = CUSTOM_RACE_POINTS - total;

  return (
    <div className="col">
      <div className="row">
        <h2 style={{ margin: 0 }}>{isNew ? "Design a race" : `Edit the ${initial.plural || initial.name}`}</h2>
        <span className="spacer" />
        <span className={`chip ${left < 0 ? "bad" : "good"}`}>{left} of {CUSTOM_RACE_POINTS} picks left</span>
        <span className={`chip ${negative > MAX_NEGATIVE_POINTS ? "bad" : ""}`}>Drawbacks {negative}/{MAX_NEGATIVE_POINTS}</span>
      </div>

      <div className="row">
        <label>Name <input type="text" maxLength={24} value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} /></label>
        <label>Plural <input type="text" maxLength={24} value={spec.plural} placeholder={spec.name}
          onChange={(e) => setSpec({ ...spec, plural: e.target.value })} /></label>
        <label>Color <input type="color" value={spec.color} onChange={(e) => setSpec({ ...spec, color: e.target.value })} /></label>
      </div>
      <input type="text" maxLength={300} placeholder="Description (optional)" value={spec.description}
        onChange={(e) => setSpec({ ...spec, description: e.target.value })} />

      <h4>Appearance</h4>
      <div className="row" style={{ gap: 6 }}>
        {RACES.map((r) => (
          <button key={r.assetKey} title={`Looks like the ${r.plural}`} onClick={() => setSpec({ ...spec, assetKey: r.assetKey })}
            style={{ padding: 0, borderRadius: 8, border: `2px solid ${spec.assetKey === r.assetKey ? "var(--accent)" : "transparent"}` }}>
            <img src={`races/${r.assetKey}.webp`} alt={r.name} width={52} height={52} style={{ display: "block", borderRadius: 6, objectFit: "cover" }} />
          </button>
        ))}
      </div>

      <h4>Government</h4>
      <div className="row" style={{ gap: 4 }}>
        {(Object.keys(GOVERNMENT_COSTS) as Government[]).map((g) => (
          <button key={g} className={`small${picks.government === g ? " active" : ""}`} onClick={() => setPick({ government: g })}>
            {words(g)} <span className="muted">{signedCost(GOVERNMENT_COSTS[g])}</span>
          </button>
        ))}
      </div>

      <h4>Abilities</h4>
      <table>
        <tbody>
          {(Object.keys(PICK_OPTIONS) as NumericPick[]).map((k) => {
            const opts = [...PICK_OPTIONS[k].options.filter((o) => o.value < 0), { value: 0, cost: 0, text: "Normal" }, ...PICK_OPTIONS[k].options.filter((o) => o.value > 0)];
            return (
              <tr key={k}>
                <td>{PICK_OPTIONS[k].label}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    {opts.map((o) => (
                      <button key={o.value} className={`small${picks[k] === o.value ? " active" : ""}`} onClick={() => setPick({ [k]: o.value })}>
                        {o.text} {o.cost !== 0 && <span className={o.cost < 0 ? "good" : "muted"}>{signedCost(o.cost)}</span>}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4>Special traits</h4>
      <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
        {(Object.entries(TRAIT_COSTS) as [RaceTrait, { cost: number; text: string; name?: string }][]).map(([t, info]) => (
          <label key={t} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <input type="checkbox" style={{ flex: "none", marginTop: 4 }} checked={picks.traits.includes(t)} onChange={() => toggleTrait(t)} />
            <span>
              <b>{info.name ?? words(t)}</b> <span className={info.cost < 0 ? "good" : "muted"}>{signedCost(info.cost)}</span>
              <br />
              <small className="muted">{info.text}</small>
            </span>
          </label>
        ))}
      </div>
      <small className="muted">Costs are in picks; drawbacks (green) give picks back, up to {MAX_NEGATIVE_POINTS}.</small>

      {error && <div className="bad">{error}</div>}
      <div className="row">
        <button className="primary" disabled={!!error} onClick={() => onSave(effective)}>Save race</button>
        <button onClick={onCancel}>Cancel</button>
        <span className="spacer" />
        {onDelete && <button className="danger" onClick={onDelete}>Delete race</button>}
      </div>
    </div>
  );
}
