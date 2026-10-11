import { useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { TipCard } from "./Tip";

/**
 * Touch support shared by the screens: whether the device is mainly touch,
 * a "select several" switch that stands in for holding Shift, and the
 * long-press timing used for tooltips and other hold gestures.
 */

/** How long a finger must rest before a press counts as a hold. */
export const HOLD_MS = 500;
/** How far a finger may drift during a hold before it counts as a drag instead. */
export const HOLD_SLOP = 10;

/** True on tablets and phones, where the main pointer is a finger. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

/** Short buzz to confirm a hold, where the device supports it. */
export function buzz(): void {
  try {
    navigator.vibrate?.(15);
  } catch {
    // Not supported; holding still works.
  }
}

let multi = false;
const listeners = new Set<() => void>();

/** While on, every pick adds to the selection or takes away from it, as Shift does. */
export const multiSelect = {
  get on(): boolean {
    return multi;
  },
  set(on: boolean): void {
    if (on === multi) return;
    multi = on;
    for (const l of listeners) l();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useMultiSelect(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(multiSelect.subscribe, () => multi);
  return [on, multiSelect.set];
}

/** Whether a pick should add to the selection: Shift held, or the touch switch is on. */
export function additive(e: { shiftKey?: boolean } | undefined): boolean {
  return !!e?.shiftKey || multi;
}

let swallowUntil = 0;

/** After a hold fired, the lifted finger's click must not also press what was under it. */
export function swallowNextClick(): void {
  swallowUntil = performance.now() + 800;
}

if (typeof window !== "undefined") {
  window.addEventListener("click", (e) => {
    if (performance.now() > swallowUntil) return;
    swallowUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

/** Rich cards registered by `Tip` anchors, looked up when a hold starts on or inside one. */
export const touchTipCards = new WeakMap<Element, () => TipCard | null>();

/**
 * Pointer handlers that call `onHold` when a finger rests on the element for
 * `ms`; the click that follows the lift is swallowed. Mouse presses are ignored.
 */
export function useHold(onHold: () => void, ms = HOLD_MS) {
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancel = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  return {
    onPointerDown(e: ReactPointerEvent) {
      if (e.pointerType === "mouse") return;
      cancel();
      const timer = window.setTimeout(() => {
        hold.current = null;
        buzz();
        swallowNextClick();
        onHold();
      }, ms);
      hold.current = { timer, x: e.clientX, y: e.clientY };
    },
    onPointerMove(e: ReactPointerEvent) {
      if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
