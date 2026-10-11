import type { PlayerView } from "@starlord/sim";

/**
 * Areas of play that can be handed to the computer. The AI is simply every
 * area switched on; a human player switches on only the ones they find dull.
 */
export type AutomationDomain =
  | "jobs" | "production" | "research" | "exploration" | "colonization" | "design" | "military"
  | "diplomacy" | "espionage" | "leaders";

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
}

const BALANCED: StrategyInfo = { id: "balanced", name: "Balanced", description: "Plays like the computer empires do." };

/**
 * What each automated area can aim for. Balanced comes first and is the
 * default, and is what computer empires always play.
 */
export const STRATEGIES: Record<AutomationDomain, StrategyInfo[]> = {
  jobs: [
    BALANCED,
    { id: "industry", name: "Industry", description: "Everyone not farming works in industry, keeping only a few scientists." },
    { id: "research", name: "Research", description: "Most colonists not farming become scientists." },
  ],
  production: [
    BALANCED,
    { id: "expansion", name: "Expansion", description: "More colony and outpost ships, and housing to grow new colonies." },
    { id: "industry", name: "Industry", description: "Factories and mines first, and a small fleet in peacetime." },
    { id: "research", name: "Research", description: "Laboratories and other research buildings first." },
    { id: "military", name: "Military", description: "Keeps a large fleet even in peacetime and fortifies colonies early." },
  ],
  research: [
    BALANCED,
    { id: "economy", name: "Economy", description: "Farming, industry and research buildings first." },
    { id: "military", name: "Military", description: "Weapons, armor, shields, computers and bigger hulls first." },
    { id: "expansion", name: "Expansion", description: "Fuel range, drives and better worlds to settle first." },
  ],
  exploration: [
    BALANCED,
    { id: "cautious", name: "Cautious", description: "Stays away from stars where hostile ships or monsters were seen." },
    { id: "farReaching", name: "Far reaching", description: "Heads for distant stars first to open up the map quickly." },
  ],
  colonization: [
    BALANCED,
    { id: "bestWorlds", name: "Best worlds", description: "Goes for the richest planets even when they are far away." },
    { id: "compact", name: "Compact", description: "Settles close to existing colonies to keep the empire tight." },
  ],
  design: [
    BALANCED,
    { id: "beams", name: "Beam ships", description: "Warships carry beam weapons only." },
    { id: "missiles", name: "Missile boats", description: "Warships carry missiles and torpedoes where the hull allows." },
    { id: "heavy", name: "Heavy hulls", description: "Builds on the largest hull known, even if it takes long to build." },
    { id: "light", name: "Light hulls", description: "Builds on smaller hulls that come off the docks quickly." },
  ],
  military: [
    BALANCED,
    { id: "defensive", name: "Defensive", description: "Only defends its own systems and retreats early from bad fights." },
    { id: "aggressive", name: "Aggressive", description: "Attacks with a thinner margin, hunts monsters and fights to the end." },
  ],
  diplomacy: [
    BALANCED,
    { id: "peaceful", name: "Peaceful", description: "Never starts a war, accepts treaties more readily and offers peace as soon as the enemy will hear it." },
    { id: "aggressive", name: "Aggressive", description: "Declares war when its fleets clearly outgun a neighbor's, by the computer empires' own strength test." },
  ],
  espionage: [
    BALANCED,
    { id: "defensive", name: "Defensive", description: "Keeps every spy at home to guard against enemy agents." },
    { id: "thieves", name: "Thieves", description: "Always steals technology, even from enemies at war." },
    { id: "saboteurs", name: "Saboteurs", description: "Sabotages enemies at war whenever spies are free." },
  ],
  leaders: [
    BALANCED,
    { id: "thrifty", name: "Thrifty", description: "Hires leaders only when the treasury is very full." },
    { id: "eager", name: "Eager", description: "Hires the best leader on offer whenever it is affordable." },
  ],
};

/** The strategy the viewing empire's automation follows in an area; computer empires always play balanced. */
export function strategyOf(view: PlayerView, domain: AutomationDomain): string {
  const p = view.players[view.viewer]!;
  if (!p.isHuman) return "balanced";
  const id = p.automationStrategies?.[domain];
  return id && STRATEGIES[domain].some((s) => s.id === id) ? id : "balanced";
}
