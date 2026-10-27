import { describe, expect, it } from "vitest";
import { designStats, newGame, playerView, type Fleet, type GameState } from "@starlord/sim";
import { bestWarship } from "../src/design.js";
import { orbitalOrders } from "../src/orbital.js";

function setup(): { s: GameState; colonyId: string; starId: string } {
  const s = newGame({ seed: "ai-orbit", races: ["gorvath", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  const c = Object.values(s.colonies).find((x) => x.ownerId === 1)!;
  const p = s.players[0]!;
  p.explored.push(s.planets[c.planetId]!.starId);
  const frigate = p.designs.find((d) => d.id === "frigate")!;
  p.designs.push(
    { ...structuredClone(frigate), id: "conv", name: "Converter", hull: "titan", weapons: [{ weaponId: "stellarConverter", count: 1 }] },
    { ...structuredClone(frigate), id: "troop", name: "Troops", module: "transport", weapons: [] },
  );
  return { s, colonyId: c.id, starId: s.planets[c.planetId]!.starId };
}

function fleet(s: GameState, starId: string, ships: Fleet["ships"]): void {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const id = `t${s.nextId++}`;
  s.fleets[id] = { id, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships, stance: "attack", name: "Strike" };
}

const choiceFor = (s: GameState, colonyId: string) => {
  const cmd = orbitalOrders(playerView(s, 0)).find((c) => c.type === "orbitalStrike" && c.colonyId === colonyId);
  return cmd?.type === "orbitalStrike" ? cmd.choice : null;
};

describe("computer orbital strikes", () => {
  it("destroy an enemy's last system with a Stellar Converter when there are no troops to take it", () => {
    const { s, colonyId, starId } = setup();
    fleet(s, starId, [{ designId: "conv", count: 1 }]);
    expect(choiceFor(s, colonyId)).toBe("destroy");
  });

  it("invade a colony they mean to take once their troops outnumber the garrison, and bomb it until then", () => {
    const { s, colonyId, starId } = setup();
    expect(designStats(s.players[0]!, s.players[0]!.designs.find((d) => d.id === "troop")!).troops).toBeGreaterThan(0);
    fleet(s, starId, [{ designId: "conv", count: 1 }, { designId: "troop", count: 1 }]);
    expect(choiceFor(s, colonyId)).toBe("bomb");
    fleet(s, starId, [{ designId: "troop", count: 60 }]);
    expect(choiceFor(s, colonyId)).toBe("invade");
  });

  it("take the colony by mind control when they are telepaths with a cruiser or larger there", () => {
    const { s, colonyId, starId } = setup();
    s.players[0]!.raceId = "lysari";
    fleet(s, starId, [{ designId: "conv", count: 1 }]);
    expect(choiceFor(s, colonyId)).toBe("mind");
    s.players[1]!.raceId = "lysari";
    expect(choiceFor(s, colonyId)).toBe("destroy");
  });

  it("give no orders where they have no fleet or are not at war", () => {
    const { s, colonyId, starId } = setup();
    expect(choiceFor(s, colonyId)).toBeNull();
    fleet(s, starId, [{ designId: "conv", count: 1 }]);
    s.relations["0-1"] = { status: "none", trade: false, research: false, since: 1 };
    expect(choiceFor(s, colonyId)).toBeNull();
  });

  it("mount a Stellar Converter on their biggest warships once known", () => {
    const { s } = setup();
    s.players[0]!.techs.push("stellarConverter", "doomStarHull");
    const d = bestWarship(playerView(s, 0), "doomStar", "beam", "x");
    expect(d?.weapons.some((m) => m.weaponId === "stellarConverter")).toBe(true);
  });
});
