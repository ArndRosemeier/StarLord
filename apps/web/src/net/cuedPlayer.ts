import { loadCuedSession, type CuedSession } from "./cued";

/**
 * StarLord as a guest game on cued (cued.de, a private friends' portal; see docs/CUED.md in
 * ArndRosemeier/gameserver). cued opens the game in a sandboxed frame with `#cued=<pass>`; the pass
 * names the player. It is read for display only (the browser cannot check its signature): the
 * player's name and avatar, and the name other players see in online games.
 */
const STORAGE_KEY = "starlord.cued-pass";

let session: CuedSession | null = null;
let error: string | null = null;

/** Reads the pass once at startup (and strips it from the address bar). Without one the game runs as always. */
export function initCued(): void {
  try {
    session = loadCuedSession(STORAGE_KEY);
  } catch (e) {
    error = (e as Error).message;
  }
}

/** The cued player of this tab, or null when StarLord was not opened from cued. */
export function cuedPlayer(): CuedSession | null {
  return session;
}

/** Why a pass could not be read, if cued sent a broken one. */
export function cuedError(): string | null {
  return error;
}

/** Whether the game runs inside another page's frame (cued's): downloads and browser dialogs are blocked there. */
export const inFrame: boolean = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
