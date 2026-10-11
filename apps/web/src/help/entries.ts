import {
  ARMORS, BUILDINGS, CLIMATES, COMPUTERS, FIELD_NAMES, GOVERNMENTS, HULLS, MODULES, MONSTER_DESIGNS, PROJECTS,
  RACES, citadelDesign, SHIELDS, SPECIALS, TECHS, TECH_FIELDS, TECH_TIERS, TIER_OF_TECH, TRAIT_COSTS, WEAPONS,
  techUnlocks, type RaceTrait, type Unlock,
} from "@starlord/sim";
import { words } from "../ui/format";

/**
 * Index of every page in the encyclopedia. Pages are generated from the rules
 * tables; ids look like "tech:laserCannon" or "page:weapons".
 */

export type HelpGroup = "guide" | "tech" | "colony" | "ships" | "planets" | "races" | "threats";

export const GROUPS: { id: HelpGroup; name: string }[] = [
  { id: "guide", name: "How to play" },
  { id: "tech", name: "Technology" },
  { id: "colony", name: "Colonies" },
  { id: "ships", name: "Ships" },
  { id: "planets", name: "Planets & stars" },
  { id: "races", name: "Races & governments" },
  { id: "threats", name: "Monsters & raiders" },
];

export interface HelpEntry {
  id: string;
  group: HelpGroup;
  title: string;
  /** Short context shown under the title in lists, e.g. "Physics, tier 1". */
  subtitle?: string;
  /** Extra words that should find this page. */
  keywords?: string;
  /** Listed in the sidebar; the rest are reached by search and links. */
  overview?: boolean;
}

export const GUIDE_TOPICS = [
  { slug: "start", title: "Getting started", keywords: "begin first turn tutorial basics goal" },
  { slug: "controls", title: "Controls & shortcuts", keywords: "keyboard mouse keys hotkeys map pan zoom undo end turn f1" },
  { slug: "turn", title: "How a turn plays out", keywords: "order phase sequence end turn" },
  { slug: "colonies", title: "Colonies, jobs & output", keywords: "farmers workers scientists food industry research production queue build morale gravity pollution growth housing trade goods outpost" },
  { slug: "economy", title: "Money, food & upkeep", keywords: "bc tax taxes income maintenance upkeep salary debt bankrupt starvation food freighters" },
  { slug: "research", title: "Research & the tech tree", keywords: "tech tree tier field creative uncreative miniaturization rp research points" },
  { slug: "design", title: "Ship design", keywords: "design hull space component armor shield computer weapon module cost miniaturization" },
  { slug: "fleets", title: "Fleets, movement & command", keywords: "fleet move speed fuel range parsec scanner command points stance attack defend" },
  { slug: "combat", title: "Space combat", keywords: "battle combat hit chance damage shield missile torpedo beam retreat doctrine planet defense replay" },
  { slug: "invasion", title: "Bombing & invasion", keywords: "bomb bombard invade troops ground combat capture marines" },
  { slug: "diplomacy", title: "Diplomacy", keywords: "war peace alliance trade treaty research treaty attitude proposal contact" },
  { slug: "espionage", title: "Espionage", keywords: "spy spies steal sabotage security telepathic" },
  { slug: "leaders", title: "Leaders", keywords: "leader administrator captain hire salary skill" },
  { slug: "council", title: "Galactic council", keywords: "council vote election victory" },
  { slug: "events", title: "Random events", keywords: "event plague comet gold derelict baby boom" },
  { slug: "victory", title: "Winning the game", keywords: "victory win score conquest council raiders turn limit eliminated" },
  { slug: "automation", title: "Automation", keywords: "automate advisor ai autopilot" },
] as const;

export type GuideSlug = (typeof GUIDE_TOPICS)[number]["slug"];

/** Where a tech's unlock is described. */
export function unlockEntryId(u: Unlock): string {
  switch (u.kind) {
    case "drive":
    case "fuel":
      return "page:drives";
    default:
      return `${u.kind}:${u.id}`;
  }
}

export const TRAITS: RaceTrait[] = [
  ...(Object.keys(TRAIT_COSTS) as RaceTrait[]),
  ...[...new Set(RACES.flatMap((r) => r.picks.traits))].filter((t) => !(t in TRAIT_COSTS)),
];

export const traitName = (t: RaceTrait) => TRAIT_COSTS[t]?.name ?? words(t);

