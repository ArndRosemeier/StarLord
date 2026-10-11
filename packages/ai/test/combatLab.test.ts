import { describe, expect, it } from "vitest";
import { LAB_PRESETS, batchCombatLab, randomLabSpec, runCombatLab, setupCombatLab, type CombatLabSpec } from "../src/combatLab.js";

describe("combat lab", () => {
  for (const preset of LAB_PRESETS) {
    it(`${preset.name} fights cleanly`, () => {
      const setup = setupCombatLab({ seed: preset.id, ...preset.spec });
      expect(setup.notes).toEqual([]);
      const batch = batchCombatLab(setup, 6);
      expect(batch.problems).toEqual([]);
      expect(batch.runs).toBe(6);
      expect(batch.wins[0]! + batch.wins[1]! + batch.draws).toBe(6);
    });
  }

  it("finds no broken rules in random matchups", () => {
    const found: string[] = [];
    for (let i = 0; i < 60; i++) {
      for (const p of runCombatLab(setupCombatLab(randomLabSpec(`t${i}`)), 0).problems) found.push(`t${i}: ${p}`);
    }
    expect(found).toEqual([]);
  });

  it("is deterministic", () => {
    const setup = setupCombatLab({ seed: "d", ...LAB_PRESETS[2]!.spec });
    expect(JSON.stringify(runCombatLab(setup, 3).reports)).toBe(JSON.stringify(runCombatLab(setup, 3).reports));
  });

  // A big fleet of weak ships against a shielded planet: time runs out with both sides standing.
  const stalemate: CombatLabSpec = {
    seed: "stalemate",
    attacker: { raceId: "terran", techLevel: 1, ships: [{ hull: "destroyer", arms: "beam", count: 6 }], attacksPlanet: true },
    defender: { raceId: "lysari", techLevel: 12, ships: [], station: null, defenses: ["fighterGarrison"], planetShield: "barrierShield" },
  };

  it("fights each pair of enemies once a turn, even when time runs out", () => {
    const res = runCombatLab(setupCombatLab(stalemate), 0);
    expect(res.reports.length).toBe(1);
    expect(res.problems).toEqual([]);
  });

  it("ships off attack stance shoot back at an armed planet", () => {
    const setup = setupCombatLab({
      seed: "return-fire",
      attacker: { raceId: "terran", techLevel: 6, ships: [{ hull: "cruiser", arms: "beam", count: 3 }], attacksPlanet: false },
      defender: { raceId: "lysari", techLevel: 6, ships: [], station: null, defenses: ["groundBatteries"], planetShield: null },
    });
    const res = runCombatLab(setup, 0);
    expect(res.problems).toEqual([]);
    const r = res.reports[0]!;
    const planet = r.ships.find((s) => s.kind === "planet")!;
    expect(r.rounds.flat().some((e) => e.kind === "fire" && e.target === planet.key)).toBe(true);
  });
});
