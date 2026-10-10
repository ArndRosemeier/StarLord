import type { SavedGame } from "./session";

/** Save slots in browser storage, plus file export/import. */

const INDEX_KEY = "starlord.saves";
const slotKey = (name: string) => `starlord.save.${name}`;

export interface SaveInfo {
  name: string;
  turn: number;
  savedAt: string;
  empire: string;
}

export function listSaves(): SaveInfo[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as SaveInfo[];
  } catch {
    return [];
  }
}

export function writeSave(name: string, save: SavedGame): void {
  const info: SaveInfo = {
    name,
    turn: save.state.turn,
    savedAt: new Date().toISOString(),
    empire: save.me === null ? "Spectating" : save.state.players[save.me]!.name,
  };
  localStorage.setItem(slotKey(name), JSON.stringify(save));
  const rest = listSaves().filter((s) => s.name !== name);
  localStorage.setItem(INDEX_KEY, JSON.stringify([info, ...rest]));
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

export function downloadSave(save: SavedGame, filename: string): void {
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
