import { useEffect, useRef } from "react";
import { SystemScene, type SystemPick } from "../../three/system/systemScene";
import type { SystemModel } from "../../three/system/systemModel";

export interface SystemView3DProps {
  model: SystemModel;
  selected: SystemPick | null;
  reduced: boolean;
  onPick: (pick: SystemPick | null, additive: boolean) => void;
  onFail: (error: unknown) => void;
}

/**
 * The 3D star system, loaded on demand like the battle view (three.js is a
 * big chunk), so the module's default export is the component.
 */
export default function SystemView3D({ model, selected, reduced, onPick, onFail }: SystemView3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SystemScene | null>(null);
  const shown = useRef<SystemModel | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

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
      <div className="system-3d-hint muted">Drag to orbit · wheel to zoom · click a planet or fleet · double-click to reset</div>
    </div>
  );
}
