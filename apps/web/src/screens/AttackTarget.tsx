import { HULLS_BY_ID, type TargetOption, type TargetPrompt } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, starName } from "../ui/format";

/** What defends the colony, in the sim's numbers. */
function defenseText(o: TargetOption): string {
  const parts: string[] = [];
  if (o.station) parts.push(HULLS_BY_ID[o.station].name);
  if (o.installations > 0) parts.push(`${o.installations} ground defense${o.installations === 1 ? "" : "s"}`);
  if (o.mines) parts.push("mines");
  if (parts.length === 0) return "Nothing on it fires back: no battle is needed unless enemy ships defend it.";
  return `${parts.join(", ")}, combat strength ${fmt(o.defense)}. The battle is fought over this planet.`;
}

function takeText(o: TargetOption): string {
  const t = o.troops;
  const ground = `${fmt(t.militia)} militia, ${fmt(t.marines)} marines, ${fmt(t.armor)} tanks`;
  const parts = [o.outpost ? "Outpost" : `${fmt(o.population)} colonists`, ground];
  if (o.shield > 0) parts.push(`shield ${fmt(o.shield)} off every shot and bomb`);
  if (o.barrier) parts.push("barrier shield keeps troops and biological weapons out");
  if (o.mindControl !== undefined) parts.push(o.mindControl === null ? "mind control possible once its orbit is won" : `no mind control: ${o.mindControl}`);
  return parts.join(" · ");
}

/**
 * Combat has planet scale, as in the original: when the player's fleets at a
 * star could attack more than one enemy planet, the turn waits on which one.
 * Every fleet of theirs in the system joins the battle over it, and bombing,
 * invasion or mind control afterwards strike only that planet this turn.
 */
export function AttackTarget({ prompt }: { prompt: TargetPrompt }) {
  const { session, view } = useGame();
  return (
    <div className="modal-back">
      <div className="modal orbital-strike" role="alertdialog" aria-label={`Attack at ${starName(view, prompt.starId)}`}>
        <h3>Which planet do you attack at {starName(view, prompt.starId)}?</h3>
        <p className="muted">
          A battle is fought over one planet. All your fleets in the system join it, and after it you can bombard, invade
          or take only that planet this turn. The others wait for a battle of their own on a later turn.
        </p>
        <div className="col orbital-options">
          {prompt.options.map((o) => {
            const owner = view.players[o.ownerId];
            return (
              <div key={o.colonyId} className="orbital-option">
                <button className={o.defense > 0 ? "danger" : "primary"} title={`${defenseText(o)} ${takeText(o)}`} onClick={() => session.finishTarget(o.colonyId)}>
                  Attack <span style={{ color: owner?.color }}>{o.colonyName}</span>
                </button>
                <span className="muted">
                  {owner?.name ?? "Enemy"}. {defenseText(o)}<br />{takeText(o)}.
                </span>
              </div>
            );
          })}
          <div className="orbital-option">
            <button onClick={() => session.skipTarget()}>Attack nothing</button>
            <span className="muted">Your fleets here switch to Defend: they fight only enemy ships that attack them and fire on no planet this turn.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
