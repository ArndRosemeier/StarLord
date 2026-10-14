import { describe, expect, it } from "vitest";
import {
  findDesign, latestDesign, newGame, outdatedBy, processTurn, refitTargets, validateCommand, type Command, type GameState, type ShipDesign,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function setup(): { s: GameState; design: ShipDesign } {
  const s = newGame({ seed: "edit-design", playerCount: 2, ...quiet });
  const p = s.players[0]!;
  const design: ShipDesign = {
    id: "u1-1", name: "Kestrel", hull: "frigate", armor: p.designs[0]!.armor, shield: null, computer: null,
    weapons: [], specials: [], module: null, obsolete: false,
  };
  p.designs.push(structuredClone(design));
  return { s, design };
}

const run = (s: GameState, cmds: Command[]) => {
  for (const c of cmds) expect(validateCommand(s, 0, c)).toEqual({ ok: true });
  return processTurn(s, { 0: cmds });
};

describe("editing designs", () => {
  it("changes an unused design in place", () => {
    const { s, design } = setup();
    const next = run(s, [{ type: "saveDesign", design: { ...design, name: "Kestrel B" } }]);
    expect(findDesign(next.players[0]!, design.id)?.name).toBe("Kestrel B");
  });

  it("keeps built ships on the old version and marks them outdated", () => {
    const { s, design } = setup();
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0)!;
    fleet.ships.push({ designId: design.id, count: 2 });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    home.queue.push({ kind: "ship", designId: design.id });

    // An in-place save is refused once ships exist.
    expect(validateCommand(s, 0, { type: "saveDesign", design: { ...design, weapons: [{ weaponId: "laserCannon", count: 1 }] } }).ok).toBe(false);

    const edited = { ...design, id: "u1-2", weapons: [{ weaponId: "laserCannon", count: 1 }] };
    const next = run(s, [{ type: "saveDesign", design: edited, replaces: design.id }]);
    const p = next.players[0]!;
    const old = findDesign(p, design.id)!;
    expect(old.obsolete).toBe(true);
    expect(old.weapons).toEqual([]);
    expect(outdatedBy(p, design.id)?.id).toBe("u1-2");
    expect(outdatedBy(p, "u1-2")).toBeUndefined();
    expect(next.fleets[fleet.id]!.ships.find((x) => x.designId === design.id)?.count).toBe(2);
    // Queued builds switch to the new version; the old one can be refitted to it.
    expect(next.colonies[home.id]!.queue.some((q) => q.kind === "ship" && q.designId === design.id)).toBe(false);
    expect(refitTargets(next, 0, design.id).map((d) => d.id)).toContain("u1-2");

    // Editing again chains versions; the oldest ships point at the newest one.
    const again = run(next, [{ type: "saveDesign", design: { ...edited, id: "u2-1", name: "Kestrel C" }, replaces: "u1-2" }]);
    expect(latestDesign(again.players[0]!, design.id)?.id).toBe("u2-1");
    // A superseded version can neither be edited again nor restored.
    expect(validateCommand(again, 0, { type: "saveDesign", design: { ...edited, id: "u2-9" }, replaces: design.id }).ok).toBe(false);
    expect(validateCommand(again, 0, { type: "obsoleteDesign", designId: design.id, obsolete: false }).ok).toBe(false);
  });
});
