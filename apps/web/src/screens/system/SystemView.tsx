import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../../ui/hooks";
import { useReducedMotion } from "../../ui/fx";
import { StarPanel } from "../../ui/panels";
import { webglAvailable } from "../../three/webgl";
import { buildSystemModel } from "../../three/system/systemModel";
import type { SystemPick } from "../../three/system/systemScene";

const SystemView3D = lazy(() => import("./SystemView3D"));

/**
 * A star system up close: a centred modal with the system in 3D and the
 * system's details (colonize, invade, fleets) beside it. Without WebGL the
 * details still show. Esc, the close button or a click outside closes it.
 */
export function SystemView({ starId, fleetId, selectedFleetIds, onClose, onSelectFleet }: {
  starId: string;
  fleetId: string | null;
  selectedFleetIds?: readonly string[];
  onClose: () => void;
  /** Picking a fleet closes the view so the fleet can be ordered on the map; a shift-click (`additive`) adds it to the selection. */
  onSelectFleet: (id: string, additive: boolean) => void;
}) {
  const { view } = useGame();
  const reduced = useReducedMotion();
  const model = useMemo(() => buildSystemModel(view, starId), [view, starId]);
  const [selected, setSelected] = useState<SystemPick | null>(null);
  const [failed, setFailed] = useState(false);
  const show3d = webglAvailable() && !failed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setSelected(null);
  }, [starId]);

  if (!model) return null;
  const planetId = selected?.kind === "planet" ? selected.id : null;

  // Portalled to the body, so screen entrance animations (transforms) cannot offset the fixed overlay.
  return createPortal(
    <div className="modal-back system-back" onClick={onClose}>
      <div className="modal system-modal" role="dialog" aria-label={`${model.name} system`} onClick={(e) => e.stopPropagation()}>
        <div className="system-stage">
          {show3d ? (
            <SceneBoundary onError={() => setFailed(true)}>
              <Suspense fallback={<div className="system-loading muted">Charting {model.name}…</div>}>
                <SystemView3D
                  model={model}
                  selected={selected}
                  reduced={reduced}
                  onFail={() => setFailed(true)}
                  onPick={(p, additive) => {
                    setSelected(p);
                    if (p?.kind === "fleet") onSelectFleet(p.id, additive);
                  }}
                />
              </Suspense>
            </SceneBoundary>
          ) : (
            <div className="system-loading muted">3D view unavailable in this browser.</div>
          )}
          <div className="system-title">
            <h2>{model.name}</h2>
            <span className="muted">
              {model.starClass === "blackHole" ? "Black hole" : `${model.starClass} star`}
              {model.explored ? ` · ${model.planets.length} planet${model.planets.length === 1 ? "" : "s"}` : " · unexplored"}
              {model.nebula ? " · in a nebula" : ""}
              {model.wormhole ? " · wormhole" : ""}
            </span>
          </div>
        </div>
        <aside className="system-side">
          <button className="system-close" onClick={onClose} aria-label="Close system view" title="Close (Esc)">✕</button>
          <StarPanel
            starId={starId}
            fleetId={fleetId}
            selectedFleetIds={selectedFleetIds}
            selectedPlanetId={planetId}
            onSelectPlanet={(id) => setSelected({ kind: "planet", id })}
            onSelectFleet={onSelectFleet}
          />
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** Falls back to the details alone if the 3D view throws while rendering. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
