import type { LabSetup } from "@starlord/ai";
import { GameSession } from "./session";

/**
 * A combat lab battle the player commands: the lab's game with one side
 * played by a human, its turn ended so it stops at the battle exactly as an
 * in-game turn does, and shown with the same battle screen.
 */
export function commandLabBattle(setup: LabSetup, side: "attacker" | "defender"): GameSession {
  const state = structuredClone(setup.state);
  const me = side === "attacker" ? setup.attackerId : setup.defenderId;
  const player = state.players[me]!;
  player.isHuman = true;
  player.autoBattles = false;
  // Automation would fly the fleet off before the battle.
  player.automation = [];
  const session = new GameSession(state, me);
  // As in the lab, nobody gives orders, so the computer side does not fly off either.
  session.ordersForTurn = () => ({});
  session.endTurn();
  return session;
}
