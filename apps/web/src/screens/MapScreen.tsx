import { useEffect, useMemo, useRef, useState } from "react";
import { PixiMapRenderer } from "../map/pixiRenderer";
import type { MapRenderer } from "../map/renderer";
import { buildScene, routeTo } from "../map/scene";
import { useGame } from "../ui/hooks";
import { FleetPanel, StarPanel, fleetShips, plural } from "../ui/panels";
import { SystemView } from "./system/SystemView";

export function MapScreen({ focusStar, onFocused }: { focusStar: string | null; onFocused: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [starId, setStarId] = useState<string | null>(focusStar ?? me.homeStarId);
  const [fleetId, setFleetId] = useState<string | null>(null);
  /** Star shown up close in the 3D system view, if open. */
  const [systemStar, setSystemStar] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad: boolean; at: number } | null>(null);
  // The renderer calls back with the latest selection, so keep it in a ref.
  const sel = useRef({ fleetId, readOnly });
  sel.current = { fleetId, readOnly };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.bad ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFleetId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const r = new PixiMapRenderer();
    renderer.current = r;
    void r.mount(host.current!, {
      onStar(id, action) {
        const view = session.view;
        const f = sel.current.fleetId ? view.fleets[sel.current.fleetId] : undefined;
        const canOrder = f && f.ownerId === session.viewer && !session.spectator && !sel.current.readOnly;
        // With one of your fleets selected, any click on another star sends it there. Clicking
        // the star an idle fleet sits at selects that star instead; for a moving fleet it cancels the move.
        if (canOrder && (action === "order" || id !== f.starId || f.destStarId)) {
          const star = view.galaxy.stars.find((s) => s.id === id)!;
          const route = routeTo(view, f, id);
          if (!route.ok) {
            setNotice({ text: route.reason, bad: true, at: Date.now() });
            return;
          }
          session.issue({ type: "moveFleet", fleetId: f.id, destStarId: id });
          const text = id === f.starId
            ? `${f.name} will stay at ${star.name}.`
            : `${f.name} heading to ${star.name}, arriving in ${route.turns} turn${route.turns === 1 ? "" : "s"}. Orders take effect when you end the turn.`;
          setNotice({ text, bad: false, at: Date.now() });
          return;
        }
        setStarId(id);
        setFleetId(null);
        // A plain click with no fleet to order opens the system up close.
        if (action === "select") setSystemStar(id);
      },
      onFleet(id) {
        setFleetId(id);
        const f = session.view.fleets[id];
        if (f?.starId) setStarId(f.starId);
      },
      onBackground() {
        setFleetId(null);
      },
    });
    return () => r.destroy();
  }, [session]);

  const scene = useMemo(
    () => buildScene(view, starId, fleetId, !readOnly),
    [view, starId, fleetId, readOnly],
  );

  useEffect(() => {
    renderer.current?.render(scene);
  }, [scene]);

  useEffect(() => {
    if (!focusStar) return;
    const s = view.galaxy.stars.find((x) => x.id === focusStar);
    if (s) {
      setStarId(s.id);
      // Wait a frame so the renderer has sized itself.
      requestAnimationFrame(() => renderer.current?.focus(s.x, s.y));
    }
    onFocused();
  }, [focusStar]);

  // A fleet that vanished (merged, destroyed) drops the selection.
  useEffect(() => {
    if (fleetId && !view.fleets[fleetId]) setFleetId(null);
  }, [view, fleetId]);

  const selectedFleet = fleetId ? view.fleets[fleetId] : undefined;
  const orderingFleet = selectedFleet && selectedFleet.ownerId === me.id && !readOnly ? selectedFleet : undefined;

  return (
    <div className="map-layout">
      <div className="map-host" ref={host}>
        {orderingFleet ? (
          <div className="map-banner">
            Click a star to send <b>{orderingFleet.name}</b> there. Highlighted stars are in range. Esc or click empty space to deselect.
          </div>
        ) : (
          <div className="map-hint">Drag to pan · wheel to zoom · click a star to view its system · click a fleet, then a star to send it there</div>
        )}
        {notice && <div key={notice.at} className={`map-notice${notice.bad ? " bad" : ""}`}>{notice.text}</div>}
      </div>
      <aside className="side">
        {fleetId && <div className="panel"><FleetPanel fleetId={fleetId} onSelectFleet={setFleetId} /></div>}
        {starId && <div className="panel"><StarPanel starId={starId} fleetId={fleetId} onSelectFleet={setFleetId} /></div>}
        {!readOnly && session.rejected.length > 0 && (
          <div className="panel bad">Some orders are invalid: {session.rejected.join("; ")}</div>
        )}
        {systemStar && (
          <SystemView
            starId={systemStar}
            fleetId={fleetId}
            onClose={() => setSystemStar(null)}
            onSelectFleet={(id) => {
              setFleetId(id);
              setSystemStar(null);
            }}
          />
        )}
        <MyFleetsList onSelect={(id) => { setFleetId(id); const f = view.fleets[id]; if (f?.starId) setStarId(f.starId); }} selected={fleetId} />
      </aside>
    </div>
  );
}

function MyFleetsList({ onSelect, selected }: { onSelect: (id: string) => void; selected: string | null }) {
  const { view, me } = useGame();
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const idle = fleets.filter((f) => f.starId && !f.destStarId);
  return (
    <div className="panel col" style={{ gap: 4 }}>
      <h4>Your fleets ({fleets.length}, {idle.length} idle)</h4>
      {fleets.map((f) => (
        <button key={f.id} className={`small${f.id === selected ? " active" : ""}`} style={{ textAlign: "left" }} onClick={() => onSelect(f.id)}>
          {f.name} <span className="muted">· {plural(fleetShips(f), "ship")} · {f.destStarId ? `→ ${view.galaxy.stars.find((s) => s.id === f.destStarId)?.name}` : view.galaxy.stars.find((s) => s.id === f.starId)?.name}</span>
        </button>
      ))}
    </div>
  );
}
