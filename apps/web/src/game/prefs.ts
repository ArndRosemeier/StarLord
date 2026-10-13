import { useSyncExternalStore } from "react";

/** Player settings kept in this browser: autosave, battle replay speed and map flashes. Sound lives in audio/sound.ts. */

export interface Prefs {
  /** Save automatically at the start of every turn and when the page is hidden. */
  autosave: boolean;
  /** Battle replay speed as a multiple of the normal pace. */
  replaySpeed: number;
  /** Flashes on the galaxy map where things happened last turn: bursting, a gentle glow in place, or none. */
  mapFlashes: MapFlashMode;
}

export type MapFlashMode = "burst" | "calm" | "off";
export const MAP_FLASH_MODES: readonly MapFlashMode[] = ["burst", "calm", "off"];

const KEY = "starlord.prefs";
const DEFAULTS: Prefs = { autosave: true, replaySpeed: 1, mapFlashes: "burst" };
/** The replay speeds offered in the settings. */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      autosave: typeof raw.autosave === "boolean" ? raw.autosave : DEFAULTS.autosave,
      replaySpeed: (REPLAY_SPEEDS as readonly number[]).includes(raw.replaySpeed as number) ? raw.replaySpeed! : DEFAULTS.replaySpeed,
      mapFlashes: MAP_FLASH_MODES.includes(raw.mapFlashes as MapFlashMode) ? raw.mapFlashes! : DEFAULTS.mapFlashes,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Prefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return (current ??= load());
}

export function updatePrefs(patch: Partial<Prefs>): void {
  current = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the choice lasts until the page is reloaded.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs);
}

/** Forget the cached settings (tests swap localStorage). */
export function resetPrefsCache(): void {
  current = null;
}
