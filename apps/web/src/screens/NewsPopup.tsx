import type { GameEvent } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { starName } from "../ui/format";
import { fallDetails, fallHeadline, type FallNews } from "../ui/galacticNews";
import { Envoy } from "../ui/panels";

type RandomNews = Extract<GameEvent, { kind: "random" }>;
export type News = RandomNews | FallNews;

/** The turn's news worth a popup: an empire's end (destroyed or surrendered) first, then the random events. */
export function newsOf(events: GameEvent[]): News[] {
  const falls = events.flatMap((e) => (e.kind === "empireFell" ? [e] : []));
  const random = events.flatMap((e) => (e.kind === "random" ? [e] : []));
  return [...falls, ...random];
}

/**
 * Galactic News, as in the original: the random events of the turn just
 * ended (flux, plague, comets, monsters, windfalls...) open by themselves as
 * the new turn starts, so none goes unnoticed. Those still in play stay
 * pinned to the galaxy map. An empire destroyed or surrendering makes the
 * front page: a big headline with its ruler's portrait and what it means.
 */
export function NewsPopup({ news, onClose, onShowStar }: { news: News[]; onClose: () => void; onShowStar: (starId: string) => void }) {
  const { view } = useGame();
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <div className="news-masthead">Galactic News<small>Stardate {view.turn - 1}</small></div>
        {news.map((n, i) => n.kind === "empireFell" ? <FrontPage key={i} news={n} delay={0.6 + i * 0.15} /> : (
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

function FrontPage({ news, delay }: { news: FallNews; delay: number }) {
  const { view } = useGame();
  const fallen = view.players[news.fallen];
  const to = news.to !== undefined ? view.players[news.to] : undefined;
  return (
    <div className={`news-item news-front ${news.how}`} style={{ animationDelay: `${delay}s` }}>
      <div className="news-front-kicker">{news.how === "destroyed" ? "Empire destroyed" : "Empire surrenders"}</div>
      <div className="news-front-faces">
        {fallen && <Envoy raceId={fallen.raceId} color={fallen.color} className="news-front-envoy fallen" autoPlay once />}
        {to && <><span className="news-front-arrow" aria-hidden>{"➜"}</span><Envoy raceId={to.raceId} color={to.color} className="news-front-envoy" autoPlay once /></>}
      </div>
      <div className="news-front-headline">{fallHeadline(view, news)}</div>
      {fallDetails(view, news).map((line, i) => <div key={i} className="news-front-detail">{line}</div>)}
    </div>
  );
}
