import { CLIMATES, findDesign, settlerModule, validateCommand, type PlayerView } from "@starlord/sim";

/** How the viewer could settle a planet right now: which fleet would do it and whether it makes a colony or an outpost. */
export interface ColonizeOption {
  fleetId: string;
  fleetName: string;
  /** The planet would get an outpost rather than a colony: only an outpost ship is at hand, or the body is an asteroid belt or gas giant. */
  outpost: boolean;
  /** Why the order would be refused (e.g. hostile guards), or null when it can be given. */
  blocked: string | null;
}

/** The colonize order for a settle option, naming the ship kind so a mixed fleet lands the right one. */
export function colonizeCommand(planetId: string, settle: ColonizeOption) {
  return { type: "colonize" as const, fleetId: settle.fleetId, planetId, module: settle.outpost ? "outpost" as const : "colony" as const };
}

/**
 * The viewer's best way to colonize `planetId` with a colony or outpost ship already at its star,
 * preferring `preferFleetId` and colony ships over outpost ships. Asteroid belts and gas giants
 * only take outposts. Null when the planet is taken or no ship there can settle it.
 */
export function colonizeOption(view: PlayerView, planetId: string, preferFleetId?: string | null): ColonizeOption | null {
  const planet = view.planets[planetId];
  if (!planet || planet.colonyId) return null;
  const me = view.players[view.viewer]!;
  const options: ColonizeOption[] = [];
  for (const f of Object.values(view.fleets)) {
    if (f.ownerId !== view.viewer || f.starId !== planet.starId) continue;
    const modules = new Set(f.ships.filter((s) => s.count > 0).map((s) => findDesign(me, s.designId)?.module));
    if (!modules.has("colony") && !modules.has("outpost")) continue;
    const module = settlerModule(view, view.viewer, f, planetId);
    // A fleet with only colony ships can't do anything with an asteroid belt or gas giant.
    if (!module && !CLIMATES[planet.type].habitable) continue;
    const outpost = module ? module === "outpost" : !modules.has("colony");
    const check = validateCommand(view, view.viewer, { type: "colonize", fleetId: f.id, planetId, module: outpost ? "outpost" : "colony" });
    options.push({ fleetId: f.id, fleetName: f.name, outpost, blocked: check.ok ? null : check.reason });
  }
  const rank = (o: ColonizeOption) => (o.fleetId === preferFleetId ? 0 : 2) + (o.outpost ? 1 : 0) + (o.blocked ? 4 : 0);
  return options.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
