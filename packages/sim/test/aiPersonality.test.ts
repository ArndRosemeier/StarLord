import { describe, expect, it } from "vitest";
import {
  OBJECTIVE_ORDER, RACES, RESEARCH_GROUPS, SHIP_SPECIALTIES, SPECIALS_BY_ID, TECHS, TEMPERAMENT_ORDER, TEMPERAMENT_ROWS,
  aiLeanings, leaningWeights, leanings, newGame, temperament, type Difficulty,
} from "@starlord/sim";

const game = (seed: string, races: string[], difficulty: Difficulty = "average") =>
  newGame({ seed, races, humanPlayers: [0], monsters: false, raiders: false, council: false, difficulty });

describe("computer empire leanings (the original's personality and objective setup)", () => {
  it("rolls each race's temperament from its own row", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const s = game(`hive${i}`, ["terran", "zhrikk"]);
      seen.add(temperament(s, 1)!);
    }
    // The hive race's row only holds xenophobic, ruthless and aggressive.
    for (const t of seen) expect(["xenophobic", "ruthless", "aggressive"]).toContain(t);
    expect(seen.has("xenophobic")).toBe(true);
  });

  it("pushes the roll toward the hostile end of the row on harder levels", () => {
    const share = (d: Difficulty) => {
      let pacifist = 0;
      for (let i = 0; i < 200; i++) if (temperament(game(`sch${i}`, ["terran", "ythari"], d), 1) === "pacifistic") pacifist++;
      return pacifist;
    };
    // Scholar row: 3,3,4,5,5,5,5,5,5,5. Tutor: index 2..9 (clamped) → mostly pacifistic; impossible: -2..7 → fewer.
    expect(share("tutor")).toBeGreaterThan(share("impossible"));
  });

  it("gives no leanings to human players", () => {
    const s = game("hum", ["terran", "felhari"]);
    expect(aiLeanings(s, 0)).toBeNull();
    expect(aiLeanings(s, 1)).not.toBeNull();
  });

  it("weighs objectives by race picks like the original", () => {
    const s = game("w", ["terran", "ythari", "felhari", "kordex"]);
    // Creative scholars: technologist +1000 (creative) +100 (+2 research) +3 (low gravity) dwarfs the rest.
    const scholars = leaningWeights(s, 1);
    expect(scholars.objective.technologist).toBeGreaterThan(1000);
    // +50 ship attack: militarist +100 and beams +1000.
    const felines = leaningWeights(s, 2);
    expect(felines.objective.militarist).toBe(2 + 100);
    expect(felines.weapon.beams).toBe(2 + 1000);
    // Cybernetic: armor specialty +1000.
    expect(leaningWeights(s, 3).specialty.armor).toBe(2 + 1000);
    // Charismatic generalists: diplomat +100.
    expect(leaningWeights(s, 0).objective.diplomat).toBe(1 + 100);
  });

  it("draws every objective somewhere across races and seeds, and is fixed for a game", () => {
    const seen = new Set<string>();
    for (const r of RACES) {
      for (let i = 0; i < 10; i++) {
        const s = game(`obj${r.id}${i}`, ["terran", r.id]);
        const l = leanings(s, 1);
        expect(leanings(s, 1)).toEqual(l);
        seen.add(l.objective);
      }
    }
    for (const o of OBJECTIVE_ORDER) expect(seen.has(o)).toBe(true);
  });

  it("names only real applications and specials", () => {
    for (const list of Object.values(RESEARCH_GROUPS)) for (const t of list) expect(TECHS[t], t).toBeDefined();
    for (const s of Object.values(SHIP_SPECIALTIES)) for (const id of s.specials) expect(SPECIALS_BY_ID[id], id).toBeDefined();
    for (const r of RACES) expect(TEMPERAMENT_ROWS[r.assetKey], r.id).toHaveLength(10);
    for (const row of Object.values(TEMPERAMENT_ROWS)) for (const x of row) expect(TEMPERAMENT_ORDER[x]).toBeDefined();
  });
});
