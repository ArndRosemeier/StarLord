import { useEffect, useRef, useSyncExternalStore } from "react";
import type { GameSession } from "./session";
import { getPrefs } from "./prefs";
import { writeAutosave, type AutosaveResult } from "./saves";

/** Autosave: at the start of every new turn and when the page is hidden or closed. */

let last: (AutosaveResult & { turn: number }) | null = null;
const listeners = new Set<() => void>();

/** Saves the game into the autosave slots if autosave is on; the outcome shows in the settings. */
export function autosave(session: GameSession): AutosaveResult | null {
  // Online games live in their room (a reload rejoins it), not in the autosave slots.
  if (!getPrefs().autosave || session.spectator || session.online) return null;
  const result = writeAutosave(session.toJSON());
  last = { ...result, turn: session.state.turn };
  for (const fn of listeners) fn();
  return result;
}

/** The last autosave this page made, if any. */
export function useLastAutosave(): (AutosaveResult & { turn: number }) | null {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => last,
  );
}

/** Autosaves a played (not watched) game whenever a new turn starts, and when the player leaves the page. */
export function useAutosave(session: GameSession): void {
  const turn = useRef(session.state.turn);
  const ref = useRef(session);
  ref.current = session;

  useEffect(() => {
    if (session.state.turn === turn.current) return;
    turn.current = session.state.turn;
    // After the new turn has painted, so the turn banner does not wait on writing the save.
    const id = window.setTimeout(() => autosave(ref.current), 0);
    return () => window.clearTimeout(id);
  }, [session.state.turn]);

  useEffect(() => {
    const leave = () => { autosave(ref.current); };
    const hidden = () => { if (document.visibilityState === "hidden") leave(); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
}
