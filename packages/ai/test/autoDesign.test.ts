import { describe, expect, it } from "vitest";
import { HULLS, WEAPONS, newGame, playerView, validateDesign } from "@starlord/sim";
import { STRATEGIES, autoDesign } from "../src/index.js";

function setup() {
  const s = newGame({ seed: "autodesign", playerCount: 2, monsters: false, raiders: false, council: false });
  const p = s.players[0]!;
  p.isHuman = true;
  p.techs.push("nuclearMissile", "fusionBeam", "missileBase", "starBase");
  return { s, p };
}

describe("ship designer auto design", () => {
  it("every design strategy fills a valid warship", () => {
    const { s, p } = setup();
    for (const strat of STRATEGIES.design) {
      const d = autoDesign(playerView(s, 0), strat.id, "destroyer");
      expect(d, strat.id).not.toBeNull();
      expect(validateDesign(p, { ...d!, name: "x" }), strat.id).toBeNull();
      expect(d!.weapons.length).toBeGreaterThan(0);
    }
  });

  it("beam and missile strategies fix the weapon kind and keep the hull", () => {
    const { s } = setup();
    const kind = (id: string) => WEAPONS.find((w) => w.id === id)!.kind;
    const beams = autoDesign(playerView(s, 0), "beams", "destroyer")!;
    expect(beams.hull).toBe("destroyer");
    expect(beams.weapons.every((w) => kind(w.weaponId) === "beam")).toBe(true);
    const missiles = autoDesign(playerView(s, 0), "missiles", "destroyer")!;
    expect(missiles.hull).toBe("destroyer");
    expect(["missile", "torpedo"]).toContain(kind(missiles.weapons[0]!.weaponId));
  });

  it("heavy hulls pick a hull at least as big as light hulls", () => {
    const { s } = setup();
    const rank = (h: string) => HULLS.findIndex((x) => x.id === h);
    const heavy = autoDesign(playerView(s, 0), "heavy", "frigate")!;
    const light = autoDesign(playerView(s, 0), "light", "frigate")!;
    expect(rank(heavy.hull)).toBeGreaterThanOrEqual(rank(light.hull));
  });
});
