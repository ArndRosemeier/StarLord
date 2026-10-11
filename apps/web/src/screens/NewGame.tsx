import { Tip } from "../ui/Tip";
import { difficultyText, galaxyAgeText, governmentTip, pickText, techLevelText, traitTip } from "../ui/explain";
import { COUNCIL, RAID_GRACE_TURNS, type NumericPick } from "@starlord/sim";
import { useMemo, useState } from "react";
import {
  DIFFICULTIES, DIFFICULTY_ORDER, RACES, STAR_COUNTS, TRAIT_COSTS, getRace, type CustomRaceSpec, type Difficulty, type GalaxyAge, type GalaxySize,
  type TechLevel,
} from "@starlord/sim";
import { customRaceDefs, loadCustomRaces, saveCustomRaces } from "../game/customRaces";
import { RaceBuilder, blankRace } from "./RaceBuilder";
import { GameSession } from "../game/session";
import { savedAutomationOrders } from "../game/automationPrefs";
import { deleteSave, listSaves, readSave, readSaveFile } from "../game/saves";
import { useHold } from "../ui/touch";
import { words } from "../ui/format";

const PICKS: [keyof ReturnType<typeof getRace>["picks"], string][] = [
  ["growth", "Population growth"], ["farming", "Farming"], ["industry", "Industry"], ["science", "Research"],
  ["money", "Money"], ["shipAttack", "Ship attack"], ["shipDefense", "Ship defense"],
  ["groundCombat", "Ground combat"], ["spying", "Spying"],
];

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function NewGame({ onStart, onBack, initialRace }: { onStart: (s: GameSession) => void; onBack: () => void; initialRace?: string }) {
  const [raceId, setRaceId] = useState(initialRace ?? RACES[0]!.id);
  const [opponents, setOpponents] = useState(3);
  const [galaxy, setGalaxy] = useState<GalaxySize>("medium");
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1e6)));
  const [maxTurns, setMaxTurns] = useState(400);
  const [turnLimit, setTurnLimit] = useState(false);
  const [monsters, setMonsters] = useState(true);
  const [raiders, setRaiders] = useState(true);
  const [council, setCouncil] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("average");
  const [galaxyAge, setGalaxyAge] = useState<GalaxyAge>("average");
  const [techLevel, setTechLevel] = useState<TechLevel>("average");
  const [randomEvents, setRandomEvents] = useState(true);
  const [shipInitiative, setShipInitiative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState(listSaves);
  const [customSpecs, setCustomSpecs] = useState<CustomRaceSpec[]>(loadCustomRaces);
  const [editing, setEditing] = useState<{ spec: CustomRaceSpec; index: number | null } | null>(null);
  const custom = useMemo(() => customRaceDefs(customSpecs), [customSpecs]);
  const chosenCustom = custom.find((c) => c.def.id === raceId);
  const race = chosenCustom?.def ?? getRace(raceId);
  // As in the original, custom races are not allowed on the two easiest levels.
  const customBlocked = !!chosenCustom && !DIFFICULTIES[difficulty].customRaces;

  const storeCustom = (list: CustomRaceSpec[]) => {
    setCustomSpecs(list);
    saveCustomRaces(list);
  };

  const editCustom = (spec: CustomRaceSpec) => setEditing({ spec, index: customSpecs.indexOf(spec) });

  /** Holding Ctrl+Alt while starting (or, on touch, holding the button down) turns on the debug menu for that game. */
  const debugHold = useHold(() => start(false, true), 1500);
  const start = (spectate: boolean, debug = false) => {
    const others = shuffled(RACES.map((r) => r.id).filter((id) => id !== raceId)).slice(0, opponents);
    const races = spectate ? shuffled(RACES.map((r) => r.id)).slice(0, opponents + 1) : [raceId, ...others];
    const customRaces = !spectate && chosenCustom ? [chosenCustom.spec] : [];
    const session = GameSession.create({
      seed, galaxySize: galaxy, races, maxTurns: turnLimit ? maxTurns : 0, monsters, raiders, council, customRaces, difficulty, galaxyAge, techLevel, randomEvents, shipInitiative,
      ...(debug ? { debug: true } : {}),
    }, spectate ? null : 0);
    // Start with the automation the player chose last game.
    const automation = spectate ? [] : savedAutomationOrders();
    if (automation.length > 0) session.issue(...automation);
    onStart(session);
  };

  const load = (data: unknown) => {
    try {
      onStart(GameSession.fromJSON(data));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const traits = useMemo(() => race.picks.traits.map((t) => TRAIT_COSTS[t]?.name ?? words(t)), [race]);

  if (editing) {
    return (
      <div className="title-screen">
        <div className="panel">
          <RaceBuilder
            initial={editing.spec}
            isNew={editing.index === null}
            onCancel={() => setEditing(null)}
            onSave={(spec) => {
              const list = [...customSpecs];
              if (editing.index === null) list.push(spec);
              else list[editing.index] = spec;
              storeCustom(list);
              setRaceId(customRaceDefs([spec])[0]!.def.id);
              setEditing(null);
            }}
            onDelete={editing.index === null ? undefined : () => {
              storeCustom(customSpecs.filter((_, i) => i !== editing.index));
              setRaceId(RACES[0]!.id);
              setEditing(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="title-screen setup">
      <div className="row">
        <button onClick={onBack}>← Back</button>
        <div className="logo">STARLORD</div>
        <div className="spacer" />
        <span className="muted">Choose your people</span>
      </div>

      <div className="race-detail">
        <video key={race.assetKey} src={`races/${race.assetKey}.mp4`} poster={`races/${race.assetKey}.webp`} autoPlay muted loop playsInline />
        <div className="col">
          <div className="row">
            <span className="dot" style={{ background: race.color, width: 14, height: 14 }} />
            <h2 style={{ margin: 0 }}>{race.name}</h2>
            <span className="muted">{race.archetype}</span>
            {chosenCustom && (
              <button onClick={() => editCustom(chosenCustom.spec)}>Edit race</button>
            )}
          </div>
          {race.description && <p style={{ margin: 0 }}>{race.description}</p>}
          <div className="row">
            <Tip card={governmentTip(race.picks.government)}><span className="chip explained">{words(race.picks.government)}</span></Tip>
            {race.picks.traits.map((t) => <Tip key={t} card={traitTip(t)}><span className="chip explained">{traits[race.picks.traits.indexOf(t)]}</span></Tip>)}
          </div>
          <table style={{ maxWidth: 360 }}>
            <tbody>
              {PICKS.filter(([k]) => race.picks[k] !== 0).map(([k, label]) => {
                const v = race.picks[k] as number;
                return (
                  <tr key={k}>
                    <td title={pickText(k as NumericPick, v)}>{label}</td>
                    <td className={v > 0 ? "good" : "bad"} title={pickText(k as NumericPick, v)}>{k === "growth" ? `${v > 0 ? "+" : ""}${Math.round(v * 100)}%` : `${v > 0 ? "+" : ""}${v}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="panel col" style={{ marginTop: 8 }}>
            <div className="row">
              <label>Galaxy size <select value={galaxy} onChange={(e) => setGalaxy(e.target.value as GalaxySize)}>
                {(["small", "medium", "large", "huge"] as const).map((g) => <option key={g} value={g}>{words(g)} · {STAR_COUNTS[g]} stars</option>)}
              </select></label>
              <label>Galaxy age <select value={galaxyAge} onChange={(e) => setGalaxyAge(e.target.value as GalaxyAge)}>
                {(["young", "average", "old"] as const).map((a) => <option key={a} value={a}>{words(a)}</option>)}
              </select></label>
              <label>Opponents <select value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
              </select></label>
            </div>
            <div className="row">
              <label>Difficulty <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {DIFFICULTY_ORDER.map((d) => <option key={d} value={d}>{DIFFICULTIES[d].name}</option>)}
              </select></label>
              <label>Tech level <select value={techLevel} onChange={(e) => setTechLevel(e.target.value as TechLevel)}>
                <option value="preWarp">Pre-warp</option>
                <option value="average">Average</option>
                <option value="advanced">Advanced</option>
              </select></label>
              <label title="Off, as in the original: the game runs until someone conquers the galaxy, wins the council vote or takes Vex Prime. On: when the limit is reached, the highest score wins.">
                <input type="checkbox" checked={turnLimit} onChange={(e) => setTurnLimit(e.target.checked)} /> Turn limit
                {turnLimit && <input type="number" min={50} max={1000} step={50} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} style={{ marginLeft: 6 }} />}
                {!turnLimit && <small className="muted"> none, as in the original</small>}
              </label>
              <label>Seed <input type="text" size={8} value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
            </div>
            <div className="row">
              <label title="Space monsters guard rich systems, and the Guardian holds the best planet in the galaxy. Beat them to settle there."><input type="checkbox" checked={monsters} onChange={(e) => setMonsters(e.target.checked)} /> Monsters</label>
              <label title={`The Vexari raid colonies from their own dimension, from turn ${RAID_GRACE_TURNS[techLevel]} at this tech level, and build more ships as time goes on. Storming Vex Prime through a Dimensional Portal wins the game.`}><input type="checkbox" checked={raiders} onChange={(e) => setRaiders(e.target.checked)} /> Raiders</label>
              <label title={`Meets every ${COUNCIL.interval} turns once ${Math.round(COUNCIL.settledShare * 100)}% of systems are settled (not before turn ${COUNCIL.earliestTurn}, at least ${COUNCIL.minEmpires} empires). One vote per ${COUNCIL.popPerVote} population; a ${Math.round(COUNCIL.majority * 100)}% majority elects a leader and wins the game.`}><input type="checkbox" checked={council} onChange={(e) => setCouncil(e.target.checked)} /> Galactic council</label>
              <label title="Plagues, supernovas, derelicts, pirates, windfalls and other surprises, good and bad."><input type="checkbox" checked={randomEvents} onChange={(e) => setRandomEvents(e.target.checked)} /> Random events</label>
              <label title="In battle, every ship of both sides acts in order of combat speed plus beam attack / 10, instead of the attacker's whole side first">
                <input type="checkbox" checked={shipInitiative} onChange={(e) => setShipInitiative(e.target.checked)} /> Ship initiative
              </label>
            </div>
            <small className="muted">{difficultyText(difficulty)}</small>
            <small className="muted">Galaxy age {galaxyAgeText(galaxyAge)}</small>
            <small className="muted">Tech level {techLevelText(techLevel)}</small>
            {customBlocked && <div className="bad">Custom races need Average difficulty or harder.</div>}
            <div className="row">
              <button className="primary" disabled={customBlocked} onClick={(e) => start(false, e.ctrlKey && e.altKey)} {...debugHold}>Play as the {race.plural}</button>

              <button onClick={() => start(true)} title="All empires are run by the computer; you watch.">Watch an AI game</button>
              <label className="row" style={{ gap: 6 }}>
                <span className="muted">or load a save or replay file</span>
                <input type="file" accept="application/json,.json" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) load(await readSaveFile(f).catch((err: Error) => setError(err.message)));
                }} />
              </label>
            </div>
            {error && <div className="bad">{error}</div>}
          </div>

          {saves.length > 0 && (
            <div className="panel">
              <h4>Saved games</h4>
              <table>
                <tbody>
                  {saves.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="muted">{s.empire}, turn {s.turn}</td>
                      <td className="muted">{new Date(s.savedAt).toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="small" onClick={() => load(readSave(s.name))}>Load</button>{" "}
                        <button className="small danger" onClick={() => { deleteSave(s.name); setSaves(listSaves()); }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="race-grid">
        {RACES.map((r) => (
          <button key={r.id} className={`race-card${r.id === raceId ? " selected" : ""}`} onClick={() => setRaceId(r.id)}>
            <img src={`races/${r.assetKey}.webp`} alt={r.name} loading="lazy" />
            <span className="name">
              <span className="dot" style={{ background: r.color, marginRight: 6 }} />
              {r.name}
              <br />
              <small className="muted">{r.archetype}</small>
            </span>
          </button>
        ))}
        {custom.map(({ spec, def }) => (
          <div key={def.id} className="race-card-wrap">
            <button className={`race-card${def.id === raceId ? " selected" : ""}`} onClick={() => setRaceId(def.id)}>
              <img src={`races/${def.assetKey}.webp`} alt={def.name} loading="lazy" />
              <span className="name">
                <span className="dot" style={{ background: def.color, marginRight: 6 }} />
                {def.name}
                <br />
                <small className="muted">Your race</small>
              </span>
            </button>
            <button className="small race-card-edit" title={`Edit the ${def.plural}`} onClick={() => editCustom(spec)}>Edit</button>
          </div>
        ))}
        <button className="race-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}
          onClick={() => setEditing({ spec: blankRace(), index: null })}>
          <span style={{ fontSize: 34, color: "var(--accent)" }}>+</span>
          <span>Create your own race</span>
        </button>
      </div>
    </div>
  );
}
