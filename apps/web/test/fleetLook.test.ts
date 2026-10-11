import { describe, expect, it } from "vitest";
import { GameSession } from "../src/game/session";
import { buildScene, fleetLook } from "../src/map/scene";

const opts = { seed: "looks", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

describe("fleet icons on the galaxy map", () => {
  it("gives starting scouts and colony ships their own look", () => {
    const view = GameSession.create(opts, 0).view;
    const scene = buildScene(view, null, null);
    const looks = scene.fleets.filter((f) => f.mine).map((f) => f.look.role);
    expect(looks).toContain("scout");
    expect(looks).toContain("colony");
  });

  it("shows the biggest warship of a mixed fleet, ahead of civilian ships", () => {
    const view = GameSession.create(opts, 0).view;
    const me = view.players[view.viewer]!;
    const byRole = (pred: (d: (typeof me.designs)[number]) => boolean) => me.designs.find(pred)!;
    const colony = byRole((d) => d.module === "colony");
    const scout = byRole((d) => !d.module && d.weapons.length === 0);
    const fleet = { ...Object.values(view.fleets).find((f) => f.ownerId === me.id)!, ships: [
      { designId: scout.id, count: 2 }, { designId: colony.id, count: 1 },
    ] };
    expect(fleetLook(me, fleet as never)).toEqual({ role: "colony", hull: colony.hull });
    const big = { ...colony, id: "big", module: null, hull: "battleship" as const, weapons: [{} as never] };
    const small = { ...colony, id: "small", module: null, hull: "frigate" as const, weapons: [{} as never] };
    const armed = { ...me, designs: [...me.designs, big, small] };
    const mixed = { ...fleet, ships: [...fleet.ships, { designId: "small", count: 3 }, { designId: "big", count: 1 }] };
    expect(fleetLook(armed, mixed as never)).toEqual({ role: "warship", hull: "battleship" });
  });
});
