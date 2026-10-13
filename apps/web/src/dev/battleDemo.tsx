import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { HULLS, type CombatReport, type PlayerId } from "@starlord/sim";
import { LAB_PRESETS, runCombatLab, setupCombatLab } from "@starlord/ai";
import { GameSession } from "../game/session";
import { SessionContext } from "../ui/hooks";
import { CombatReplay } from "../screens/CombatReplay";
import { CommandBattle } from "../screens/CommandBattle";
import { useGame } from "../ui/hooks";
import type { CombatEvent, UnitSnapshot } from "../screens/combat/replayModel";
import "../styles.css";
import "../theme.css";

/**
 * Development page for the battle replay (dev server only: /dev/battle.html).
 * Mounts CombatReplay on synthetic battles: `?demo=full` has every hull class,
 * stations and the planet with the newer report fields; `legacy` is what
 * older reports carry (isPlanet and ships only); `monster` pits a creature
 * against a squadron; `lab-<preset>` runs a real combat lab preset (e.g.
 * `lab-planet`) through the sim; `command-<preset>` lets you command the
 * defender of a lab preset as the turn stops at its battle.
 */

const session = GameSession.create({ seed: "battle-demo", playerCount: 2, monsters: true }, 0);
const view = session.view;
const home = view.galaxy.stars.find((s) => s.id === view.players[0]!.homeStarId)!;
const colony = Object.values(view.colonies).find((c) => c.ownerId === 0)!;
const monsters = Object.values(view.players).find((p) => p.kind === "monsters")?.id ?? 2;

function report(kind: string): CombatReport {
  const ships: UnitSnapshot[] = [];
  const rounds: CombatEvent[][] = [];
  const add = (key: string, ownerId: PlayerId, name: string, x: number, y: number, maxHits: number, extra: Partial<UnitSnapshot> = {}) =>
    ships.push({ key, ownerId, designId: extra.hullId ?? "frigate", name, maxHits, x, y, isPlanet: false, ...extra });

  let attacker: PlayerId = 1;
  if (kind === "monster") {
    attacker = monsters;
    add("m", monsters, "Star Hydra", 6, 10, 400, { kind: "monster", designId: "starHydra" });
    add("a", 0, "Lancer", 24, 6, 40, { designId: "frigate" });
    add("b", 0, "Lancer", 25, 10, 40, { designId: "frigate" });
    add("c", 0, "Warden", 24, 14, 120, { hullId: "cruiser" });
    rounds.push([
      { kind: "move", ship: "m", x: 12, y: 10 },
      { kind: "fire", ship: "c", target: "m", weapon: "nuclearMissile", hit: true, damage: 16 },
      { kind: "fire", ship: "a", target: "m", weapon: "laserCannon", hit: true, damage: 4 },
      { kind: "move", ship: "m", x: 18, y: 9 },
      { kind: "fire", ship: "m", target: "b", weapon: "hydraBreath", hit: true, damage: 40 },
      { kind: "destroyed", ship: "b" },
      { kind: "fire", ship: "m", target: "a", weapon: "hydraBreath", hit: false },
    ]);
  } else if (kind === "legacy") {
    add(`planet:${colony.id}`, 0, colony.name, 29.5, 10, 120, { isPlanet: true, designId: "planet" });
    for (let i = 0; i < 4; i++) add(`f1:frigate:${i}`, 1, "Frigate", 3 + (i % 2), 3 + i * 4, 9, { designId: "frigate" });
    add("f0:frigate:0", 0, "Frigate", 26, 8, 9, { designId: "frigate" });
    rounds.push([
      ...[0, 1, 2, 3].map((i) => ({ kind: "move", ship: `f1:frigate:${i}`, x: 12 + i, y: 6 + i * 2 })),
      { kind: "fire", ship: `planet:${colony.id}`, target: "f1:frigate:1", weapon: "laserCannon", hit: true, damage: 6 },
      { kind: "fire", ship: "f1:frigate:0", target: "f0:frigate:0", weapon: "laserCannon", hit: true, damage: 4 },
      { kind: "fire", ship: "f1:frigate:2", target: "f0:frigate:0", weapon: "laserCannon", hit: true, damage: 5 },
      { kind: "destroyed", ship: "f0:frigate:0" },
      { kind: "fire", ship: `planet:${colony.id}`, target: "f1:frigate:1", weapon: "nuclearMissile", hit: true, damage: 8 },
      { kind: "destroyed", ship: "f1:frigate:1" },
    ]);
  } else {
    // Attackers: one of every hull class.
    const hulls = [["frigate", 12], ["destroyer", 30], ["cruiser", 80], ["battleship", 200], ["titan", 480], ["doomStar", 1100]] as const;
    hulls.forEach(([hull, hp], i) => add(`a${i}`, 1, HULLS.find((h) => h.id === hull)!.name, 3 + (i % 2) * 2, 2 + i * 3, hp, {
      kind: "ship", hullId: hull, sizeClass: i + 1, maxArmor: Math.round(hp * 0.6), maxStructure: Math.round(hp * 0.4), maxShield: i * 2,
    }));
    // Defenders: the planet, three tiers of station and two escorts.
    add(`planet:${colony.id}`, 0, colony.name, 29.5, 10, 150, { kind: "planet", isPlanet: true, designId: "planet", maxArmor: 0, maxStructure: 150, maxShield: 5 });
    add("s0", 0, "Star Base", 26, 4, 120, { kind: "station", hullId: "starBase", sizeClass: 8, maxArmor: 60, maxStructure: 60, maxShield: 4 });
    add("s1", 0, "Battlestation", 26, 10, 300, { kind: "station", hullId: "battlestation", sizeClass: 9, maxArmor: 150, maxStructure: 150, maxShield: 8 });
    add("s2", 0, "Star Fortress", 26, 16, 600, { kind: "station", hullId: "starFortress", sizeClass: 10, maxArmor: 300, maxStructure: 300, maxShield: 12 });
    add("d0", 0, "Picket", 22, 7, 30, { kind: "ship", hullId: "destroyer", sizeClass: 2, maxArmor: 18, maxStructure: 12 });
    add("d1", 0, "Picket", 22, 13, 30, { kind: "ship", hullId: "destroyer", sizeClass: 2, maxArmor: 18, maxStructure: 12 });
    rounds.push([
      { kind: "move", ship: "a0", x: 9, y: 4 },
      { kind: "move", ship: "a1", x: 10, y: 6 },
      { kind: "move", ship: "a2", x: 11, y: 8 },
      { kind: "move", ship: "a3", x: 11, y: 11 },
      { kind: "move", ship: "a4", x: 10, y: 14 },
      { kind: "move", ship: "a5", x: 9, y: 17 },
      { kind: "fire", ship: "s1", target: "a3", weapon: "phasor", hit: true, damage: 18, absorbed: 6, armorDamage: 18, structureDamage: 0 },
      { kind: "fire", ship: "s2", target: "a4", weapon: "protonTorpedo", hit: true, damage: 40, armorDamage: 40, structureDamage: 0 },
      { kind: "launch", ship: "s2" },
      { kind: "fire", ship: "a5", target: "s1", weapon: "deathRay", hit: true, damage: 55, absorbed: 8, armorDamage: 55, structureDamage: 0 },
      { kind: "fire", ship: "a3", target: "d0", weapon: "plasmaCannon", hit: true, damage: 30, armorDamage: 18, structureDamage: 12, systemHit: "drive" },
      { kind: "destroyed", ship: "d0" },
    ]);
    rounds.push([
      { kind: "move", ship: "a0", x: 16, y: 5 },
      { kind: "fire", ship: `planet:${colony.id}`, target: "a0", weapon: "zeonMissile", hit: true, damage: 12, armorDamage: 7, structureDamage: 5 },
      { kind: "destroyed", ship: "a0" },
      { kind: "fire", ship: "a2", target: "d1", weapon: "fusionBeam", hit: false },
      { kind: "fire", ship: "d1", target: "a2", weapon: "ionPulseCannon", hit: true, damage: 0, absorbed: 6 },
      { kind: "repair", ship: "s1", damage: 12 },
      { kind: "fire", ship: "a4", target: "s0", weapon: "gaussCannon", hit: true, damage: 60, armorDamage: 60, structureDamage: 0, systemHit: "gaussCannon" },
      { kind: "board", ship: "a1", target: "d1" },
      { kind: "move", ship: "a2", x: 15, y: 9 },
      { kind: "retreat", ship: "a1" },
    ]);
  }
  return {
    id: `demo-${kind}`, turn: 1, starId: home.id, sides: [attacker, 0],
    ships: ships as CombatReport["ships"], rounds: rounds as CombatReport["rounds"], winner: 0, losses: {},
  };
}

