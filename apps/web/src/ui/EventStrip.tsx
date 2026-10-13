import { ongoingEvents } from "@starlord/sim";
import { useGame } from "./hooks";
import { Tip } from "./Tip";

/**
 * The random events in play that concern the player, pinned to the top left
 * of the galaxy map for as long as they last, each with what it does and when
 * it ends. Click one at a system to go there.
 */
export function EventStrip({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { view } = useGame();
  const events = ongoingEvents(view, view.viewer);
  if (events.length === 0) return null;
  return (
    <div className="event-strip" role="status" aria-label="Events in play">
      {events.map((e) => (
        <Tip key={e.id} card={{ title: e.title, kind: e.mood === "good" ? "Good event" : "Event in play", text: [e.effect], note: `Ends: ${e.ends}.` }}>
          <div className={`event-chip ${e.mood}${e.kind === "hyperspaceFlux" ? " galaxy" : ""}${e.starId ? " clickable" : ""}`}
            onClick={() => e.starId && onShowStar(e.starId)}>
            <div className="event-chip-title">{e.mood === "good" ? "✦" : "⚠"} {e.title}</div>
            <div className="event-chip-effect">{e.effect}</div>
            <div className="event-chip-ends">Ends: {e.ends}</div>
          </div>
        </Tip>
      ))}
    </div>
  );
}
