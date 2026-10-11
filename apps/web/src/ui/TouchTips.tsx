import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TipBody, type TipCard } from "./Tip";
import { HOLD_MS, HOLD_SLOP, buzz, swallowNextClick, touchTipCards } from "./touch";

/**
 * Hover stands in for touch: hold a finger on anything that has a tooltip
 * (a `Tip` card or a plain `title`) and the tooltip shows above the finger.
 * Lifting the finger after a hold does not press the button underneath;
 * the next touch anywhere puts the tooltip away.
 */

type Shown = { x: number; y: number; card: TipCard | null; text: string[] };

function findTip(start: Element | null): Omit<Shown, "x" | "y"> | null {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    const rich = touchTipCards.get(el);
    if (rich) {
      const card = rich();
      if (card) return { card, text: [] };
    }
    const title = el.getAttribute("title");
    if (title) return { card: null, text: title.split("\n").filter(Boolean) };
  }
  return null;
}

/** Text fields keep their own long-press (select, paste). */
function isEditable(el: Element | null): boolean {
  return !!el?.closest("input, textarea, [contenteditable='true']");
}

export function TouchTips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    let timer = 0;
    let lastTouch = -Infinity;
    let start: { x: number; y: number; id: number; target: Element | null } | null = null;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      lastTouch = performance.now();
      setShown(null);
      cancel();
      if (!e.isPrimary) return;
      // Disabled buttons get no events of their own, so look at what is under the finger.
      const target = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
      if (isEditable(target)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, target };
      timer = window.setTimeout(() => {
        const s = start;
        start = null;
        if (!s) return;
        const found = findTip(s.target);
        if (!found) return;
        buzz();
        swallowNextClick();
        setShown({ ...found, x: s.x, y: s.y });
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > HOLD_SLOP) cancel();
    };
    const up = (e: PointerEvent) => {
      if (start && e.pointerId === start.id) cancel();
    };
    // A long press would otherwise open the browser's own menu; a right-click keeps it.
    const menu = (e: Event) => {
      if (performance.now() - lastTouch < 2000 && !isEditable(e.target as Element)) e.preventDefault();
    };
    const hide = () => setShown(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("contextmenu", menu);
    window.addEventListener("scroll", hide, true);
    return () => {
      cancel();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("contextmenu", menu);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!shown || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    // Above the finger, so the hand does not cover it; below when there is no room.
    let top = shown.y - height - 28;
    if (top < 8) top = Math.min(window.innerHeight - height - 8, shown.y + 36);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, shown.x - width / 2));
    setPos({ left, top: Math.max(8, top) });
  }, [shown]);

  if (!shown) return null;
  return createPortal(
    <div ref={box} className="tip-card touch" role="tooltip" style={{ left: pos.left, top: pos.top }}>
      {shown.card ? <TipBody card={shown.card} /> : shown.text.map((t, i) => <p key={i} className={i === 0 ? "first" : ""}>{t}</p>)}
    </div>,
    document.body,
  );
}
