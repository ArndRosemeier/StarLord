import { describe, expect, it } from "vitest";
import { newGame, type Fleet } from "@starlord/sim";
import { defaultAnswer, mayChooseTarget, mayStrikeFromOrbit, nextAsk } from "../src/net/asks";

/** Player 0 (human) at war with player 1, with a defend-stance warfleet arriving at player 1's home this turn. */
function arriving(race = "terran") {
  const s = newGame({ seed: "asks", races: [race, "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  s.players[0]!.isHuman = true;
  const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
  home.buildings = ["starBase"];
  for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
  const star = s.galaxy.stars.find((x) => x.id === s.planets[home.planetId]!.starId)!;
  const f: Fleet = {
    id: "o1", ownerId: 0, x: star.x + 0.01, y: star.y, starId: null, destStarId: star.id, ships: [{ designId: "frigate", count: 4 }], stance: "defend", name: "Strike",
  };
  s.fleets[f.id] = f;
  return { s, star, home, f };
}

describe("online asks for fleets arriving at an enemy system", () => {
  it("ask the arriving player what to attack, and answer for an absent player by holding back", () => {
    const { s, star } = arriving();
    expect(mayChooseTarget(s, 0)).toBe(true);
    const ask = nextAsk(s, {}, [0]);
    expect(ask).toEqual({ kind: "target", seats: [0], key: `0:${star.id}` });
    const answer = defaultAnswer(s, {}, ask!, 0);
    expect(answer).toEqual([{ type: "setStance", fleetId: "o1", stance: "defend" }]);
    expect(nextAsk(s, { 0: answer }, [0])).toBeNull();
  });

  it("check orbit choices after an attack pick or for telepaths", () => {
    const { s, home, f } = arriving();
    expect(mayStrikeFromOrbit(s, {}, 0)).toBe(false);
    expect(mayStrikeFromOrbit(s, { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: home.id }] }, 0)).toBe(true);
    expect(mayStrikeFromOrbit(arriving("lysari").s, {}, 0)).toBe(true);
  });
});
