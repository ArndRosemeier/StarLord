import { describe, expect, it } from "vitest";
import { BOMB_DAMAGE_PER_HIT, RELATION_EVENTS, playerView, population, type Fleet } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { optionText, outrageText } from "../src/screens/OrbitalStrike";

/** A human (player 0) with bombers over the undefended home colony of player 1, at war; player 2 looks on. */
function setup() {
  const s = GameSession.create({ seed: "orbit", races: ["gorvath", "felhari", "kordex"], monsters: false, raiders: false, council: false, randomEvents: false }, 0);
  const st = s.state;
  st.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  st.players[0]!.contacts = [1, 2];
  st.players[1]!.contacts = [0];
  st.players[2]!.contacts = [0];
  const c = Object.values(st.colonies).find((x) => x.ownerId === 1)!;
  c.buildings = [];
  for (const f of Object.values(st.fleets)) if (f.ownerId === 1) delete st.fleets[f.id];
  const p = st.players[0]!;
  p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "bomber", name: "Bomber", hull: "cruiser", weapons: [{ weaponId: "nuclearBomb", count: 4 }] });
  const starId = st.planets[c.planetId]!.starId;
  const star = st.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: "strike", ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships: [{ designId: "bomber", count: 3 }], stance: "attack", name: "Strike" };
  st.fleets[f.id] = f;
  p.explored.push(starId);
  return { s, c };
}

describe("orbital strikes in the end-turn flow", () => {
  it("stops the turn at a colony the player holds orbit over, and goes on with their choice recorded", () => {
    const { s, c } = setup();
    const turn = s.state.turn;
    const pop = population(c);
    s.endTurn();
    expect(s.state.turn).toBe(turn);
    expect(s.orbital?.prompt.colonyId).toBe(c.id);
    s.finishOrbital("none");
    expect(s.orbital).toBeNull();
    expect(s.state.turn).toBe(turn + 1);
    expect(s.record?.turns.at(-1)?.orders[0]?.some((o) => o.type === "orbitalStrike" && o.choice === "none")).toBe(true);
    expect(s.state.events.some((e) => e.kind === "orbitalStrike")).toBe(false);
    expect(population(s.state.colonies[c.id]!)).toBeGreaterThanOrEqual(pop - 1);
  });

  it("does not ask when the game plays the turn by itself; the fleet then bombards", () => {
    const { s, c } = setup();
    s.endTurn({ commandBattles: false });
    expect(s.orbital).toBeNull();
    expect(s.state.events.some((e) => e.kind === "orbitalStrike" && e.colonyName === c.name)).toBe(true);
  });

  it("explains each choice with the sim's numbers", () => {
    const { s } = setup();
    s.endTurn();
    const prompt = s.orbital!.prompt;
    const view = playerView(s.state, 0);
    const bomb = prompt.options.find((o) => o.choice === "bomb")!;
    expect(optionText(view, prompt, bomb)).toContain(`each ${BOMB_DAMAGE_PER_HIT} damage`);
    expect(optionText(view, prompt, bomb)).toContain("No diplomatic penalty");
    // Player 2 is in contact and at peace: it would be appalled, by up to the full roll at a neutral relation.
    expect(prompt.outrage.empires.map((e) => e.playerId)).toEqual([2]);
    expect(outrageText(view, prompt)).toContain(view.players[2]!.name);
    expect(prompt.outrage.roll).toBe(RELATION_EVENTS.destruction);
    expect(prompt.options.find((o) => o.choice === "destroy")!.available).toBe(false);
  });
});
