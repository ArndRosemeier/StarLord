import { loadCuedSession, type CuedSession } from "./cued";

/**
 * StarLord as a guest game on cued (cued.de, a private friends' portal; see docs/CUED.md in
 * ArndRosemeier/gameserver). cued opens the game in a sandboxed frame with `#cued=<pass>`; the pass
 * names the player. It is read for display only (the browser cannot check its signature): the
 * player's name and avatar, and the name other players see in online games.
 */
const STORAGE_KEY = "starlord.cued-pass";
const CUED_ORIGIN = "https://cued.de";

let session: CuedSession | null = null;
let error: string | null = null;

/** Whether the game runs inside another page's frame (cued's): downloads and browser dialogs are blocked there. */
export const inFrame: boolean = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

/** Whether cued's page framed the game (its frame sends cued's origin as the referrer). */
export const framedByCued: boolean = inFrame && (() => {
  try { return document.referrer.startsWith(CUED_ORIGIN); } catch { return false; }
})();

/** A pass sent as `?cued=` instead of `#cued=` is moved into the fragment, where the reader looks and strips it. */
function passFromQuery(): void {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("cued");
  if (!token) return;
  url.searchParams.delete("cued");
  if (!/(^#|&)cued=/.test(url.hash)) url.hash = url.hash ? `${url.hash}&cued=${token}` : `cued=${token}`;
  window.history.replaceState(window.history.state, "", url);
}

/** Reads the pass once at startup (and strips it from the address bar). Without one the game runs as always. */
export function initCued(): void {
  try {
    passFromQuery();
    session = loadCuedSession(STORAGE_KEY);
  } catch (e) {
    error = (e as Error).message;
  }
  if (session) console.info(`StarLord: opened from cued as ${session.identity.name}${session.expired ? " (pass expired)" : ""}`);
  else if (error) console.warn(`StarLord: cued pass could not be read: ${error}`);
  else if (framedByCued) console.warn("StarLord: framed by cued, but no #cued= pass arrived in the address");
}

/** The cued player of this tab, or null when StarLord was not opened from cued. */
export function cuedPlayer(): CuedSession | null {
  return session;
}

/** Why a pass could not be read, if cued sent a broken one. */
export function cuedError(): string | null {
  return error;
}

/** Whether anything about cued is worth showing: a player, a broken pass, or cued's frame without a pass. */
export function cuedShown(): boolean {
  return !!session || !!error || framedByCued;
}
