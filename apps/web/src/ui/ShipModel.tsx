import { useEffect, useRef, useState } from "react";
import type { HullSize } from "@starlord/sim";
import type { ShipViewer } from "../three/shipPortrait";
import { useReducedMotion } from "./fx";

/**
 * Ships shown with their 3D battle models. three.js is loaded on demand, so
 * screens without ships never pay for it; without WebGL the frame stays empty.
 */

/** A still picture of the hull's battle model in the owner's colour. */
export function ShipThumb({ hull, color, style, size = 48 }: { hull: HullSize; color: string; style: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import("../three/shipPortrait")
      .then((m) => m.shipPortrait(hull, color, size, style))
      .then((url) => live && setSrc(url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hull, color, style, size]);
  return (
    <span className="ship-thumb" style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} />}
    </span>
  );
}

/** The hull's battle model on a turntable; drag to turn it, wheel to zoom, double-click to reset. */
export function ShipModelView({ hull, color, style, className }: { hull: HullSize; color: string; style: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ShipViewer | null>(null);
  const latest = useRef({ hull, color, style });
  latest.current = { hull, color, style };
  const reduced = useReducedMotion();

  useEffect(() => {
    let live = true;
    import("../three/shipPortrait")
      .then((m) => {
        if (!live || !host.current) return;
        viewer.current = new m.ShipViewer(host.current, latest.current.hull, latest.current.color, latest.current.style, reduced);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    viewer.current?.setShip(hull, color, style);
  }, [hull, color, style]);

  return <div ref={host} className={className} title="Drag to turn · wheel to zoom · double-click to reset" />;
}
