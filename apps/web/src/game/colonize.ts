import { CLIMATES, findDesign, validateCommand, type PlayerView } from "@starlord/sim";

/** How the viewer could settle a planet right now: which fleet would do it and whether it makes a colony or an outpost. */
export interface ColonizeOption {
  fleetId: string;
  fleetName: string;
  /** Only an outpost ship is at hand, so the planet would get an outpost rather than a colony. */
  outpost: boolean;
  /** Why the order would be refused (e.g. hostile guards), or null when it can be given. */
  blocked: string | null;
}

/**
 * The viewer's best way to colonize `planetId` with a colony or outpost ship already at its star,
 * preferring `preferFleetId` and colony ships over outpost ships. Null when the planet is taken,
 * cannot be settled, or no such ship is there.
 */
export function colonizeOption(view: PlayerView, planetId: string, preferFleetId?: string | null): ColonizeOption | null {
  const planet = view.planets[planetId];
  if (!planet || planet.colonyId || !CLIMATES[planet.type].habitable) return null;
  const me = view.players[view.viewer]!;
  const options: ColonizeOption[] = [];
  for (const f of Object.values(view.fleets)) {
    if (f.ownerId !== view.viewer || f.starId !== planet.starId) continue;
    const modules = new Set(f.ships.filter((s) => s.count > 0).map((s) => findDesign(me, s.designId)?.module));
    if (!modules.has("colony") && !modules.has("outpost")) continue;
    const check = validateCommand(view, view.viewer, { type: "colonize", fleetId: f.id, planetId });
    options.push({ fleetId: f.id, fleetName: f.name, outpost: !modules.has("colony"), blocked: check.ok ? null : check.reason });
  }
  const rank = (o: ColonizeOption) => (o.fleetId === preferFleetId ? 0 : 2) + (o.outpost ? 1 : 0) + (o.blocked ? 4 : 0);
  return options.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
