import {
  FIELD_NAMES, TECHS, TIERS_BY_ID, availableTiers, colonyOutput, hyperLevel, learnsWholeField, researchCost, researchOptions,
  type Colony, type Command,
} from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt } from "../ui/format";
import { Tip } from "../ui/Tip";
import { techTip, tradeGoodsBC, tradeGoodsTip } from "../ui/explain";
import { techSummary } from "../help/articles";

/**
 * Shown before the turn ends when something is probably an accident:
 * research points with no field chosen (they would be lost), or, while the
 * player keeps the alert on for this game, colonies with nothing queued
 * whose industry all goes to Trade Goods. Picking a research field here sets
 * it and ends the turn.
 */
export function EndTurnPrompt({ points, idle, onPick, onEndTurn, onOpenResearch, onOpenColony }: {
  /** Research points that would be lost, or null when a field is chosen. */
  points: number | null;
  /** Colonies making only Trade Goods; empty when the alert is off. */
  idle: Colony[];
  onPick: (cmd: Command) => void;
  onEndTurn: () => void;
  onOpenResearch: () => void;
  onOpenColony: (colonyId: string) => void;
}) {
  const { session, view, me } = useGame();
  const tiers = points === null ? [] : availableTiers(view, me.id).map((id) => TIERS_BY_ID[id]!);
  const title = points !== null && idle.length > 0 ? "Before the turn ends" : points !== null ? "No research chosen" : "Colonies making only Trade Goods";
  return (
    <div className="modal-back" onClick={onEndTurn}>
      <div className="modal research-warning" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {points !== null && (
          <>
            {idle.length > 0 && <h4>No research chosen</h4>}
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
          </>
        )}
        {idle.length > 0 && (
          <>
            {points !== null && <h4 style={{ marginTop: 12 }}>Colonies making only Trade Goods</h4>}
            <p>
              {idle.length === 1 ? "This colony has" : `These ${idle.length} colonies have`} nothing queued, so all industry
              is sold as Trade Goods. Open one to give it something to build:
            </p>
            <div className="col research-prompt-list" style={{ gap: 4 }}>
              {idle.map((c) => {
                const industry = colonyOutput(view, c).industry;
                return (
                  <div key={c.id} className="row">
                    <button className="small" style={{ flex: 1, textAlign: "left" }} onClick={() => onOpenColony(c.id)}>{c.name}</button>
                    <Tip card={() => tradeGoodsTip(c.raceId, industry)}>
                      <span className="muted">{fmt(industry, 1)} industry → +{fmt(tradeGoodsBC(c.raceId, industry))} BC</span>
                    </Tip>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <label className="row" style={{ gap: 6, marginTop: 12 }}
          title="Only for this game. Early on every colony should build something; with many colonies Trade Goods are often fine.">
          <input type="checkbox" checked={!me.idleAlertOff} onChange={(e) => session.issue({ type: "setIdleAlert", on: e.target.checked })} />
          Warn me about colonies making only Trade Goods (this game)
        </label>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          {points !== null
            ? <button onClick={onEndTurn}>End turn and lose {fmt(points, 1)} RP</button>
            : <button className="primary" autoFocus onClick={onEndTurn}>End turn</button>}
          {points !== null && <button className="primary" autoFocus onClick={onOpenResearch}>Open research screen</button>}
        </div>
      </div>
    </div>
  );
}
