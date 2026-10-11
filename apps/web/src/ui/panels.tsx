import { useState, type ReactNode } from "react";
import {
  CLIMATES, designStats, findDesign, getRace, isHostile, maxPopulation, population, relation, travelTurns,
  type Fleet, type Planet, type PlayerView,
} from "@starlord/sim";
import { useGame } from "./hooks";
import { climateName, fmt, words } from "./format";
import { colonizeOption, type ColonizeOption } from "../game/colonize";

/** Painted planet art in public/planets, scaled by planet size. */
export function PlanetIcon({ planet, size }: { planet: Planet; size?: number }) {
  const px = size ?? { tiny: 22, small: 27, medium: 32, large: 37, huge: 42 }[planet.size];
  return <img className="planet-img" src={`planets/${planet.type}.webp`} alt={climateName(planet.type)} width={px} height={px} loading="lazy" />;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function fleetShips(f: Fleet) {
  return f.ships.reduce((n, s) => n + s.count, 0);
}

/** Planets of a star with colonies, plus colonize/invade buttons for the selected fleet. */
export function StarPanel({ starId, fleetId, selectedFleetIds, onSelectFleet, selectedPlanetId, onSelectPlanet, onColonize }: {
  starId: string;
  /** The fleet colonize and invade act with. */
  fleetId: string | null;
  /** Every selected fleet, highlighted in the list; defaults to just `fleetId`. */
  selectedFleetIds?: readonly string[];
  /** `additive` is set on a shift-click, to add the fleet to the selection or take it out. */
  onSelectFleet: (id: string, additive: boolean) => void;
  /** Planet to highlight, e.g. the one picked in the 3D system view. */
  selectedPlanetId?: string | null;
  onSelectPlanet?: (id: string) => void;
  /** Handles Colonize instead of issuing the order directly, e.g. to play the landing first. */
  onColonize?: (planetId: string, settle: ColonizeOption) => void;
}) {
  const { session, view, me, readOnly } = useGame();
  const star = view.galaxy.stars.find((s) => s.id === starId);
  if (!star) return null;
  const explored = me.explored.includes(star.id);
  const race = getRace(me.raceId);
  const fleets = Object.values(view.fleets).filter((f) => f.starId === star.id);
  const fleet = fleetId ? view.fleets[fleetId] : undefined;
  const myFleetHere = fleet && fleet.ownerId === me.id && fleet.starId === star.id ? fleet : undefined;
  const troops = myFleetHere?.ships.reduce((n, s) => {
    const d = findDesign(me, s.designId);
    return n + (d ? designStats(me, d).troops * s.count : 0);
  }, 0) ?? 0;

  return (
    <div className="col">
      <div className="row">
        <h3 style={{ margin: 0 }}>{star.name}</h3>
        <span className="muted">{words(star.color)} star</span>
        {star.special === "orion" && <span className="chip warn">Orion</span>}
        {star.special === "raiderHome" && <span className="chip bad">Raider home</span>}
      </div>
      {!explored && <div className="muted">Unexplored. Send a ship to learn what orbits here.</div>}
      {explored && star.planetIds.length === 0 && <div className="muted">No planets.</div>}
      {explored && star.planetIds.map((pid) => {
        const p = view.planets[pid];
        if (!p) return null;
        const colony = p.colonyId ? view.colonies[p.colonyId] : undefined;
        const owner = colony ? view.players[colony.ownerId] : undefined;
        const habitable = CLIMATES[p.type].habitable;
        // Any of your colony or outpost ships in the system will do; the selected fleet goes first.
        const settle = readOnly ? null : colonizeOption(view, pid, fleetId);
        const canInvade = !readOnly && myFleetHere && colony && troops > 0 && isHostile(view, me.id, colony.ownerId);
        return (
          <div
            className={`planet${pid === selectedPlanetId ? " selected" : ""}${onSelectPlanet ? " pickable" : ""}`}
            key={pid}
            onClick={onSelectPlanet ? (e) => { if (!(e.target as HTMLElement).closest("button")) onSelectPlanet(pid); } : undefined}
          >
            <PlanetIcon planet={p} />
            <div>
              <div>
                {words(p.size)} {climateName(p.type)}
                {p.special !== "none" && <span className="chip warn" style={{ marginLeft: 6 }}>{words(p.special)}</span>}
              </div>
              <small className="muted">
                {words(p.minerals)} minerals, {p.gravity} gravity
                {habitable ? <> · max pop {maxPopulation(p, race, [], me)}</> : !colony && <> · needs an Artificial Planet</>}
              </small>
              {colony && owner && (
                <div>
                  <span className="dot" style={{ background: owner.color, marginRight: 4 }} />
                  {colony.name} <small className="muted">{colony.outpost ? "outpost" : `pop ${population(colony)}`}{owner.id !== me.id ? ` · ${owner.name}` : ""}</small>
                </div>
              )}
            </div>
            <div className="col" style={{ gap: 4 }}>
              {settle && (
                <button
                  className="small primary"
                  disabled={!!settle.blocked}
                  title={settle.blocked ? `Can't settle: ${settle.blocked}.` : `${settle.fleetName} settles this planet when you end the turn.`}
                  onClick={() => (onColonize ? onColonize(pid, settle) : session.issue({ type: "colonize", fleetId: settle.fleetId, planetId: pid }))}
                >
                  {settle.outpost ? "Outpost" : "Colonize"}
                </button>
              )}
              {canInvade && <button className="small danger" onClick={() => session.issue({ type: "invade", fleetId: myFleetHere!.id, colonyId: colony!.id })}>Invade ({troops})</button>}
            </div>
          </div>
        );
      })}
      {fleets.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          <h4>Fleets here</h4>
          {fleets.map((f) => (
            <button key={f.id} className={(selectedFleetIds ?? [fleetId]).includes(f.id) ? "active" : ""} style={{ textAlign: "left" }} onClick={(e) => onSelectFleet(f.id, e.shiftKey)}>
              <span className="dot" style={{ background: view.players[f.ownerId]!.color, marginRight: 6 }} />
              {f.ownerId === me.id ? f.name : view.players[f.ownerId]!.name} <span className="muted">· {plural(fleetShips(f), "ship")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FleetPanel({ fleetId, onSelectFleet }: { fleetId: string; onSelectFleet: (id: string | null) => void }) {
  const { session, view, me, readOnly } = useGame();
  const fleet = view.fleets[fleetId];
  const [split, setSplit] = useState<Record<string, number>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!fleet) return null;
  const owner = view.players[fleet.ownerId]!;
  const mine = owner.id === me.id && !readOnly;
  const dest = fleet.destStarId ? view.galaxy.stars.find((s) => s.id === fleet.destStarId) : undefined;
  const eta = dest ? travelTurns(view, fleet, dest.id) : 0;
  const others = Object.values(view.fleets).filter((f) => f.id !== fleet.id && f.ownerId === fleet.ownerId && f.starId && f.starId === fleet.starId);
  const captain = Object.values(view.leaders).find((l) => l.status === "hired" && l.assignedTo === fleet.id);
  const status = owner.id === me.id ? null : owner.kind !== "empire" ? "hostile" : relation(view, me.id, owner.id).status;
  const splitShips = Object.entries(split).filter(([, n]) => n > 0).map(([designId, count]) => ({ designId, count }));

  return (
    <div className="col">
      <div className="row">
        <span className="dot" style={{ background: owner.color }} />
        {renaming !== null ? (
          <input type="text" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => { if (renaming.trim()) session.issue({ type: "renameFleet", fleetId, name: renaming }); setRenaming(null); }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        ) : (
          <h3 style={{ margin: 0 }} onDoubleClick={() => mine && setRenaming(fleet.name)} title={mine ? "Double-click to rename" : undefined}>
            {owner.id === me.id ? fleet.name : `${owner.name} fleet`}
          </h3>
        )}
        {status && <span className={`chip ${status === "war" || status === "hostile" ? "bad" : ""}`}>{status}</span>}
      </div>
      <div className="muted">
        {fleet.starId ? <>At {view.galaxy.stars.find((s) => s.id === fleet.starId)?.name}</> : "In deep space"}
        {dest && <> · heading to {dest.name}, {eta} turn{eta === 1 ? "" : "s"}</>}
        {captain && <> · Captain {captain.name}</>}
      </div>
      <table>
        <thead><tr><th>Ship</th><th>Count</th><th>Strength</th>{mine && <th>Split</th>}</tr></thead>
        <tbody>
          {fleet.ships.map((s) => {
            const d = findDesign(owner, s.designId);
            const stats = d ? designStats(owner, d) : null;
            return (
              <tr key={s.designId}>
                <td>{d?.name ?? s.designId} <small className="muted">{d && !d.fixed ? words(d.hull) : ""}</small></td>
                <td>{s.count}</td>
                <td>{stats ? fmt(stats.strength) : "?"}</td>
                {mine && (
                  <td>
                    <input type="number" min={0} max={s.count} value={split[s.designId] ?? 0} style={{ width: 52 }}
                      onChange={(e) => setSplit({ ...split, [s.designId]: Math.max(0, Math.min(s.count, Number(e.target.value))) })} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {mine && (
        <>
          <div className="row">
            <span className="muted">Stance</span>
            {(["defend", "attack"] as const).map((st) => (
              <button key={st} className={`small${fleet.stance === st ? " active" : ""}`} onClick={() => session.issue({ type: "setStance", fleetId, stance: st })}>{words(st)}</button>
            ))}
          </div>
          <div className="row">
            <button className="small" disabled={splitShips.length === 0} onClick={() => { session.issue({ type: "splitFleet", fleetId, ships: splitShips }); setSplit({}); }}>Split off</button>
            {others.length > 0 && <button className="small" onClick={() => session.issue({ type: "mergeFleets", fleetIds: [fleet.id, ...others.map((f) => f.id)] })}>Merge all here ({others.length + 1})</button>}
            {dest && fleet.starId && <button className="small" onClick={() => session.issue({ type: "moveFleet", fleetId, destStarId: fleet.starId! })}>Stop</button>}
            <button className="small danger" disabled={splitShips.length !== 1}
              onClick={() => { const s = splitShips[0]!; if (confirm(`Scrap ${s.count} ship(s)?`)) session.issue({ type: "scrapShips", fleetId, designId: s.designId, count: s.count }); setSplit({}); }}>
              Scrap selected
            </button>
          </div>
          <small className="muted">Click a star on the map to send this fleet there. Highlighted stars are within fuel range.</small>
        </>
      )}
      {others.length > 0 && (
        <div className="row">
          {others.map((f) => <button key={f.id} className="small" onClick={() => onSelectFleet(f.id)}>{f.name}</button>)}
        </div>
      )}
    </div>
  );
}

export function Portrait({ raceId, size = 48 }: { raceId: string; size?: number }) {
  const r = getRace(raceId);
  return <img src={`races/${r.assetKey}.webp`} alt={r.name} width={size} height={size} style={{ borderRadius: 6, objectFit: "cover", background: "#000" }} />;
}

export function viewStarOfColony(view: PlayerView, colonyId: string) {
  const c = view.colonies[colonyId];
  const p = c && view.planets[c.planetId];
  return p ? view.galaxy.stars.find((s) => s.id === p.starId) : undefined;
}

const HULL_ORDER = ["frigate", "destroyer", "cruiser", "battleship", "titan", "doomStar"];

/** A ship picture from the 5x5 sprite sheet, chosen by hull with a per-design variant. */
export function ShipSprite({ hull, variantKey, size = 48 }: { hull: string; variantKey: string; size?: number }) {
  let h = 0;
  for (const ch of variantKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const index = (Math.max(0, HULL_ORDER.indexOf(hull)) * 4 + (h % 4)) % 25;
  const col = index % 5;
  const row = Math.floor(index / 5);
  // Zoom in a little so neighbouring sprites don't bleed into the frame.
  const cell = size * 1.15;
  const offset = (cell - size) / 2;
  return (
    <span style={{
      width: size, height: size, display: "inline-block", flex: "none", borderRadius: 6,
      backgroundImage: "url(Ships.png)", backgroundSize: `${cell * 5}px ${cell * 5}px`,
      backgroundPosition: `${-(col * cell + offset)}px ${-(row * cell + offset)}px`,
    }} />
  );
}

const LEADER_PORTRAITS = 24;

/** One of the painted leader portraits, picked by name so a leader always keeps the same face. */
export function LeaderPortrait({ name, size = 84 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = String((h % LEADER_PORTRAITS) + 1).padStart(2, "0");
  return <img src={`leaders/${n}.webp`} alt={name} width={size} height={size} loading="lazy" style={{ borderRadius: 6, objectFit: "cover", background: "#000", display: "block", flex: "none" }} />;
}

/** A large planet for detail views: it floats, glows at the rim and has a small moon circling it. */
export function PlanetOrb({ planet, size = 128, populated = false }: { planet: Planet; size?: number; populated?: boolean }) {
  return (
    <div className={`planet-orb${populated ? " populated" : ""}`} style={{ width: size, height: size, ["--orb" as string]: `${size}px` }}>
      <img src={`planets/${planet.type}.webp`} alt={climateName(planet.type)} width={size} height={size} />
      <span className="orb-shade" />
      <span className="orb-moon"><span /></span>
    </div>
  );
}

/** A circular progress gauge with a glowing arc and a slowly turning outer ring. */
export function ProgressRing({ value, max, size = 120, color = "var(--accent)", children }: {
  value: number; max: number; size?: number; color?: string; children?: ReactNode;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size, height: size, ["--ring" as string]: color }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle className="ring-outer" cx="50" cy="50" r="48" />
        <circle className="ring-track" cx="50" cy="50" r={r} />
        <circle className="ring-fill" cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

/** A race's portrait that comes alive with its video while hovered (or always, with `autoPlay`). */
export function Envoy({ raceId, color, className = "envoy", autoPlay = false }: { raceId: string; color?: string; className?: string; autoPlay?: boolean }) {
  const r = getRace(raceId);
  const [active, setActive] = useState(autoPlay);
  const [ready, setReady] = useState(false);
  return (
    <div className={`${className}${active && ready ? " playing" : ""}`} style={{ ["--envoy" as string]: color }}
      onPointerEnter={() => setActive(true)} onPointerLeave={() => { if (!autoPlay) { setActive(false); setReady(false); } }}>
      <img src={`races/${r.assetKey}.webp`} alt={r.name} />
      {active && (
        <video src={`races/${r.assetKey}.mp4`} autoPlay muted loop playsInline
          onPlaying={() => setReady(true)} onError={() => setActive(false)} />
      )}
    </div>
  );
}
