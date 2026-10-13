import { describe, expect, it } from "vitest";
import { designStats, newGame, swapMountWeapon, weaponUnitCost, type ShipDesign } from "@starlord/sim";

const ship = (hull: ShipDesign["hull"], weapons: ShipDesign["weapons"]): ShipDesign => ({
  id: "t", name: "t", hull, armor: "titaniumArmor", shield: null, computer: null, weapons, specials: [], module: null, obsolete: false,
});

describe("swapping a mount's weapon", () => {
  const p = newGame({ seed: "swap", races: ["terran", "felhari"], monsters: false, raiders: false, council: false }).players[0]!;

  it("keeps count, arc and the modifications the new weapon takes", () => {
    const d = ship("battleship", [{ weaponId: "laserCannon", count: 4, arc: "full", mods: ["heavyMount"] }]);
    expect(swapMountWeapon(p, d, 0, "fusionBeam")).toEqual({ weaponId: "fusionBeam", count: 4, arc: "full", mods: ["heavyMount"] });
  });

  it("drops what the new weapon cannot take", () => {
    const d = ship("battleship", [{ weaponId: "laserCannon", count: 2, arc: "full", mods: ["heavyMount"] }]);
    const m = swapMountWeapon(p, d, 0, "nuclearMissile");
    expect(m.arc).toBeUndefined();
    expect(m.mods).toBeUndefined();
    expect(m.weaponId).toBe("nuclearMissile");
  });

  it("trims the count to the space left in the hull", () => {
    const d = ship("destroyer", [{ weaponId: "laserCannon", count: 1 }, { weaponId: "massDriver", count: 4 }]);
    const m = swapMountWeapon(p, d, 1, "ionPulseCannon");
    const swapped = { ...d, weapons: [d.weapons[0]!, m] };
    const s = designStats(p, swapped);
    expect(m.count).toBeLessThan(4);
    expect(m.count).toBeGreaterThanOrEqual(1);
    if (m.count > 1) expect(s.spaceUsed).toBeLessThanOrEqual(s.spaceTotal);
    const room = designStats(p, { ...d, weapons: [d.weapons[0]!] });
    expect(m.count).toBe(Math.max(1, Math.min(4, Math.floor((room.spaceTotal - room.spaceUsed) / weaponUnitCost(p, m).space))));
  });
});
