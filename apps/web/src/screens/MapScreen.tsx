import { useEffect, useMemo, useRef, useState } from "react";
import { isTradeGoodsOnly, type Fleet } from "@starlord/sim";
import { PixiMapRenderer } from "../map/pixiRenderer";
import type { MapRenderer } from "../map/renderer";
import { buildScene, routeTo, toggleFleetSelection } from "../map/scene";
import { useGame } from "../ui/hooks";
import { FleetPanel, StarPanel, fleetShips, plural } from "../ui/panels";
import { SystemView } from "./system/SystemView";
import type { ColonizeOption } from "../game/colonize";
import { additive, isTouchDevice, useMultiSelect } from "../ui/touch";
import { LastTurnPanel } from "../ui/LastTurnPanel";

export function MapScreen({ focusStar, onFocused, onOpenColony, onOpenResearch, onOpenReports }: {
  focusStar: string | null;
  onFocused: () => void;
  onOpenColony: (colonyId: string) => void;
  onOpenResearch: () => void;
  onOpenReports: () => void;
}) {
  const { session, view, me, readOnly } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<MapRenderer | null>(null);
  const [starId, setStarId] = useState<string | null>(focusStar ?? me.homeStarId);
  /** Selected fleets, in the order they were picked; the last one is shown in detail. */
  const [fleetIds, setFleetIds] = useState<string[]>([]);
  const fleetId = fleetIds.at(-1) ?? null;
  const setFleetId = (id: string | null) => setFleetIds(id ? [id] : []);
  /** Star shown up close in the 3D system view, if open. */
  const [systemStar, setSystemStar] = useState<string | null>(null);
  /** Colonize pressed in the side panel: the system view opens and plays the landing. */
  const [colonizeOnOpen, setColonizeOnOpen] = useState<{ planetId: string; settle: ColonizeOption } | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad: boolean; at: number } | null>(null);
  const touch = useMemo(isTouchDevice, []);
  const [several, setSeveral] = useMultiSelect();
  // The "select several" switch belongs to the map; leaving it turns it off.
  useEffect(() => () => setSeveral(false), []);
  // The renderer calls back with the latest selection, so keep it in a ref.
  const sel = useRef({ fleetIds, readOnly });
  sel.current = { fleetIds, readOnly };
  /** A plain click selects one fleet; a shift-click adds it to the selection or takes it out. */
  const pickFleet = (id: string, additive: boolean) => {
    const next = toggleFleetSelection(session.view, sel.current.fleetIds, id, additive);
    setFleetIds(next);
    const f = session.view.fleets[next.at(-1) ?? ""];
    if (f?.starId && next.includes(id)) setStarId(f.starId);
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.bad ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFleetIds([]);
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
        const mine = sel.current.fleetIds
          .map((fid) => view.fleets[fid])
          .filter((f): f is Fleet => !!f && f.ownerId === session.viewer);
        const canOrder = mine.length > 0 && !session.spectator && !sel.current.readOnly;
        // With your fleets selected, any click on another star sends them there. Clicking the star
        // idle fleets sit at selects that star instead; for a moving fleet it cancels the move.
        if (canOrder && (action === "order" || mine.some((f) => id !== f.starId || f.destStarId))) {
          const star = view.galaxy.stars.find((s) => s.id === id)!;
          // Idle fleets already there simply stay.
          const going = action === "order" ? mine : mine.filter((f) => id !== f.starId || f.destStarId);
          const routes = going.map((f) => ({ f, route: routeTo(view, f, id) }));
          const ok = routes.filter((r) => r.route.ok);
          const failed = routes.filter((r) => !r.route.ok);
          if (ok.length === 0) {
            const r = failed[0]!.route;
            setNotice({ text: r.ok ? "" : r.reason, bad: true, at: Date.now() });
            return;
          }
          for (const { f } of ok) session.issue({ type: "moveFleet", fleetId: f.id, destStarId: id });
          const most = Math.max(...ok.map((r) => (r.route.ok ? r.route.turns : 0)));
          const only = ok.length === 1 ? ok[0]!.f : null;
          let text = only && id === only.starId
            ? `${only.name} will stay at ${star.name}.`
            : `${only ? only.name : `${ok.length} fleets`} heading to ${star.name}, ${only ? "arriving" : "all there"} in ${most} turn${most === 1 ? "" : "s"}. Orders take effect when you end the turn.`;
          if (failed.length > 0) {
            text += ` ${failed.map((r) => r.f.name).join(", ")} cannot reach it.`;
          }
          setNotice({ text, bad: failed.length > 0, at: Date.now() });
          return;
        }
        setStarId(id);
        setFleetIds([]);
        // A plain click with no fleet to order opens the system up close.
        if (action === "select") {
          setColonizeOnOpen(null);
          setSystemStar(id);
        }
      },
      onFleet(id, additive) {
        pickFleet(id, additive);
      },
      onBackground() {
        setFleetIds([]);
      },
    });
    return () => r.destroy();
  }, [session]);

  const scene = useMemo(
    () => buildScene(view, starId, fleetIds, !readOnly),
    [view, starId, fleetIds, readOnly],
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

  // Fleets that vanished (merged, destroyed) drop out of the selection.
  useEffect(() => {
    if (fleetIds.some((id) => !view.fleets[id])) setFleetIds(fleetIds.filter((id) => view.fleets[id]));
  }, [view, fleetIds]);

  const showStar = (id: string) => {
    const s = view.galaxy.stars.find((x) => x.id === id);
    if (!s) return;
    setStarId(id);
    setFleetIds([]);
    renderer.current?.focus(s.x, s.y);
  };

  const ordering = readOnly ? [] : fleetIds.map((id) => view.fleets[id]).filter((f): f is Fleet => !!f && f.ownerId === me.id);

  return (
    <div className="map-layout">
      <div className="map-host" ref={host}>
        {ordering.length > 0 ? (
          <div className="map-banner">
            {touch ? (
              <>Tap a star to send <b>{ordering.length === 1 ? ordering[0]!.name : `${ordering.length} fleets`}</b> there. Highlighted stars are in range.
                Hold a fleet to add or remove it. Tap empty space to deselect.</>
            ) : (
              <>Click a star to send <b>{ordering.length === 1 ? ordering[0]!.name : `${ordering.length} fleets`}</b> there. Highlighted stars are in range.
                Shift-click fleets to add or remove them. Esc or click empty space to deselect.</>
            )}
          </div>
        ) : touch ? (
          <div className="map-hint">Drag to pan · pinch to zoom · tap a star to view its system · tap a fleet, then a star to send it there · hold a fleet to select several</div>
        ) : (
          <div className="map-hint">Drag to pan · wheel to zoom · click a star to view its system · click a fleet, then a star to send it there · shift-click to select several fleets</div>
        )}
        {touch && !readOnly && (
          <button className={`map-several${several ? " active" : ""}`} aria-pressed={several} onClick={() => setSeveral(!several)}
            title="While on, every fleet you tap is added to the selection or taken out of it, as Shift-click does.">
            {several ? "✓ Selecting several" : "Select several"}
          </button>
        )}
        {notice && <div key={notice.at} className={`map-notice${notice.bad ? " bad" : ""}`}>{notice.text}</div>}
      </div>
      <aside className="side">
        <LastTurnPanel onTarget={(t) => {
          if (t.kind === "colony") onOpenColony(t.colonyId);
          else if (t.kind === "star") showStar(t.starId);
          else if (t.kind === "research") onOpenResearch();
          else onOpenReports();
        }} />
        {fleetIds.length > 1 && (
          <div className="panel"><SelectionPanel fleetIds={fleetIds} onPick={pickFleet} onFocus={(id) => setFleetIds([...fleetIds.filter((x) => x !== id), id])} onClear={() => setFleetIds([])} /></div>
        )}
        {fleetId && <div className="panel"><FleetPanel fleetId={fleetId} onSelectFleet={setFleetId} /></div>}
        {starId && <div className="panel"><StarPanel
          starId={starId} fleetId={fleetId} selectedFleetIds={fleetIds} onSelectFleet={pickFleet}
          onColonize={(planetId, settle) => {
            setColonizeOnOpen({ planetId, settle });
            setSystemStar(starId);
          }}
        /></div>}
        {!readOnly && session.rejected.length > 0 && (
          <div className="panel bad">Some orders are invalid: {session.rejected.join("; ")}</div>
        )}
        {systemStar && (
          <SystemView
            starId={systemStar}
            fleetId={fleetId}
            selectedFleetIds={fleetIds}
            colonizeOnOpen={colonizeOnOpen}
            onClose={() => {
              setSystemStar(null);
              setColonizeOnOpen(null);
            }}
            onSelectFleet={(id, additive) => {
              pickFleet(id, additive);
              // A shift-click keeps the view open to gather more fleets.
              if (!additive) {
                setSystemStar(null);
                setColonizeOnOpen(null);
              }
            }}
          />
        )}
        {!readOnly && <TradeGoodsList onOpen={onOpenColony} />}
        <MyFleetsList onSelect={pickFleet} selected={fleetIds} />
      </aside>
    </div>
  );
}

