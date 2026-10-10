/**
 * Look-and-feel data for the animated title screen: the ship sprites that fly past,
 * the spots on the painted key art that glow, and the news ticker's headlines.
 * Purely cosmetic, so it lives with the web app rather than in the rules data.
 */

export type ShipKind = "fighter" | "cruiser" | "organic" | "raider" | "freighter";

export interface ShipSprite {
  src: string;
  /** Size relative to a fighter, so a freighter dwarfs an interceptor. */
  size: number;
  /** Engine nozzles as fractions of the sprite (the sprite faces left, so engines sit on the right). */
  engines: [number, number][];
  engineColor: string;
  /** What the toast says when the player shoots one down. */
  downed: string[];
}

export const SHIPS: Record<ShipKind, ShipSprite> = {
  fighter: {
    src: "art/ships/fighter.webp", size: 0.75, engineColor: "120,220,255",
    engines: [[0.86, 0.37], [0.86, 0.66]],
    downed: ["Pilot ejected safely. Probably.", "One interceptor fewer. The Admiralty sends its regards.", "Splash one!"],
  },
  cruiser: {
    src: "art/ships/cruiser.webp", size: 1.35, engineColor: "130,180,255",
    engines: [[0.76, 0.43], [0.83, 0.47], [0.9, 0.5], [0.75, 0.7]],
    downed: ["You shot down a battle cruiser. With a mouse.", "Friendly fire on the escort fleet! Court-martial pending."],
  },
  organic: {
    src: "art/ships/organic.webp", size: 1, engineColor: "190,130,255",
    engines: [[0.66, 0.24]],
    downed: ["You have angered the space squid. Its relatives are on their way.", "The bio-ship dissolves into glittering spores."],
  },
  raider: {
    src: "art/ships/raider.webp", size: 1, engineColor: "255,150,70",
    engines: [[0.95, 0.31], [0.95, 0.48], [0.95, 0.65]],
    downed: ["Raider destroyed! Bounty: 50 BC.", "Pirate scum vaporised.", "Another raider joins the asteroid belt."],
  },
  freighter: {
    src: "art/ships/freighter.webp", size: 1.45, engineColor: "255,200,140",
    engines: [[0.985, 0.17], [0.985, 0.39], [0.985, 0.61], [0.985, 0.83]],
    downed: ["That was a civilian freighter. The Quillan trade guild will hear of this.", "Cargo lost: 40 tons of space cheese."],
  },
};

/** Size of the painted key art in public/art/title.webp. */
export const TITLE_ART = { width: 1920, height: 1072 };

/** Points on the key art (fractions of the image) that get live effects. */
export const ART_SPOTS = {
  sun: [0.137, 0.635] as [number, number],
  /** Engine exhausts of the fleet crossing the painting. */
  engines: [
    [0.9, 0.627, 1.6], [0.928, 0.627, 1.6], [0.988, 0.615, 1.8],
    [0.653, 0.77, 0.8], [0.721, 0.714, 0.6], [0.838, 0.746, 0.6], [0.93, 0.73, 0.55],
    [0.703, 0.919, 0.9], [0.718, 0.9, 0.7], [0.917, 0.883, 1.1], [0.9375, 0.863, 1],
  ] as [number, number, number][],
  /** Navigation beacons on the orbital station. */
  beacons: [[0.457, 0.7, "255,70,70"], [0.36, 0.82, "80,255,140"], [0.44, 0.92, "255,220,120"]] as [number, number, string][],
};

/** Headlines for the Galactic News Network ticker. Original names only. */
export const HEADLINES = [
  "Kyrrin aerobatics team breaks the sound barrier, then remembers space has no air",
  "Gorvath ambassador apologises for crushing the negotiating table, again",
  "Shadar deny everything; Shadar also deny being Shadar",
  "Quillan merchants open a duty-free shop inside a black hole. Prices are, as usual, out of this world",
  "Zhrikk hive votes 1,000,000,000 to 0 in favour of more farming",
  "Kordex factory celebrates 400 years without a coffee break",
  "Ythari scholars finish reading the encyclopedia; ask whether there is a sequel",
  "Petrani food critic awards five stars to a particularly crunchy asteroid",
  "Thalassi report a minor inter-dimensional leak; residents advised to keep their towels handy",
  "Felhari gunnery champion hits a target three systems away. Target unavailable for comment",
  "Draskar tunnelling crew surfaces on the wrong planet, decides to stay",
  "Lysari matriarch reads your mind and says it is fine, really",
  "Terran diplomats sign peace treaty with themselves after lengthy internal dispute",
  "Admiralty reminds citizens: pirate raiders may be fired upon on sight. Click responsibly",
  "Astronomers spot a giant space squid near the nebula; squid reportedly spotted them first",
  "Galactic council postpones vote on who gets to sit in the big chair",
  "Rumours of a Grand Armada that answers to an ancient code (up, up, down, down...)",
  "Tramps seen hitching rides on freighters across three sectors; nobody knows where they come from",
];
