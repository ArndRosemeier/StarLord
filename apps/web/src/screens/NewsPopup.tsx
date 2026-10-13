import type { GameEvent } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { starName } from "../ui/format";

type News = Extract<GameEvent, { kind: "random" }>;

/**
 * Galactic News, as in the original: the random events of the turn just
 * ended (flux, plague, comets, monsters, windfalls...) open by themselves as
 * the new turn starts, so none goes unnoticed. Those still in play stay
 * pinned to the galaxy map.
 */
export function NewsPopup({ news, onClose, onShowStar }: { news: News[]; onClose: () => void; onShowStar: (starId: string) => void }) {
  const { view } = useGame();
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <div className="news-masthead">Galactic News<small>Stardate {view.turn - 1}</small></div>
        {news.map((n, i) => (
          <div key={i} className="news-item" style={{ animationDelay: `${0.6 + i * 0.15}s` }}>
            {n.what}
            {n.starId && (
              <> <button className="small" onClick={() => { onClose(); onShowStar(n.starId!); }}>Show {starName(view, n.starId)}</button></>
            )}
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <span className="spacer" />
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
