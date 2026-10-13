import type { GameEvent, PlayerView } from "@starlord/sim";
import { describeEvent, starName } from "./format";

export type ReportSection = "production" | "research" | "colonies" | "military" | "diplomacy" | "exploration" | "other";

export const SECTION_LABELS: Record<ReportSection, string> = {
  production: "Production",
  research: "Research",
  colonies: "Colonies",
  military: "Military",
  diplomacy: "Diplomacy & intelligence",
  exploration: "Exploration",
  other: "Galactic news",
};

const SECTION_OF: Record<GameEvent["kind"], ReportSection> = {
  built: "production", starvation: "production", baseReady: "production", baseScrapped: "production",
  techLearned: "research", hyperAdvance: "research",
  colonyFounded: "colonies", colonyCaptured: "colonies", colonyLost: "colonies", invasionFailed: "colonies", bombarded: "colonies",
  combat: "military", orbitalStrike: "military", raid: "military", raidersDefeated: "military",
  diplomacy: "diplomacy", spy: "diplomacy", leader: "diplomacy", council: "diplomacy",
  explored: "exploration",
  random: "other", eliminated: "other", victory: "other", commandRejected: "other",
};

const ORDER: ReportSection[] = ["military", "colonies", "production", "research", "diplomacy", "exploration", "other"];

/** Where clicking a report line takes the player. */
export type ReportTarget =
  | { kind: "colony"; colonyId: string }
  | { kind: "star"; starId: string }
  | { kind: "research" }
  | { kind: "reports" };

export interface ReportLine {
  text: string;
  tone: "good" | "bad" | "info";
  target?: ReportTarget;
}

export interface ReportGroup {
  section: ReportSection;
  label: string;
  lines: ReportLine[];
}

/** The viewer's events from the last turn, sorted into sidebar sections; exploration is folded into one line. */
export function turnReport(view: PlayerView, events: readonly GameEvent[]): ReportGroup[] {
  const groups = new Map<ReportSection, ReportLine[]>();
  const add = (s: ReportSection, l: ReportLine) => {
    const list = groups.get(s) ?? [];
    list.push(l);
    groups.set(s, list);
  };
  const explored: string[] = [];
  for (const e of events) {
    if (e.playerId !== view.viewer) continue;
    if (e.kind === "explored") {
      explored.push(e.starId);
      continue;
    }
    const d = describeEvent(view, e);
    const section = SECTION_OF[e.kind] ?? "other";
    let target: ReportTarget | undefined;
    if ((e.kind === "built" || e.kind === "starvation" || e.kind === "colonyFounded" || e.kind === "colonyCaptured" || e.kind === "baseReady" || e.kind === "baseScrapped") && view.colonies[e.colonyId]?.ownerId === view.viewer) {
      target = { kind: "colony", colonyId: e.colonyId };
    } else if (section === "research") {
      target = { kind: "research" };
    } else if (e.kind === "combat") {
      target = { kind: "reports" };
    } else if (d.starId) {
      target = { kind: "star", starId: d.starId };
    }
    add(section, { text: d.text, tone: d.tone, target });
  }
  if (explored.length === 1) {
    add("exploration", { text: `Explored ${starName(view, explored[0]!)}.`, tone: "info", target: { kind: "star", starId: explored[0]! } });
  } else if (explored.length > 1) {
    add("exploration", { text: `Explored ${explored.length} systems: ${explored.map((id) => starName(view, id)).join(", ")}.`, tone: "info" });
  }
  return ORDER.filter((s) => groups.has(s)).map((s) => ({ section: s, label: SECTION_LABELS[s], lines: groups.get(s)! }));
}
