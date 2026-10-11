import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hover tooltips with real content: a title, key numbers and a few lines on
 * what something does. `Tip` wraps any element; the card follows the pointer
 * and stays inside the window. Disabled controls inside still show their tip.
 */

export interface TipCard {
  title: string;
  /** Short line under the title, e.g. "Beam weapon". */
  kind?: string;
  /** Key numbers as label/value pairs. */
  rows?: [string, ReactNode][];
  /** Sentences on what it does. */
  text?: string[];
  /** A warning, e.g. why something can't be picked yet. */
  note?: string;
}

/** The card as plain text, for native tooltips on <option>s. */
export function tipText(card: TipCard): string {
  const rows = (card.rows ?? []).map(([k, v]) => `${k}: ${typeof v === "string" || typeof v === "number" ? v : ""}`);
  return [card.title + (card.kind ? ` (${card.kind})` : ""), ...rows, ...(card.text ?? []), ...(card.note ? [card.note] : [])].join("\n");
}

export function TipBody({ card }: { card: TipCard }) {
  return (
    <>
      <div className="tip-title">{card.title}{card.kind && <span className="tip-kind">{card.kind}</span>}</div>
      {card.rows && card.rows.length > 0 && (
        <table className="tip-rows"><tbody>
          {card.rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
      )}
      {card.text?.map((t, i) => <p key={i}>{t}</p>)}
      {card.note && <p className="tip-note">{card.note}</p>}
    </>
  );
}

export function Tip({ card, children, block = false }: { card: TipCard | (() => TipCard) | null; children: ReactNode; block?: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!at || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    const gap = 16;
    let left = at.x + gap;
    let top = at.y + gap;
    if (left + width > window.innerWidth - 8) left = Math.max(8, at.x - gap - width);
    if (top + height > window.innerHeight - 8) top = Math.max(8, at.y - gap - height);
    setPos({ left, top });
  }, [at]);

  const Wrap = block ? "div" : "span";
  const resolved = at && card ? (typeof card === "function" ? card() : card) : null;
  return (
    <Wrap
      className={`tip-anchor${block ? " block" : ""}`}
      onMouseMove={(e) => setAt({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setAt(null)}
    >
      {children}
      {resolved && createPortal(
        <div ref={box} className="tip-card" role="tooltip" style={{ left: pos.left, top: pos.top }}><TipBody card={resolved} /></div>,
        document.body,
      )}
    </Wrap>
  );
}
