import { describe, expect, it } from "vitest";
import { DESIGN_NAMES } from "../src/data/designNames.js";
import { SHIP_STYLES } from "../src/data/shipStyles.js";
import { defaultDesignName, newGame, type Player } from "@starlord/sim";

const player = (raceId: string): Player => {
  const p = structuredClone(newGame({ seed: "names", playerCount: 2, monsters: false, raiders: false, council: false }).players[0]!);
  p.raceId = raceId;
  return p;
};

describe("default design names", () => {
  it("has escort and capital names for every ship style", () => {
    for (const s of SHIP_STYLES) {
      expect(DESIGN_NAMES[s.id].escort.length).toBeGreaterThan(5);
      expect(DESIGN_NAMES[s.id].capital.length).toBeGreaterThan(5);
    }
  });

  it("follows the race and the hull size", () => {
    const kyrrin = player("kyrrin");
    expect(DESIGN_NAMES.raptor.escort).toContain(defaultDesignName(kyrrin, "frigate"));
    expect(DESIGN_NAMES.raptor.capital).toContain(defaultDesignName(kyrrin, "battleship"));
    expect(DESIGN_NAMES.hive.escort).toContain(defaultDesignName(player("zhrikk"), "destroyer"));
  });

  it("skips names already used and numbers repeats", () => {
    const p = player("terran");
    const first = defaultDesignName(p, "frigate");
    p.designs.push({ ...p.designs[0]!, id: "x1", name: first });
    expect(defaultDesignName(p, "frigate")).not.toBe(first);
    for (const [i, name] of DESIGN_NAMES.standard.escort.entries()) p.designs.push({ ...p.designs[0]!, id: `y${i}`, name });
    expect(defaultDesignName(p, "frigate")).toBe(`${DESIGN_NAMES.standard.escort[0]} II`);
  });
});
