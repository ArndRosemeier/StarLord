import { createContext, useContext, useSyncExternalStore } from "react";
import type { GameSession } from "../game/session";

export const SessionContext = createContext<GameSession | null>(null);

/** The running game, its current view, and the viewer's player record. Re-renders on every change. */
export function useGame() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useGame outside a game");
  useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.version,
    () => session.version,
  );
  const view = session.view;
  const me = view.players[view.viewer]!;
  return { session, view, me, readOnly: session.spectator };
}
