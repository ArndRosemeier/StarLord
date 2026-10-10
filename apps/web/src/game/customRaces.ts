import { buildCustomRace, validateCustomRace, type CustomRaceSpec, type RaceDef } from "@starlord/sim";

/** Player-built races kept in this browser. */

const KEY = "starlord.customRaces";

export function loadCustomRaces(): CustomRaceSpec[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CustomRaceSpec[];
    return list.filter((s) => validateCustomRace(s) === null);
  } catch {
    return [];
  }
}

export function saveCustomRaces(list: CustomRaceSpec[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the race still works for this session.
  }
}

export function customRaceDefs(list: CustomRaceSpec[]): { spec: CustomRaceSpec; def: RaceDef }[] {
  return list.map((spec) => ({ spec, def: buildCustomRace(spec) }));
}
