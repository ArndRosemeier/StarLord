import { createRoot } from "react-dom/client";
import { useState } from "react";
import { RACES, raceShipStyle } from "@starlord/sim";
import { EndPreview } from "../ending/EndPreview";
import type { Ending, EndingKind } from "../ending/endings";
import "../styles.css";
import "../theme.css";

/** Dev page: plays each end sequence with sample empires (dev/endings.html?kind=council&race=3). */
const KINDS: EndingKind[] = ["conquest", "council", "raiders", "score", "defeat"];
const PLANETS = ["terran", "ocean", "arid", "tundra", "gaia", "desert", "swamp"];

function sample(kind: EndingKind, raceIndex: number): Ending {
  const look = (i: number) => {
    const r = RACES[i % RACES.length]!;
    return { color: r.color, style: raceShipStyle(r.id), planet: PLANETS[i % PLANETS.length]! };
  };
  return {
    won: kind !== "defeat",
    spec: { kind, hero: look(raceIndex), foe: kind === "defeat" ? look(raceIndex + 3) : null, others: [1, 2, 4, 5].map((d) => look(raceIndex + d)), raiders: "#c0208a" },
    text: { title: kind, lines: ["Sample caption with a real number: 12 of 17 votes, 12 needed to win.", "A second caption line."] },
  };
}

function Demo() {
  const params = new URLSearchParams(location.search);
  const [kind, setKind] = useState<EndingKind | null>((params.get("kind") as EndingKind | null) ?? null);
  const race = Number(params.get("race") ?? 0);
  if (kind) return <EndPreview key={kind} ending={sample(kind, race)} onClose={() => setKind(null)} />;
  return (
    <div className="row" style={{ padding: 24, gap: 8 }}>
      {KINDS.map((k) => <button key={k} onClick={() => setKind(k)}>{k}</button>)}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
