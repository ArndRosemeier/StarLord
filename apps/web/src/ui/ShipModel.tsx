import { useEffect, useRef, useState } from "react";
import type { HullSize } from "@starlord/sim";
import type { ShipViewer } from "../three/shipPortrait";
import { useReducedMotion } from "./fx";

/**
 * Ships shown with their 3D battle models. three.js is loaded on demand, so
 * screens without ships never pay for it; without WebGL the frame stays empty.
 */

/** A still picture of the hull's battle model in the owner's colour. */
export function ShipThumb({ hull, color, size = 48 }: { hull: HullSize; color: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import("../three/shipPortrait")
      .then((m) => m.shipPortrait(hull, color, size))
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hull, color, size]);
  return (
    <span className="ship-thumb" style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} />}
    </span>
  );
}

/** The hull's battle model on a turntable; drag to turn it, wheel to zoom, double-click to reset. */
export function ShipModelView({ hull, color, className }: { hull: HullSize; color: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ShipViewer | null>(null);
  const latest = useRef({ hull, color });
  latest.current = { hull, color };
  const reduced = useReducedMotion();

  useEffect(() => {
    let live = true;
    import("../three/shipPortrait")
      .then((m) => {
        if (!live || !host.current) return;
        viewer.current = new m.ShipViewer(host.current, latest.current.hull, latest.current.color, reduced);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    viewer.current?.setShip(hull, color);
  }, [hull, color]);

  return <div ref={host} className={className} title="Drag to turn · wheel to zoom · double-click to reset" />;
}
