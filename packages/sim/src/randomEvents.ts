import type { TurnContext } from "./context.js";
import { population } from "./economy.js";
import { TECHS, TECH_TIERS } from "./data/techs.js";
import { grantTech } from "./empire.js";

/** Occasional galactic events, MoO2-style. About one every 25 turns. */
export const EVENT_CHANCE = 0.04;

export function randomEventTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  if (state.turn < 20 || !rng.chance(EVENT_CHANCE)) return;
  const empires = state.players.filter((p) => p.kind === "empire" && p.alive);
  if (empires.length === 0) return;
  const p = rng.pick(empires);
  const colonies = Object.values(state.colonies).filter((c) => c.ownerId === p.id && !c.outpost);
  const kind = rng.weighted({ plague: 2, gold: 3, derelict: 2, comet: 1, boom: 2 });
  switch (kind) {
    case "plague": {
      const c = colonies.length ? rng.pick(colonies) : undefined;
      if (!c || population(c) < 3) return;
      for (let i = 0; i < 2; i++) {
        if (c.workers > 0) c.workers--;
        else if (c.scientists > 0) c.scientists--;
        else c.farmers--;
      }
      ctx.emit({ kind: "random", playerId: p.id, what: `A plague killed 2 population at ${c.name}.` });
      return;
    }
    case "gold": {
      const amount = 50 + rng.int(0, 10) * 10;
      p.bc += amount;
      ctx.emit({ kind: "random", playerId: p.id, what: `Prospectors struck it rich: +${amount} BC.` });
      return;
    }
    case "derelict": {
      const next = TECH_TIERS.filter((t) => !p.tiers.includes(t.id) && t.cost <= 400)
        .flatMap((t) => t.techs)
        .filter((t) => !p.techs.includes(t));
      if (next.length === 0) return;
      const tech = rng.pick(next);
      grantTech(p, tech);
      ctx.emit({ kind: "random", playerId: p.id, what: `Scientists reverse-engineered a derelict ship and learned ${TECHS[tech]?.name ?? tech}.` });
      return;
    }
    case "comet": {
      const c = colonies.length ? rng.pick(colonies) : undefined;
      if (!c || c.buildings.length === 0) return;
      const b = rng.pick(c.buildings);
      c.buildings = c.buildings.filter((x) => x !== b);
      ctx.emit({ kind: "random", playerId: p.id, what: `A comet strike destroyed a building at ${c.name}.` });
      return;
    }
    case "boom": {
      const c = colonies.length ? rng.pick(colonies) : undefined;
      if (!c) return;
      c.growthK += 900;
      ctx.emit({ kind: "random", playerId: p.id, what: `A baby boom swept ${c.name}.` });
      return;
    }
  }
}
