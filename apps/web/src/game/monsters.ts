import { MONSTER_DESIGNS, PASSIVE_MONSTERS, elderId, type Fleet } from "@starlord/sim";

/** The monster kinds that have their own look; elders share their kind's. */
export type MonsterSpecies = "voidAmoeba" | "latticeCrystal" | "starWyrm" | "ionEel" | "starHydra" | "guardian";
const SPECIES: MonsterSpecies[] = ["voidAmoeba", "latticeCrystal", "starWyrm", "ionEel", "starHydra", "guardian"];

/** Which kind a monster design is, or null for a design that isn't a monster. */
export function monsterSpecies(designId: string | undefined): MonsterSpecies | null {
  if (!designId) return null;
  return SPECIES.find((s) => designId === s || designId === elderId(s)) ?? null;
}

/** The fleet's lead monster design: the one with the most hit points. */
export function leadMonster(fleet: Pick<Fleet, "ships">): string | undefined {
  let best: { id: string; hits: number } | undefined;
  for (const s of fleet.ships) {
    const hits = MONSTER_DESIGNS.find((d) => d.id === s.designId)?.fixed?.hits ?? 0;
    if (!best || hits > best.hits) best = { id: s.designId, hits };
  }
  return best?.id;
}

/** The monster's name as the sim knows it ("Ion Eel"), or a plain fallback. */
export function monsterName(designId: string | undefined): string {
  return MONSTER_DESIGNS.find((d) => d.id === designId)?.name ?? "Monster";
}

/** Whether a monster starts fights, in the sim's own terms. */
export function monsterBehavior(designId: string | undefined): string {
  return designId && PASSIVE_MONSTERS.includes(designId)
    ? "Never attacks first; fights back if you attack it"
    : "Attacks every ship that enters its system";
}

/** Each kind's colours: body, glow and a light highlight, as hex numbers. */
export const MONSTER_COLORS: Record<MonsterSpecies | "generic", { body: number; glow: number; light: number }> = {
  voidAmoeba: { body: 0x2f8f5a, glow: 0x7dff9a, light: 0xd8ffe0 },
  latticeCrystal: { body: 0x5fa8d8, glow: 0x9be8ff, light: 0xeafcff },
  starWyrm: { body: 0x8a2a12, glow: 0xff7a1a, light: 0xffe0a0 },
  ionEel: { body: 0x1b3a6b, glow: 0x4fd8ff, light: 0xfff27a },
  starHydra: { body: 0x3d5a1a, glow: 0xb8ff3d, light: 0xf0ffd0 },
  guardian: { body: 0x8a7a50, glow: 0xffd75a, light: 0xfff6d8 },
  generic: { body: 0x5a1630, glow: 0xff3d6a, light: 0xffe0e0 },
};
