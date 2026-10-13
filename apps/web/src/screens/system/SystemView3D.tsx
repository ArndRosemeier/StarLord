import { useEffect, useRef, useState } from "react";
import { SystemScene, type SystemPick } from "../../three/system/systemScene";
import { isTouchDevice } from "../../ui/touch";
import type { SystemModel } from "../../three/system/systemModel";
import type { ColonizeOption } from "../../game/colonize";

export interface SystemView3DProps {
  model: SystemModel;
  selected: SystemPick | null;
  reduced: boolean;
  onPick: (pick: SystemPick | null, additive: boolean) => void;
  onFail: (error: unknown) => void;
  /** A colonization to play; `onColonizeStart` fires once the scene has taken it in, `onColonizeDone` when it ends. */
  colonize?: ColonizeCue | null;
  onColonizeStart?: (cue: ColonizeCue) => void;
  onColonizeDone?: (cue: ColonizeCue) => void;
}

export interface ColonizeCue {
  id: number;
  planetId: string;
  fleetId: string;
  color: string;
  /** The settle option the order is issued with (colony or outpost ship). */
  settle?: ColonizeOption;
}

/**
 * The 3D star system, loaded on demand like the battle view (three.js is a
 * big chunk), so the module's default export is the component.
 */
export default function SystemView3D({ model, selected, reduced, onPick, onFail, colonize, onColonizeStart, onColonizeDone }: SystemView3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SystemScene | null>(null);
  const shown = useRef<SystemModel | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const cb = useRef({ onColonizeStart, onColonizeDone });
  cb.current = { onColonizeStart, onColonizeDone };
  // Which cue each scene has played (a scene can be rebuilt, e.g. by StrictMode), and which cue has been started.
  const played = useRef<{ id: number; scene: SystemScene } | null>(null);
  const started = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // One scene per opened system; it frees every GPU resource on unmount.
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new SystemScene(host.current, model, { reduced, onPick: (p, additive) => pick.current(p, additive) });
      shown.current = model;
    } catch (e) {
      onFail(e);
      return;
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // Later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.starId]);

  // Before the model effect, so the planet is marked as landing before the new colony shows up.
  useEffect(() => {
    const sc = scene.current;
    if (!colonize || !sc || (played.current?.id === colonize.id && played.current.scene === sc)) return;
    played.current = { id: colonize.id, scene: sc };
    setPlaying(true);
    sc.playColonize(colonize.planetId, colonize.fleetId, colonize.color, () => {
      setPlaying(false);
      cb.current.onColonizeDone?.(colonize);
    });
    if (started.current !== colonize.id) {
      started.current = colonize.id;
      cb.current.onColonizeStart?.(colonize);
    }
  });

  useEffect(() => {
    if (!scene.current || shown.current === model) return;
    scene.current.setModel(model);
    shown.current = model;
  }, [model]);

  useEffect(() => {
    scene.current?.setReduced(reduced);
  }, [reduced]);

  useEffect(() => {
    scene.current?.select(selected);
  }, [selected?.kind, selected && "id" in selected ? selected.id : null]);

  return (
    <div ref={host} className="system-3d">
      {playing && <button className="small system-skip" onClick={() => scene.current?.skip()}>Skip ▸</button>}
      <div className="system-3d-hint muted">{isTouchDevice()
        ? "Drag to orbit · pinch to zoom · tap a planet or fleet · double-tap to reset"
        : "Drag to orbit · wheel to zoom · click a planet or fleet · double-click to reset"}</div>
    </div>
  );
}