function labBattle(kind: string): { session: GameSession; report: CombatReport } | null {
  const preset = LAB_PRESETS.find((p) => `lab-${p.id}` === kind);
  if (!preset) return null;
  const setup = setupCombatLab({ seed: "battle-demo", ...preset.spec });
  return { session: new GameSession(setup.state, null), report: runCombatLab(setup, 0).reports[0]! };
}

function commandSession(kind: string): GameSession | null {
  const preset = LAB_PRESETS.find((p) => `command-${p.id}` === kind);
  if (!preset) return null;
  const setup = setupCombatLab({ seed: "battle-demo", ...preset.spec });
  setup.state.players[setup.defenderId]!.isHuman = true;
  // Automation would fly the fleet off before the battle.
  setup.state.players[setup.defenderId]!.automation = [];
  const s = new GameSession(setup.state, setup.defenderId);
  // As in the lab, nobody gives orders, so the computer side does not fly off either.
  s.ordersForTurn = () => ({});
  s.endTurn();
  return s;
}

function Commanding() {
  const { session } = useGame();
  if (!session.battle) {
    const last = session.state.combats[0];
    return <div className="modal">Turn {session.state.turn}: the battle is over.{last && <CombatReplay report={last} />}</div>;
  }
  return <CommandBattle key={session.battle.pending.key} pending={session.battle.pending} />;
}

function Demo() {
  const [cmdSession] = useState(() => commandSession(new URLSearchParams(location.search).get("demo") ?? ""));
  if (cmdSession) return <SessionContext.Provider value={cmdSession}><Commanding /></SessionContext.Provider>;
  return <Showcase />;
}

function Showcase() {
  const [kind] = useState(() => new URLSearchParams(location.search).get("demo") ?? "full");
  const [lab] = useState(() => labBattle(kind));
  const [rep] = useState(() => lab?.report ?? report(kind));
  return (
    <SessionContext.Provider value={lab?.session ?? session}>
      <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16 }} className="modal">
        <h3 style={{ margin: "0 0 8px" }}>Battle at {home.name} (demo: {kind})</h3>
        <CombatReplay report={rep} />
      </div>
    </SessionContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Demo /></StrictMode>);