/** Several fleets picked with shift-click: they all take the next star order. */
function SelectionPanel({ fleetIds, onPick, onFocus, onClear }: {
  fleetIds: string[];
  onPick: (id: string, additive: boolean) => void;
  onFocus: (id: string) => void;
  onClear: () => void;
}) {
  const { view } = useGame();
  const fleets = fleetIds.map((id) => view.fleets[id]).filter((f): f is Fleet => !!f);
  const focused = fleetIds.at(-1);
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row">
        <h4 style={{ margin: 0 }}>{fleets.length} fleets selected · {plural(fleets.reduce((n, f) => n + fleetShips(f), 0), "ship")}</h4>
        <button className="small" style={{ marginLeft: "auto" }} onClick={onClear}>Clear</button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
        {fleets.map((f) => (
          <span key={f.id} className="row" style={{ gap: 0 }}>
            <button className={`small${f.id === focused ? " active" : ""}`} title="Show details" onClick={() => onFocus(f.id)}>{f.name}</button>
            <button className="small" title="Remove from selection" aria-label={`Remove ${f.name} from selection`} onClick={() => onPick(f.id, true)}>✕</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function MyFleetsList({ onSelect, selected }: { onSelect: (id: string, additive: boolean) => void; selected: string[] }) {
  const { view, me } = useGame();
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const idle = fleets.filter((f) => f.starId && !f.destStarId);
  return (
    <div className="panel col" style={{ gap: 4 }}>
      <h4>Your fleets ({fleets.length}, {idle.length} idle)</h4>
      {fleets.map((f) => (
        <button key={f.id} className={`small${selected.includes(f.id) ? " active" : ""}`} style={{ textAlign: "left" }} onClick={(e) => onSelect(f.id, additive(e))}>
          {f.name} <span className="muted">· {plural(fleetShips(f), "ship")} · {f.destStarId ? `→ ${view.galaxy.stars.find((s) => s.id === f.destStarId)?.name}` : view.galaxy.stars.find((s) => s.id === f.starId)?.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Colonies with nothing to build, whose industry all goes to Trade Goods; they wait for orders. */
function TradeGoodsList({ onOpen }: { onOpen: (colonyId: string) => void }) {
  const { view, me } = useGame();
  const idle = Object.values(view.colonies).filter((c) => c.ownerId === me.id && isTradeGoodsOnly(c));
  if (idle.length === 0) return null;
  return (
    <div className="panel col trade-goods-list" style={{ gap: 4 }}>
      <h4 className="warn">Producing only Trade Goods ({idle.length})</h4>
      {idle.map((c) => (
        <button key={c.id} className="small" style={{ textAlign: "left" }} onClick={() => onOpen(c.id)} title="Open the colony to give it something to build">
          {c.name}
        </button>
      ))}
    </div>
  );
}
