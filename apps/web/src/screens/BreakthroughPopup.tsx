import { useEffect, useMemo } from "react";
import { FIELD_NAMES, TECHS, TIERS_BY_ID, TIER_OF_TECH, type GameEvent, type PlayerId, type TechField } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { hyperAdvanceText, techTip } from "../ui/explain";
import { FIELD_LOOK } from "../ui/fieldLook";
import { audio } from "../audio/sound";

/** One field finished by our own research last turn: the applications it taught, or a hyper-advanced level. */
export type Breakthrough =
  | { kind: "tier"; tierId: string; field: TechField; techIds: string[] }
  | { kind: "hyper"; field: TechField; level: number };

export interface BreakthroughNews {
  breakthroughs: Breakthrough[];
  /** Applications that came another way last turn (spies, treaties, salvage, events), named in passing. */
  alsoGained: { techId: string; how: string }[];
}

const HOW: Record<string, string> = { stolen: "stolen by our spies", trade: "through a treaty", salvage: "salvaged", event: "found" };

/** Last turn's research breakthroughs for one empire, or null when there was none. */
export function breakthroughNews(events: GameEvent[], playerId: PlayerId): BreakthroughNews | null {
  const breakthroughs: Breakthrough[] = [];
  const alsoGained: BreakthroughNews["alsoGained"] = [];
  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.kind === "hyperAdvance") breakthroughs.push({ kind: "hyper", field: e.field, level: e.level });
    if (e.kind !== "techLearned") continue;
    if (e.source && e.source !== "research") {
      alsoGained.push({ techId: e.techId, how: HOW[e.source] ?? "gained" });
      continue;
    }
    const tier = TIERS_BY_ID[e.tierId] ?? TIER_OF_TECH[e.techId];
    if (!tier) continue;
    const same = breakthroughs.find((b) => b.kind === "tier" && b.tierId === tier.id);
    if (same?.kind === "tier") same.techIds.push(e.techId);
    else breakthroughs.push({ kind: "tier", tierId: tier.id, field: tier.field, techIds: [e.techId] });
  }
  return breakthroughs.length > 0 ? { breakthroughs, alsoGained } : null;
}

/** Number of looks (backdrop, animation and fanfare) the popup cycles through. */
export const BREAKTHROUGH_LOOKS = 4;

const HEADLINES = ["Breakthrough!", "Eureka!", "Discovery!", "Science Triumphs!", "A New Age Dawns", "Knowledge Is Power"];

/** A line of praise per field of science; one is picked for each breakthrough. */
const PRAISE: Record<TechField, string[]> = {
  construction: ["Our engineers have outdone themselves.", "The foundries and drafting halls ring with celebration."],
  power: ["Our reactors hum with a new kind of fire.", "The power physicists are dancing in the control rooms."],
  chemistry: ["The laboratories are giddy with success.", "Our chemists have bottled something remarkable."],
  sociology: ["Our scholars have unlocked new ways to lead a people.", "The academies are buzzing with the news."],
  computers: ["The thinking machines have surpassed themselves.", "Our programmers have cracked it at last."],
  biology: ["Life itself yields another secret.", "Our geneticists are celebrating in the gardens."],
  physics: ["The laws of nature have given up another secret.", "Our physicists have seen further than anyone before."],
  forceFields: ["The shield labs glow with triumph.", "Our field theorists have bent space to their will."],
};

/** A stable number for a turn's breakthroughs, so a reload shows the same look but turns differ. */
export function breakthroughSeed(turn: number, news: BreakthroughNews): number {
  const key = `${turn}:${news.breakthroughs.map((b) => (b.kind === "tier" ? b.tierId : `${b.field}${b.level}`)).join(",")}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Sparks flying out of the centre; positions come from the seed so they differ between breakthroughs. */
function sparks(seed: number, n: number) {
  let x = seed || 1;
  const next = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0) / 4294967296;
  return Array.from({ length: n }, (_, i) => ({ angle: (360 / n) * i + next() * 20, dist: 120 + next() * 260, delay: next() * 0.9, size: 3 + next() * 6 }));
}

/**
 * The festive window for a research breakthrough: a fanfare, fireworks in the
 * field's colour and what the new knowledge does, with the real rule numbers.
 * Closing it opens the research screen so the next field can be chosen.
 */
export function BreakthroughPopup({ news, onClose, nextLabel }: { news: BreakthroughNews; onClose: () => void; nextLabel: string }) {
  const { view } = useGame();
  const seed = useMemo(() => breakthroughSeed(view.turn, news), [view.turn, news]);
  const look = seed % BREAKTHROUGH_LOOKS;
  const first = news.breakthroughs[0]!;
  const color = FIELD_LOOK[first.field]?.color ?? "#5b9dff";
  const headline = HEADLINES[(seed >>> 3) % HEADLINES.length]!;
  const praise = PRAISE[first.field][(seed >>> 7) % PRAISE[first.field].length]!;
  const flying = useMemo(() => sparks(seed, 28), [seed]);

  useEffect(() => {
    audio.sting(`audio/breakthrough-${look + 1}.mp3`);
    audio.play("sparkle");
  }, []);

  return (
    <div className={`modal-back breakthrough-back bt-look-${look}`} style={{ ["--field" as string]: color }} onClick={onClose}>
      <div className="bt-fx" aria-hidden="true">
        <div className="bt-rays" />
        <div className="bt-ring" />
        <div className="bt-ring two" />
        {flying.map((s, i) => (
          <span key={i} className="bt-spark" style={{
            ["--a" as string]: `${s.angle}deg`, ["--d" as string]: `${s.dist}px`, ["--s" as string]: `${s.size}px`, animationDelay: `${0.15 + s.delay}s`,
          }} />
        ))}
      </div>
      <div className="modal breakthrough-modal" role="dialog" aria-label={headline} onClick={(e) => e.stopPropagation()}>
        <div className="bt-headline">{headline}</div>
        <div className="bt-praise muted">{praise}</div>
        {news.breakthroughs.map((b, i) => (
          <div key={i} className="bt-card" style={{ ["--field" as string]: FIELD_LOOK[b.field]?.color, animationDelay: `${0.5 + i * 0.2}s` }}>
            <div className="bt-field"><span className="bt-glyph">{FIELD_LOOK[b.field]?.glyph}</span>{FIELD_NAMES[b.field]}
              {b.kind === "tier" && <span className="muted"> · {TIERS_BY_ID[b.tierId]?.name}</span>}
            </div>
            {b.kind === "hyper" ? (
              <>
                <div className="bt-tech">Hyper-advanced {FIELD_NAMES[b.field]} {b.level}</div>
                {hyperAdvanceText(b.field).map((t, j) => <div key={j} className="bt-effect">{t}</div>)}
              </>
            ) : b.techIds.map((id) => {
              const tip = techTip(id);
              return (
                <div key={id} className="bt-learned">
                  <div className="bt-tech">{TECHS[id]?.name ?? id}</div>
                  {tip.rows?.map(([k, v], j) => <div key={`r${j}`} className="bt-effect"><b>{k}:</b> {v}</div>)}
                  {tip.text?.map((t, j) => <div key={j} className="bt-effect">{t}</div>)}
                </div>
              );
            })}
          </div>
        ))}
        {news.alsoGained.length > 0 && (
          <div className="bt-also muted">
            Also gained: {news.alsoGained.map((g) => `${TECHS[g.techId]?.name ?? g.techId} (${g.how})`).join(", ")}.
          </div>
        )}
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="primary" autoFocus onClick={onClose}>{nextLabel}</button>
        </div>
      </div>
    </div>
  );
}
