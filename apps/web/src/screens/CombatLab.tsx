import { useEffect, useMemo, useRef, useState } from "react";
import {
  LAB_DEFENSES, LAB_PLANET_SHIELDS, LAB_PRESETS, LAB_STATIONS, MAX_TECH_LEVEL, addToBatch, finishBatch, randomLabSpec, runCombatLab, setupCombatLab,
  type CombatLabSpec, type LabArms, type LabBatch, type LabResult, type LabSetup, type LabShips,
} from "@starlord/ai";
import {
  ALL_WEAPONS, BUILDINGS_BY_ID, DEBUG, HULLS, HULLS_BY_ID, RACES, bestArmor, bestBeam, bestComputer, bestMissile, bestShield, colonyDefenseStrength,
  designStats, findDesign, type HullSize, type PlayerId, type WeaponMount,
} from "@starlord/sim";
import { GameSession } from "../game/session";
import { SessionContext } from "../ui/hooks";
import { fmt } from "../ui/format";
import { CombatReplay } from "./CombatReplay";

const ARMS: LabArms[] = ["beam", "missile", "bomb"];
const ARMS_LABEL: Record<LabArms, string> = { beam: "Beams", missile: "Missiles", bomb: "Bombs" };
const LEVELS = Array.from({ length: MAX_TECH_LEVEL }, (_, i) => i + 1);
const words = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const building = (id: string) => BUILDINGS_BY_ID[id]?.name ?? words(id);
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

function mountText(m: WeaponMount): string {
  const w = ALL_WEAPONS[m.weaponId];
  const mods = (m.mods ?? []).map(words).join(", ");
  return `${m.count}× ${w?.name ?? m.weaponId}${mods ? ` (${mods})` : ""}`;
}

type Side = "attacker" | "defender";

/**
 * Sets up a battle between two generic empires (best designs at a chosen
 * tech level, an armed planet, an orbital station), fights it with the real
 * combat code and plays it back, or fights it many times and adds up the
 * results. Every run is checked for things combat must never do.
 */
