import { useEffect, useMemo, useState } from "react";
import { HEADLINES } from "./titleData";

/** The Galactic News Network crawl along the bottom of the title screen. */
export function NewsTicker({ reduced }: { reduced: boolean }) {
  const lines = useMemo(() => [...HEADLINES].sort(() => Math.random() - 0.5), []);
  const [index, setIndex] = useState(0);

  // Without motion the ticker swaps one headline at a time instead of scrolling.
  useEffect(() => {
    if (!reduced) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), 9000);
    return () => window.clearInterval(id);
  }, [reduced, lines]);

  const items = lines.map((l, i) => <span key={i} className="hero-news-item">{l}</span>);
  return (
    <div className="hero-news" aria-label="Galactic news">
      <div className="hero-news-label">GNN</div>
      <div className="hero-news-window">
        {reduced ? (
          <span className="hero-news-item">{lines[index]}</span>
        ) : (
          <div className="hero-news-track" style={{ animationDuration: `${lines.length * 9}s` }}>
            {items}
            <span aria-hidden="true">{items}</span>
          </div>
        )}
      </div>
    </div>
  );
}
