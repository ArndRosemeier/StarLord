import { useEffect, useState } from "react";
import { RACES } from "@starlord/sim";

/** A rotating card on the title screen introducing the playable races; hover to see them move. */
export function RaceShowcase({ onPick, reduced }: { onPick: (raceId: string) => void; reduced: boolean }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * RACES.length));
  const [hover, setHover] = useState(false);
  const race = RACES[index]!;
  const step = (d: number) => setIndex((i) => (i + d + RACES.length) % RACES.length);

  useEffect(() => {
    if (hover) return;
    const id = window.setInterval(() => step(1), 8000);
    return () => window.clearInterval(id);
  }, [hover, index]);

  return (
    <div className="hero-races" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ["--race" as string]: race.color }}>
      <div className="hero-races-media" key={race.id}>
        <img src={`races/${race.assetKey}.webp`} alt={race.name} />
        {hover && !reduced && <video src={`races/${race.assetKey}.mp4`} autoPlay muted loop playsInline />}
      </div>
      <div className="hero-races-info">
        <div className="hero-eyebrow">Choose your people</div>
        <div className="hero-races-name" key={race.id}>{race.plural}</div>
        <div className="hero-races-arch">{race.archetype}</div>
        <p>{race.description}</p>
        <div className="hero-races-nav">
          <button aria-label="Previous race" onClick={() => step(-1)}>‹</button>
          <div className="hero-dots">
            {RACES.map((r, i) => <span key={r.id} className={i === index ? "on" : ""} onClick={() => setIndex(i)} />)}
          </div>
          <button aria-label="Next race" onClick={() => step(1)}>›</button>
          <button className="hero-lead" onClick={() => onPick(race.id)}>Lead the {race.plural}</button>
        </div>
      </div>
    </div>
  );
}
