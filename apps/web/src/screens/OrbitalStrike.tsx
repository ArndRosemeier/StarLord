import {
  BOMB_DAMAGE_PER_HIT, SPORE_KILL_CHANCE_PER_POINT, type OrbitalChoice, type OrbitalOption, type OrbitalPrompt, type PlayerView,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, playerName, starName } from "../ui/format";

const LABELS: Record<OrbitalChoice, string> = {
  bomb: "Bombard",
  bio: "Bombard with biological weapons",
  destroy: "Destroy the planet",
  none: "Hold fire",
};

/** What the outrage costs, with the real range for each computer empire that would hear of it. */
export function outrageText(view: PlayerView, prompt: OrbitalPrompt): string {
  const { roll, empires } = prompt.outrage;
  if (empires.length === 0) return `Diplomatic penalty: relations with every computer empire in contact fall by 1 to ${roll}, but none would feel it now (those at war with you only lose patience).`;
  const each = empires.map((e) => `${playerName(view, e.playerId)} ${e.from === e.to ? fmt(e.from) : `${fmt(e.from)} to ${fmt(e.to)}`}`).join(", ");
  return `Diplomatic penalty: every computer empire in contact and not at war with you is appalled: ${each} relations.`;
}

/** One line on what a choice does, with the expected numbers the sim gives for it. */
export function optionText(view: PlayerView, prompt: OrbitalPrompt, o: OrbitalOption): string {
  const losses = `about ${fmt(o.popKilled, 1)} of ${fmt(prompt.population)} colonists and ${fmt(o.buildingsLost, 1)} of ${fmt(prompt.buildings)} buildings`;
  switch (o.choice) {
    case "bomb":
      return `Every weapon in orbit fires at the colony; each ${BOMB_DAMAGE_PER_HIT} damage past the planetary shield (${fmt(prompt.shield)} off every shot) is a hit on a building, a trained unit or a colonist. Expected: ${fmt(o.hits, 1)} hits, ${losses}. No diplomatic penalty.`;
    case "bio":
      return `Bombard as above and release biological weapons: each launch has a ${Math.round(SPORE_KILL_CHANCE_PER_POINT * 100)}% chance per point of damage to kill a colonist (less against Microbiotics and Universal Antidote). Expected: ${losses}. ${outrageText(view, prompt)}`;
    case "destroy":
      return `A Stellar Converter fired from orbit turns the planet into an asteroid belt: all ${fmt(prompt.population)} colonists and ${fmt(o.buildingsLost)} buildings are lost, and so is any special of the planet. ${outrageText(view, prompt)}`;
    case "none":
      return "Your fleets stay in orbit and leave the colony be this turn.";
  }
}

/**
 * The original's Orbital Combat Selection: the player's fleets hold orbit over
 * an enemy colony after the battles, and the turn waits on what they do to it.
 * Invading is ordered beforehand (Fleets screen); a fleet set to invade lands
 * its troops instead.
 */
export function OrbitalStrike({ prompt }: { prompt: OrbitalPrompt }) {
  const { session, view } = useGame();
  const owner = view.players[prompt.ownerId];
  const t = prompt.troops;
  return (
    <div className="modal-back">
      <div className="modal orbital-strike" role="alertdialog" aria-label={`Orbit of ${prompt.colonyName}`}>
        <h3>
          Orbit of <span style={{ color: owner?.color }}>{prompt.colonyName}</span> at {starName(view, prompt.starId)}
        </h3>
        <p className="muted">
          Your fleets hold orbit over this {owner?.name ?? "enemy"} colony. Choose what they do to it this turn.
        </p>
        <div className="row wrap orbital-facts">
          <span title="Colonists living there now">{fmt(prompt.population)} colonists</span>
          <span title="Buildings bombs can hit (defenses and the capitol can't be hit)">{fmt(prompt.buildings)} buildings</span>
          <span title="Ground forces defending the colony">{fmt(t.militia)} militia, {fmt(t.marines)} marines, {fmt(t.armor)} tanks</span>
          <span title="Damage the planetary shield takes off every shot">shield {fmt(prompt.shield)}</span>
          {prompt.barrier && <span title="A Planetary Barrier Shield keeps troops and biological weapons out">barrier shield</span>}
        </div>
        <div className="col orbital-options">
          {prompt.options.map((o) => (
            <div key={o.choice} className={`orbital-option${o.available ? "" : " faded"}`}>
              <button className={o.choice === "none" ? "" : o.outrage ? "danger" : "primary"} disabled={!o.available}
                title={o.available ? optionText(view, prompt, o) : `Not possible: ${o.why}`} onClick={() => session.finishOrbital(o.choice)}>
                {LABELS[o.choice]}
              </button>
              <span className="muted">{o.available ? optionText(view, prompt, o) : `Not possible: ${o.why}.`}</span>
            </div>
          ))}
        </div>
        <p className="muted small">To take the colony instead, order a fleet with troop ships to invade it (Fleets screen) before ending the turn.</p>
      </div>
    </div>
  );
}
