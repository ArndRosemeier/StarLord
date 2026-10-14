/**
 * Look-and-feel data for the animated title screen: the toasts for ships shot down
 * and the news ticker's headlines.
 * Purely cosmetic, so it lives with the web app rather than in the rules data.
 */

/** What flies past: interceptors, warships, pirates, giants far off and the odd space creature. */
export type FlyerRole = "fighter" | "cruiser" | "raider" | "capital" | "monster";

/** What the toast says when the player shoots one down. */
export const DOWNED: Record<FlyerRole, string[]> = {
  fighter: ["Pilot ejected safely. Probably.", "One interceptor fewer. The Admiralty sends its regards.", "Splash one!"],
  cruiser: ["You shot down a warship. With a mouse.", "Friendly fire on the escort fleet! Court-martial pending."],
  raider: ["Raider destroyed! Bounty: 50 BC.", "Pirate scum vaporised.", "Another raider joins the asteroid belt."],
  capital: ["A whole capital ship, gone. Its admiral will be filing a complaint.", "That was the flagship. Somebody is getting demoted."],
  monster: ["You have angered the space creature. Its relatives are on their way.", "The creature dissolves into glittering spores."],
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
