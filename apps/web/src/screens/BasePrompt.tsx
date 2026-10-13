import {
  ARTIFICIAL_PLANET, BASE_SCRAP_REFUND, PROJECTS_BY_ID, baseTargets, getRace, itemCost, maxPopulation, suggestedBaseTarget,
  type Colony, type Planet,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { climateName, fmt, words } from "../ui/format";
import { PlanetOrb } from "../ui/panels";

/** What putting a finished base on a planet will do there, with the sim's numbers. */
function outcome(projectId: string, planet: Planet, maxPop: number): string {
  if (projectId === "colonyBase") return `New colony with 1 pop, room for ${maxPop}`;
  if (planet.type === "asteroids" || planet.type === "gasGiant") {
    return `Becomes a ${ARTIFICIAL_PLANET[planet.type]} ${climateName(ARTIFICIAL_PLANET.type)} planet, ${ARTIFICIAL_PLANET.minerals} minerals`;
  }
  return "";
}

/**
 * The planet choices for every finished Colony Base or
 * Artificial Planet waiting at one colony. Picking a planet places it at once.
 */
export function BaseChoices({ colony, onPlaced }: { colony: Colony; onPlaced?: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const race = getRace(me.raceId);
  return (
    <>
      {(colony.readyBases ?? []).map((id, i) => {
        const free = baseTargets(view, colony, id);
        const best = suggestedBaseTarget(view, colony, id);
        const refund = Math.floor(itemCost(view, me.id, { kind: "project", id }, colony) * BASE_SCRAP_REFUND);
        return (
          <div key={`${id}:${i}`} className="col" style={{ gap: 6 }}>
            <div>
              <b>{colony.name}: {PROJECTS_BY_ID[id]?.name ?? id} ready.</b>{" "}
              <span className="muted">Choose the planet it goes to. It waits until you do; if every planet is taken first, it is scrapped for {fmt(refund)} BC.</span>
            </div>
            <div className="base-choices">
              {free.map((p) => {
                const maxPop = maxPopulation(p, race, [], me);
                return (
                  <button key={p.id} className={`base-choice${p.id === best?.id ? " primary" : ""}`} disabled={readOnly}
                    onClick={() => { session.issue({ type: "placeBase", colonyId: colony.id, projectId: id, planetId: p.id }); onPlaced?.(); }}>
                    <PlanetOrb planet={p} size={56} />
                    <span className="col" style={{ gap: 2, textAlign: "left" }}>
                      <b>{words(p.size)} {climateName(p.type)}{p.id === best?.id ? " (recommended)" : ""}</b>
                      <small className="muted">{words(p.minerals)} minerals, {p.gravity} gravity{p.special && p.special !== "none" ? `, ${words(p.special)}` : ""}</small>
                      <small>{outcome(id, p, maxPop)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Own colonies with a finished base waiting for a planet. */
export function coloniesWithReadyBases(colonies: Record<string, Colony>, ownerId: number): Colony[] {
  return Object.values(colonies).filter((c) => c.ownerId === ownerId && (c.readyBases?.length ?? 0) > 0);
}

/** Asks where finished bases go, like MoO2 does when one is built. */
export function BasePrompt({ onClose }: { onClose: () => void }) {
  const { view, me } = useGame();
  const waiting = coloniesWithReadyBases(view.colonies, me.id);
  if (waiting.length === 0) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal research-warning" role="alertdialog" aria-label="Choose a planet" onClick={(e) => e.stopPropagation()}>
        <h3>Choose a planet</h3>
        <div className="col research-prompt-list">
          {waiting.map((c) => <BaseChoices key={c.id} colony={c} />)}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose}>Decide later</button>
        </div>
      </div>
    </div>
  );
}