function build(): HelpEntry[] {
  const e: HelpEntry[] = [];
  const page = (id: string, group: HelpGroup, title: string, keywords?: string) => e.push({ id: `page:${id}`, group, title, keywords, overview: true });

  for (const g of GUIDE_TOPICS) e.push({ id: `guide:${g.slug}`, group: "guide", title: g.title, keywords: g.keywords, overview: true });

  page("techTree", "tech", "Tech tree", "research overview chart");
  page("techList", "tech", "All technologies", "table list every tech");
  for (const f of TECH_FIELDS) e.push({ id: `field:${f}`, group: "tech", title: FIELD_NAMES[f], subtitle: "Research field", overview: true });
  for (const t of TECH_TIERS) e.push({ id: `tier:${t.id}`, group: "tech", title: t.name, subtitle: `${FIELD_NAMES[t.field]} field, level ${t.level}`, keywords: "tier field" });
  for (const id of Object.keys(TECHS)) {
    const tier = TIER_OF_TECH[id];
    const unlocks = techUnlocks(id).map((u) => u.name).join(" ");
    const where = tier ? `${FIELD_NAMES[tier.field]}, ${tier.name}` : "Not researched";
    e.push({ id: `tech:${id}`, group: "tech", title: TECHS[id]!.name, subtitle: where, keywords: `${tier?.name ?? ""} ${unlocks}` });
  }

  page("buildings", "colony", "Buildings", "building structure colony");
  for (const b of BUILDINGS) e.push({ id: `building:${b.id}`, group: "colony", title: b.name, subtitle: "Building", keywords: b.description });
  page("projects", "colony", "Projects", "colony base outpost terraform spy housing");
  for (const p of PROJECTS) e.push({ id: `project:${p.id}`, group: "colony", title: p.name, subtitle: "Project", keywords: p.description });

  page("hulls", "ships", "Hulls", "frigate destroyer cruiser battleship titan doom star size");
  for (const h of HULLS) e.push({ id: `hull:${h.id}`, group: "ships", title: `${h.name} hull`, subtitle: "Hull" });
  page("weapons", "ships", "Weapons", "beam missile torpedo bomb spores gun");
  for (const w of WEAPONS) e.push({ id: `weapon:${w.id}`, group: "ships", title: w.name, subtitle: `${words(w.kind)} weapon` });
  page("armor", "ships", "Armor");
  for (const a of ARMORS) e.push({ id: `armor:${a.id}`, group: "ships", title: `${a.name} armor`, subtitle: "Armor" });
  page("shields", "ships", "Shields");
  for (const s of SHIELDS) e.push({ id: `shield:${s.id}`, group: "ships", title: `${s.name} shield`, subtitle: "Shield" });
  page("computers", "ships", "Combat computers", "targeting attack");
  for (const c of COMPUTERS) e.push({ id: `computer:${c.id}`, group: "ships", title: `${c.name} computer`, subtitle: "Combat computer" });
  page("specials", "ships", "Special systems", "special equipment ecm repair cloak");
  for (const s of SPECIALS) e.push({ id: `special:${s.id}`, group: "ships", title: s.name, subtitle: "Special system" });
  page("modules", "ships", "Modules", "colony ship outpost ship transport troop");
  for (const [id, m] of Object.entries(MODULES)) e.push({ id: `module:${id}`, group: "ships", title: m.name, subtitle: "Module" });
  page("drives", "ships", "Drives & fuel cells", "speed engine fuel range parsec");

  page("planets", "planets", "Planet types", "climate environment habitable hostile");
  for (const t of Object.keys(CLIMATES)) e.push({ id: `climate:${t}`, group: "planets", title: words(t), subtitle: "Planet type" });
  page("planetTraits", "planets", "Size, minerals & gravity", "size minerals gravity terraform");
  page("stars", "planets", "Stars", "star color black hole");

  page("races", "races", "Races", "species");
  for (const r of RACES) e.push({ id: `race:${r.id}`, group: "races", title: r.name, subtitle: r.archetype, keywords: r.description });
  page("racePicks", "races", "Race picks & traits", "custom race builder points");
  for (const t of TRAITS) e.push({ id: `trait:${t}`, group: "races", title: traitName(t), subtitle: "Race trait", keywords: TRAIT_COSTS[t]?.text });
  page("governments", "races", "Governments", "feudal dictatorship democracy unification");
  for (const [id, g] of Object.entries(GOVERNMENTS)) e.push({ id: `government:${id}`, group: "races", title: g.name, subtitle: "Government" });

  page("monsters", "threats", "Monsters, guardian & raiders", "monster lair orion guardian raiders portal");
  for (const d of [...MONSTER_DESIGNS, citadelDesign(0)]) e.push({ id: `monster:${d.id}`, group: "threats", title: d.name, subtitle: MONSTER_DESIGNS.includes(d) ? "Space monster" : "Raider fortress" });
  return e;
}

export const ENTRIES: HelpEntry[] = build();
export const ENTRIES_BY_ID: Map<string, HelpEntry> = new Map(ENTRIES.map((x) => [x.id, x]));

/** Entries matching every word of the query, best title matches first. */
export function searchEntries(query: string, limit = 60): HelpEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { e: HelpEntry; score: number }[] = [];
  for (const e of ENTRIES) {
    const title = e.title.toLowerCase();
    const hay = `${title} ${e.subtitle ?? ""} ${e.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    for (const w of words) score += title.startsWith(w) ? 4 : title.split(/[\s-]/).some((t) => t.startsWith(w)) ? 3 : title.includes(w) ? 2 : 0;
    if (e.overview) score += 1;
    scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title)).slice(0, limit).map((x) => x.e);
}
