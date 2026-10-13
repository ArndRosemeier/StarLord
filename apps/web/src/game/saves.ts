import type { GameRecord } from "@starlord/sim";
import type { SavedGame } from "./session";

/** Save slots in browser storage, plus file export/import. */

const INDEX_KEY = "starlord.saves";
const slotKey = (name: string) => `starlord.save.${name}`;

export interface SaveInfo {
  name: string;
  turn: number;
  savedAt: string;
  empire: string;
  /** Written by autosave; only the newest few are kept. */
  auto?: boolean;
}

export function listSaves(): SaveInfo[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as SaveInfo[];
  } catch {
    return [];
  }
}

export function writeSave(name: string, save: SavedGame, auto = false): void {
  writeRaw(name, save, JSON.stringify(save), auto);
}

function writeRaw(name: string, save: SavedGame, json: string, auto: boolean): void {
  const info: SaveInfo = {
    name,
    turn: save.state.turn,
    savedAt: new Date().toISOString(),
    empire: save.me === null ? "Spectating" : save.state.players[save.me]!.name,
    ...(auto ? { auto: true } : {}),
  };
  localStorage.setItem(slotKey(name), json);
  const rest = listSaves().filter((s) => s.name !== name);
  localStorage.setItem(INDEX_KEY, JSON.stringify([info, ...rest]));
}

/** How many autosaves are kept; older ones are deleted. Saves can be a few MB and browsers allow about 5 MB per site. */
export const AUTOSAVES_KEPT = 2;

/** The newest save of any kind, for "Continue". */
export function latestSave(): SaveInfo | undefined {
  return [...listSaves()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export type AutosaveResult = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Saves into the rotating autosave slots. When the browser storage is full,
 * the oldest autosaves make room first; manual saves are never touched.
 */
export function writeAutosave(save: SavedGame): AutosaveResult {
  const empire = save.me === null ? "Spectating" : save.state.players[save.me]!.name;
  const name = `Autosave: ${empire}, turn ${save.state.turn}`;
  let json: string;
  try {
    json = JSON.stringify(save);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const autos = () => listSaves().filter((s) => s.auto && s.name !== name).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  // Make room for the new one before writing, so the slots never exceed the limit.
  for (const old of autos().slice(0, Math.max(0, autos().length - (AUTOSAVES_KEPT - 1)))) deleteSave(old.name);
  for (;;) {
    try {
      writeRaw(name, save, json, true);
      return { ok: true, name };
    } catch (e) {
      const oldest = autos()[0];
      if (!oldest) {
        // Nothing left to free; drop a half-written slot so the index stays honest.
        try { deleteSave(name); } catch { /* storage blocked */ }
        return { ok: false, reason: isQuota(e) ? "browser storage is full" : (e as Error).message };
      }
      deleteSave(oldest.name);
    }
  }
}

function isQuota(e: unknown): boolean {
  const { name, code } = (e ?? {}) as { name?: string; code?: number };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22;
}

export function readSave(name: string): unknown {
  const raw = localStorage.getItem(slotKey(name));
  if (!raw) throw new Error(`No save named ${name}`);
  return JSON.parse(raw);
}

export function deleteSave(name: string): void {
  localStorage.removeItem(slotKey(name));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listSaves().filter((s) => s.name !== name)));
}

export function downloadSave(save: SavedGame | GameRecord, filename: string): void {
  const blob = new Blob([JSON.stringify(save)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readSaveFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
