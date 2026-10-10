import { useEffect, useMemo, useRef, useState } from "react";
import { canReach } from "@starlord/sim";
import { PixiMapRenderer } from "../map/pixiRenderer";
import type { MapRenderer } from "../map/renderer";
import { buildScene } from "../map/scene";
import { useGame } from "../ui/hooks";
import { FleetPanel, StarPanel, fleetShips, plural } from "../ui/panels";

export function MapScreen({ focusStar, onFocused }: { focusStar: string | null; onFocused: () => void }) {
  const { session, view, me, readOnly } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [starId, setStarId] = useState<string | null>(focusStar ?? me.homeStarId);
  const [fleetId, setFleetId] = useState<string | null>(null);
  // The renderer calls back with the latest selection, so keep it in a ref.
  const sel = useRef({ fleetId });
  sel.current = { fleetId };

  useEffect(() => {
    const r = new PixiMapRenderer();
    renderer.current = r;
    void r.mount(host.current!, {
      onStar(id, action) {
        const f = sel.current.fleetId ? session.view.fleets[sel.current.fleetId] : undefined;
        if (action === "order" && f && f.ownerId === session.viewer && !session.spectator) {
          session.issue({ type: "moveFleet", fleetId: f.id, destStarId: id });
          return;
        }
        setStarId(id);
        setFleetId(null);
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
    () => buildScene(view, starId, fleetId, readOnly ? undefined : (f, s) => canReach(view, me.id, f, s)),
    [view, starId, fleetId, readOnly, me.id],
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

  return (
    <div className="map-layout">
      <div className="map-host" ref={host}>
        <div className="map-hint">Drag to pan · wheel to zoom · click to select · right-click a star to move the selected fleet</div>
      </div>
      <aside className="side">
        {fleetId && <div className="panel"><FleetPanel fleetId={fleetId} onSelectFleet={setFleetId} /></div>}
        {starId && <div className="panel"><StarPanel starId={starId} fleetId={fleetId} onSelectFleet={setFleetId} /></div>}
        {!readOnly && session.rejected.length > 0 && (
          <div className="panel bad">Some orders are invalid: {session.rejected.join("; ")}</div>
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
