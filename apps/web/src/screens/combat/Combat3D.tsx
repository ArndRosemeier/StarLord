import { useEffect, useRef } from "react";
import { BattleScene } from "./battleScene";
import type { CombatViewProps } from "./Combat2D";

/**
 * The 3D battle view. Loaded on demand (three.js is a big chunk), so the
 * module's default export is the component. `onFail` reports a WebGL error so
 * the replay can fall back to the 2D canvas.
 */
export default function Combat3D(props: CombatViewProps & { onFail: (error: unknown) => void }) {
  const { report, view, units, frames, event, step, reduced, resetKey, onFail } = props;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BattleScene | null>(null);
  const lastStep = useRef(-1);

  // One scene per report; it is torn down (and every GPU resource freed) on unmount.
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new BattleScene(host.current, { report, view, units, reduced });
    } catch (e) {
      onFail(e);
      return;
    }
    lastStep.current = -1;
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // The scene is rebuilt only for a different battle; live values arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, units]);

  useEffect(() => {
    scene.current?.setReduced(reduced);
  }, [reduced]);

  useEffect(() => {
    scene.current?.resetEffects();
  }, [resetKey]);

  useEffect(() => {
    // Effects play only when the replay moves forward by one event, not when scrubbing.
    const fresh = step === lastStep.current + 1;
    lastStep.current = step;
    scene.current?.show(frames, event, performance.now(), fresh);
  }, [frames, event, step, report, units]);

  return (
    <div ref={host} className="combat-3d">
      <div className="combat-3d-hint muted">Drag to orbit · wheel to zoom · double-click to reset · click a unit to pin its label</div>
    </div>
  );
}
