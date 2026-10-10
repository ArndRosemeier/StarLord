/** Name parts for generated leaders; combined they make original names. */
export const LEADER_FIRST = [
  "Ardan", "Belis", "Corvin", "Dara", "Elsk", "Fenra", "Galt", "Hesper", "Ilun", "Joren", "Kesh", "Lyra",
  "Mordo", "Nyssa", "Orlin", "Pell", "Quen", "Rask", "Sela", "Toven", "Ursa", "Vance", "Wren", "Xilo", "Yara", "Zev",
];
export const LEADER_LAST = [
  "Ashgrove", "Brightwater", "Coldiron", "Duskmere", "Embervale", "Farhold", "Greystone", "Hallow", "Ironwood",
  "Kestrel", "Longfall", "Moorcroft", "Northwind", "Oakhart", "Pyre", "Quill", "Ravensong", "Starling", "Thorne", "Vex",
];

export const ADMIN_SKILLS = ["industry", "research", "food", "bc", "morale"] as const;
export const CAPTAIN_SKILLS = ["attack", "defense", "combatSpeed"] as const;

/** Skill value per leader level. Percent for administrators, points for captains. */
export const SKILL_PER_LEVEL = {
  industry: 5, research: 5, food: 5, bc: 10, morale: 5,
  attack: 8, defense: 8, combatSpeed: 0.5,
} as const;

export const LEADER_OFFER_INTERVAL = 12;
export const MAX_LEADERS = 6;
