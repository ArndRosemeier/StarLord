import {
  FIELD_NAMES, TECHS, TIERS_BY_ID, availableTiers, hyperLevel, learnsWholeField, researchCost, researchOptions, type Command,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { Tip } from "../ui/Tip";
import { techTip } from "../ui/explain";
import { techSummary } from "../help/articles";

/**
 * Shown when the turn would end with research points but no field chosen:
 * those points would be lost, which is almost always an accident. Picking a
 * field here sets it and ends the turn.
 */
export function ResearchPrompt({ points, onPick, onSkip, onOpenScreen }: {
  points: number;
  onPick: (cmd: Command) => void;
  onSkip: () => void;
  onOpenScreen: () => void;
}) {
  const { view, me } = useGame();
  const tiers = availableTiers(view, me.id).map((id) => TIERS_BY_ID[id]!);
  return (
    <div className="modal-back" onClick={onSkip}>
      <div className="modal research-warning" role="alertdialog" aria-label="No research chosen" onClick={(e) => e.stopPropagation()}>
        <h3>No research chosen</h3>
        <p>
          Your scientists make <b className="research">{fmt(points, 1)}</b> research points this turn, and with no field
          chosen they are lost. Pick a field and the turn ends:
        </p>
        <div className="col research-prompt-list">
          {tiers.map((t) => {
            const cost = researchCost(me, t);
            const options = researchOptions(me, t);
            const turns = Math.floor(cost / points) + 1;
            return (
              <div key={t.id} className="col" style={{ gap: 4 }}>
                <div className="row">
                  <b>{t.hyper ? `${t.name} ${hyperLevel(me, t.field) + 1}` : t.name}</b>
                  <span className="muted">{FIELD_NAMES[t.field]}, {fmt(cost)} RP, first chance in ~{turns} turn{turns === 1 ? "" : "s"}</span>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {t.hyper || learnsWholeField(me, t) ? (
                    <Tip card={{ title: t.name, text: t.hyper ? ["Improves miniaturization for the whole category."] : options.map((id) => `${TECHS[id]!.name}: ${techSummary(id)}`) }}>
                      <button className="small tech" onClick={() => onPick({ type: "setResearch", tierId: t.id })}>
                        {t.hyper ? "Research" : `All: ${options.map((id) => TECHS[id]!.name).join(", ")}`}
                      </button>
                    </Tip>
                  ) : options.map((id) => (
                    <Tip key={id} card={() => techTip(id)}>
                      <button className="small tech" onClick={() => onPick({ type: "setResearch", tierId: t.id, techId: id })}>
                        {TECHS[id]!.name}{me.techs.includes(id) ? " (known)" : ""}
                      </button>
                    </Tip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onSkip}>End turn and lose {fmt(points, 1)} RP</button>
          <button className="primary" autoFocus onClick={onOpenScreen}>Open research screen</button>
        </div>
      </div>
    </div>
  );
}
