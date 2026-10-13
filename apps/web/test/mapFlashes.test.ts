import { describe, expect, it } from "vitest";
import type { GameEvent } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { FLASH_COLORS, FLASH_SPREAD, FLASH_STAGGER, turnFlashes } from "../src/map/flashes";

const opts = { seed: "flashes", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

describe("turn flashes on the galaxy map", () => {
  const s = GameSession.create(opts, 0);
  const view = s.view;
  const home = Object.values(view.colonies).find((c) => c.ownerId === 0)!;
  const homeStar = view.planets[home.planetId]!.starId;
  const other = view.galaxy.stars.find((x) => x.id !== homeStar)!;

  it("lights one flash per star in the colour of its most important event, counting the rest", () => {
    const events: GameEvent[] = [
      { turn: 1, kind: "built", playerId: 0, colonyId: home.id, item: { kind: "building", id: "hydroponicFarm" } },
      { turn: 1, kind: "combat", playerId: 0, reportId: "r1", starId: homeStar, won: true },
      { turn: 1, kind: "explored", playerId: 0, starId: other.id },
      { turn: 1, kind: "techLearned", playerId: 0, techId: "colonyBase", tierId: "engineering" },
      { turn: 1, kind: "raid", playerId: 1, starId: other.id },
    ];
    const flashes = turnFlashes(view, events);
    expect(flashes.map((f) => [f.starId, f.kind, f.label])).toEqual([
      [homeStar, "battleWon", "Victory +1"],
      [other.id, "explored", "Explored"],
    ]);
    expect(flashes[0]!.color).toBe(FLASH_COLORS.battleWon);
    expect(flashes[1]!.strength).toBeLessThan(flashes[0]!.strength);
    expect(flashes.map((f) => f.delay)).toEqual([0, FLASH_STAGGER]);
  });

  it("spreads many flashes over a bounded time", () => {
    const events: GameEvent[] = view.galaxy.stars.map((x) => ({ turn: 1, kind: "explored", playerId: 0, starId: x.id }));
    const flashes = turnFlashes(view, events);
    expect(flashes.length).toBe(view.galaxy.stars.length);
    expect(flashes.at(-1)!.delay).toBeLessThanOrEqual(FLASH_SPREAD + 1e-9);
  });
});