export function CombatLab() {
  const [spec, setSpec] = useState<CombatLabSpec>(() => ({ seed: "1", ...structuredClone(LAB_PRESETS[0]!.spec) }));
  const setup = useMemo(() => setupCombatLab(spec), [spec]);
  const [watching, setWatching] = useState<{ result: LabResult; run: number } | null>(null);
  const [batch, setBatch] = useState<{ result: LabBatch; done: number; total: number } | null>(null);
  const [fuzz, setFuzz] = useState<{ done: number; total: number; found: { seed: string; message: string }[] } | null>(null);
  const cancel = useRef(false);
  useEffect(() => () => { cancel.current = true; }, []);

  const busy = (batch && batch.done < batch.total) || (fuzz && fuzz.done < fuzz.total);
  const edit = (f: (s: CombatLabSpec) => void) => {
    const next = structuredClone(spec);
    f(next);
    setSpec(next);
    setBatch(null);
  };

  const fight = (run: number) => setWatching({ result: runCombatLab(setup, run), run });

  const fightMany = async (total: number) => {
    cancel.current = false;
    const acc: LabBatch = { runs: 0, wins: {}, draws: 0, avgRounds: 0, avgLost: {}, problems: [] };
    for (let i = 0; i < total && !cancel.current; i++) {
      addToBatch(acc, runCombatLab(setup, i), i);
      if (i % 5 === 4 || i === total - 1) {
        setBatch({ result: finishBatch(acc), done: i + 1, total });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  };

  const fuzzMany = async (total: number) => {
    cancel.current = false;
    const found: { seed: string; message: string }[] = [];
    for (let i = 0; i < total && !cancel.current; i++) {
      const seed = `fuzz${i}`;
      try {
        for (const message of runCombatLab(setupCombatLab(randomLabSpec(seed)), 0).problems) found.push({ seed, message });
      } catch (e) {
        found.push({ seed, message: `setup crashed: ${(e as Error).message}` });
      }
      if (i % 5 === 4 || i === total - 1) {
        setFuzz({ done: i + 1, total, found: [...found] });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  };

  if (watching) return <Watch setup={setup} {...watching} onBack={() => setWatching(null)} />;

  const name = (id: PlayerId) => setup.state.players[id]!.name;
  return (
    <div className="combat-lab">
      <p className="muted">
        Two generic empires fight over the defender's homeworld with the game's own combat rules. Each side's ships are the
        best design the AI would build at that tech level. Every battle is checked for things combat must never do (units
        acting after they died, ships lost or gained without a cause, numbers that are not numbers); anything found is listed
        in red. Your game is untouched.
      </p>

      <div className="row debug-row">
        <strong>Presets</strong>
        {LAB_PRESETS.map((p) => (
          <button key={p.id} title={p.description} onClick={() => { setSpec({ seed: spec.seed, ...structuredClone(p.spec) }); setBatch(null); }}>{p.name}</button>
        ))}
        <button title="A random matchup of hulls, weapons, tech levels and defenses" onClick={() => { setSpec(randomLabSpec(`r${Date.now() % 100000}`)); setBatch(null); }}>Random</button>
      </div>

      <div className="lab-sides">
        <SideEditor side="attacker" spec={spec} setup={setup} edit={edit} />
        <SideEditor side="defender" spec={spec} setup={setup} edit={edit} />
      </div>

      <div className="row debug-row">
        <label className="sim-check" title="Ionized gas: only hard shields work inside a nebula."><input type="checkbox" checked={!!spec.nebula} onChange={(e) => edit((s) => { s.nebula = e.target.checked; })} /> Nebula</label>
        <label className="sim-check" title="Ships act in order of combat speed and beam attack instead of side by side."><input type="checkbox" checked={!!spec.shipInitiative} onChange={(e) => edit((s) => { s.shipInitiative = e.target.checked; })} /> Ship initiative</label>
        <label title="The same seed and setup always fight the same battle.">Seed <input value={spec.seed} onChange={(e) => edit((s) => { s.seed = e.target.value; })} style={{ width: 80 }} /></label>
      </div>
      {setup.notes.length > 0 && <div className="panel warn">{setup.notes.join("; ")}.</div>}

      <div className="row debug-row">
        <button className="primary" onClick={() => fight(0)} disabled={!!busy}>Fight and watch</button>
        <button onClick={() => void fightMany(DEBUG.labRuns)} disabled={!!busy}>Fight {DEBUG.labRuns} times</button>
        <button onClick={() => void fuzzMany(DEBUG.labFuzz)} disabled={!!busy} title="Fights random matchups looking only for broken rules">Test {DEBUG.labFuzz} random battles</button>
        {busy && <button onClick={() => { cancel.current = true; }}>Stop</button>}
      </div>

      {batch && (
        <div className="panel">
          <strong>{batch.done < batch.total ? `Fighting… ${batch.done} of ${batch.total}` : `${batch.done} battles`}</strong>
          <div>
            {name(setup.attackerId)} (attacker) won {fmt(batch.result.wins[setup.attackerId] ?? 0)} ({pct(batch.result.wins[setup.attackerId] ?? 0, batch.result.runs)}),
            {" "}{name(setup.defenderId)} (defender) {fmt(batch.result.wins[setup.defenderId] ?? 0)} ({pct(batch.result.wins[setup.defenderId] ?? 0, batch.result.runs)}),
            {" "}no winner {fmt(batch.result.draws)}.
          </div>
          <div className="muted">
            Average {batch.result.avgRounds} combat turns; ships lost on average: {name(setup.attackerId)} {batch.result.avgLost[setup.attackerId] ?? 0},
            {" "}{name(setup.defenderId)} {batch.result.avgLost[setup.defenderId] ?? 0}.
          </div>
          <Problems list={batch.result.problems.map((p) => ({ message: `${p.message} (${p.runs}×)`, action: <button onClick={() => fight(p.firstRun)}>Watch battle {p.firstRun + 1}</button> }))} />
        </div>
      )}

      {fuzz && (
        <div className="panel">
          <strong>{fuzz.done < fuzz.total ? `Testing… ${fuzz.done} of ${fuzz.total}` : `${fuzz.done} random battles tested`}</strong>
          <Problems list={fuzz.found.slice(0, 40).map((p) => ({ message: p.message, action: <button onClick={() => { setSpec(randomLabSpec(p.seed)); setFuzz(null); }}>Load it</button> }))} />
        </div>
      )}
    </div>
  );
}

function Problems({ list }: { list: { message: string; action: React.ReactNode }[] }) {
  if (list.length === 0) return <div className="good">No broken rules found.</div>;
  return (
    <ul className="lab-problems">
      {list.map((p, i) => <li key={i} className="bad">{p.message} {p.action}</li>)}
    </ul>
  );
}

function SideEditor({ side, spec, setup, edit }: { side: Side; spec: CombatLabSpec; setup: LabSetup; edit: (f: (s: CombatLabSpec) => void) => void }) {
  const s = spec[side];
  const id = side === "attacker" ? setup.attackerId : setup.defenderId;
  const player = setup.state.players[id]!;
  const shield = bestShield(player);
  const computer = bestComputer(player);
  const colony = Object.values(setup.state.colonies).find((c) => c.ownerId === setup.defenderId && setup.state.planets[c.planetId]!.starId === setup.starId);
  const setShips = (f: (ships: LabShips[]) => void) => edit((x) => f(x[side].ships));

  return (
    <div className="panel lab-side">
      <h4>{side === "attacker" ? "Attacker" : "Defender"}</h4>
      <div className="row debug-row">
        <select value={s.raceId} onChange={(e) => edit((x) => { x[side].raceId = e.target.value; })} aria-label="Race">
          {RACES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label>Tech level <select value={s.techLevel} onChange={(e) => edit((x) => { x[side].techLevel = Number(e.target.value); })}>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select></label>
      </div>
      <small className="muted">
        Best beam {bestBeam(player).name}, missile {bestMissile(player).name}, armor {bestArmor(player).name}
        {shield ? `, ${shield.name}` : ", no shields"}{computer ? `, ${computer.name}` : ", no computer"}.
      </small>

      {s.ships.map((row, i) => {
        const design = findDesign(player, `lab-${row.hull}-${row.arms}`);
        const st = design ? designStats(player, design) : null;
        return (
          <div key={i} className="lab-ship">
            <div className="row debug-row">
              <input type="number" min={1} max={DEBUG.maxSpawn} value={row.count} aria-label="Ships"
                onChange={(e) => setShips((l) => { l[i]!.count = Math.min(DEBUG.maxSpawn, Math.max(1, Math.floor(Number(e.target.value) || 1))); })} style={{ width: 56 }} />
              <select value={row.hull} aria-label="Hull" onChange={(e) => setShips((l) => { l[i]!.hull = e.target.value as HullSize; })}>
                {HULLS.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <select value={row.arms} aria-label="Weapons" onChange={(e) => setShips((l) => { l[i]!.arms = e.target.value as LabArms; })}>
                {ARMS.map((a) => <option key={a} value={a}>{ARMS_LABEL[a]}</option>)}
              </select>
              <button onClick={() => setShips((l) => { l.splice(i, 1); })} aria-label="Remove ships">✕</button>
            </div>
            {st ? (
              <small className="muted">
                Attack {st.attack}, defense {st.defense}, {st.hits} hits, shield {st.shield}, speed {st.combatSpeed}: {st.weapons.map(mountText).join(", ")}
                {design!.specials.length > 0 && `; ${design!.specials.map(words).join(", ")}`}
              </small>
            ) : <small className="bad">No such design fits at this tech level.</small>}
          </div>
        );
      })}
      <button onClick={() => setShips((l) => { l.push({ hull: "cruiser", arms: "beam", count: 3 }); })}>Add ships</button>

      {side === "attacker" ? (
        <label className="sim-check" title="On attack stance the fleet also fires at the planet and station; otherwise it only shoots back at guns firing on it.">
          <input type="checkbox" checked={spec.attacker.attacksPlanet} onChange={(e) => edit((x) => { x.attacker.attacksPlanet = e.target.checked; })} /> Attack the planet
        </label>
      ) : (
        <>
          <div className="row debug-row">
            <label>Station <select value={spec.defender.station ?? ""} onChange={(e) => edit((x) => { x.defender.station = (e.target.value || null) as typeof x.defender.station; })}>
              <option value="">None</option>
              {LAB_STATIONS.map((h) => <option key={h} value={h}>{HULLS_BY_ID[h].name}</option>)}
            </select></label>
            <label>Planet shield <select value={spec.defender.planetShield ?? ""} onChange={(e) => edit((x) => { x.defender.planetShield = (e.target.value || null) as typeof x.defender.planetShield; })}>
              <option value="">None</option>
              {LAB_PLANET_SHIELDS.map((b) => <option key={b} value={b}>{building(b)}</option>)}
            </select></label>
          </div>
          <div className="row debug-row">
            {LAB_DEFENSES.map((d) => (
              <label key={d} className="sim-check" title={BUILDINGS_BY_ID[d]?.description}>
                <input type="checkbox" checked={spec.defender.defenses.includes(d)}
                  onChange={(e) => edit((x) => { x.defender.defenses = e.target.checked ? [...x.defender.defenses, d] : x.defender.defenses.filter((y) => y !== d); })} /> {building(d)}
              </label>
            ))}
          </div>
          {colony && (
            <small className="muted">
              {[spec.defender.station, ...spec.defender.defenses, spec.defender.planetShield].filter(Boolean).map((b) => `${building(b!)}: ${BUILDINGS_BY_ID[b!]?.description ?? ""}`).join(" ")}
              {" "}Combat value of the planet and station: {fmt(Math.round(colonyDefenseStrength(setup.state, colony)))}.
            </small>
          )}
        </>
      )}
    </div>
  );
}

function Watch({ setup, result, run, onBack }: { setup: LabSetup; result: LabResult; run: number; onBack: () => void }) {
  // The replay reads players, designs and planets from a session of its own: the lab's game, seen by everyone.
  const session = useMemo(() => new GameSession(setup.state, null), [setup]);
  const [shown, setShown] = useState(0);
  const report = result.reports[shown];
  const s = result.summary;
  return (
    <div className="combat-lab">
      <div className="row debug-row">
        <button onClick={onBack}>Back to the setup</button>
        <span className="muted">Battle {run + 1} of this setup</span>
        {result.reports.length > 1 && result.reports.map((r, i) => (
          <button key={r.id} className={i === shown ? "primary" : ""} onClick={() => setShown(i)}>Battle {i + 1}</button>
        ))}
      </div>
      {s && (
        <div className="panel">
          <strong>{s.winner === null ? "No winner" : `${setup.state.players[s.winner]!.name} won`}</strong> after {s.rounds} combat turns{s.timedOut ? " (time ran out; the defender holds the field)" : ""}.
          <table className="lab-table">
            <thead><tr><th /><th>Ships</th><th>Lost</th><th title="A volley is one weapon mount firing at one target in a combat turn">Volleys</th><th>Damage dealt</th><th /></tr></thead>
            <tbody>
              {s.sides.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td><td>{x.ships}</td><td>{x.shipsLost}</td><td>{fmt(x.shots)}</td><td>{fmt(x.damageDealt)}</td>
                  <td>{[x.stationLost && "station destroyed", x.planetSilenced && "planet silenced"].filter(Boolean).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Problems list={result.problems.map((message) => ({ message, action: null }))} />
      {report ? (
        <SessionContext.Provider value={session}>
          <CombatReplay key={report.id} report={report} />
        </SessionContext.Provider>
      ) : <p className="muted">No battle took place.</p>}
    </div>
  );
}
