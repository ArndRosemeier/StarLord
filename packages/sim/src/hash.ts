import type { GameState } from "./types.js";

/** FNV-1a hash of the serialized state; equal hashes mean identical games. */
export function stateHash(state: GameState): string {
  const json = JSON.stringify(state);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}
