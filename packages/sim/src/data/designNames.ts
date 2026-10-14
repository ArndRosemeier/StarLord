import type { ShipStyle } from "./shipStyles.js";

/**
 * Default names for new ship designs, themed per race through its ship style
 * (custom races get the names of the style they picked). Escorts are frigates
 * and destroyers; capitals are cruisers and larger.
 */
export const DESIGN_NAMES: Record<ShipStyle, { escort: string[]; capital: string[] }> = {
  standard: {
    escort: ["Vigilant", "Resolute", "Pathfinder", "Sentinel", "Courage", "Liberty", "Horizon", "Steadfast", "Endurance", "Valiant"],
    capital: ["Constitution", "Independence", "Concordia", "Republic", "Dauntless", "Magellan", "Indomitable", "Sovereign", "Unity", "Armstrong"],
  },
  raptor: {
    escort: ["Kestrel", "Talon", "Harrier", "Windcutter", "Swiftclaw", "Updraft", "Gyre", "Featherblade", "Sunplume", "Stormwing"],
    capital: ["Skyrender", "Roc", "Thunderbird", "Highcrest", "Eyrie", "Skyqueen", "Tempest Aerie", "Great Condor", "Sky Tyrant", "Heavenclaw"],
  },
  bulwark: {
    escort: ["Crusher", "Maul", "Ironfist", "Boulder", "Smasher", "Rampart", "Bonebreaker", "Headbutt", "Rockjaw", "Brute"],
    capital: ["Juggernaut", "Gravehammer", "Warbeast", "Anvilback", "Skullgrinder", "Mountainfall", "Worldbreaker", "Great Maul", "Titanhide", "Iron Mother"],
  },
  shade: {
    escort: ["Whisper", "Veil", "Mirage", "Shade", "Duskknife", "Mimic", "Murmur", "Glimmer", "Pale Mask", "Turncoat"],
    capital: ["Masquerade", "Silent Guest", "Faceless", "Thousand Faces", "Long Shadow", "Eclipse", "Grand Deceit", "Nightveil", "Doppel", "Unseen Hand"],
  },
  halo: {
    escort: ["Insight", "Clarity", "Lucid", "Mindsong", "Serene", "Intuition", "Empath", "Daughter", "Reverie", "Thoughtspark"],
    capital: ["Matriarch's Grace", "Revelation", "Harmony", "Sister of Dawn", "Concord", "Empress Thought", "High Mother", "Rapture", "Unity of Minds", "Radiant Will"],
  },
  hauler: {
    escort: ["Bargain", "Ledger", "Fair Price", "Bounty", "Venture", "Brine Purse", "Dividend", "Haggler", "Tidewater", "Coin Toad"],
    capital: ["Strongbox", "Bullion", "Marsh Trader", "Profit Margin", "Grand Ledger", "Clan Fortune", "Golden Tide", "Merchant Prince", "Treasury", "Monopoly"],
  },
  hive: {
    escort: ["Drone", "Stinger", "Larva", "Mandible", "Chitin", "Swarmling", "Antenna", "Mite", "Pincer", "Wasp"],
    capital: ["Hive Mother", "Brood", "Carapace", "Queenguard", "Nest", "Thorax", "Swarm", "Broodmaw", "Overmind", "Great Hive"],
  },
  lattice: {
    escort: ["Servo", "Vector", "Iterator", "Integer", "Subroutine", "Relay", "Cipher", "Kernel", "Bitstream", "Unit Seven"],
    capital: ["Protocol", "Mainframe", "Compiler", "Axiom", "Overclock", "Prime Directive", "Root Process", "Supercluster", "Singularity", "Archive Core"],
  },
  fang: {
    escort: ["Fang", "Pounce", "Prowler", "Clawstrike", "Stalker", "Ambush", "Whisker", "Sabre", "Swipe", "Hunter"],
    capital: ["Pride", "Bloodmane", "Roar", "Lionheart", "Alpha", "Great Hunt", "Warmane", "Pride Mother", "Savage Crown", "Apex"],
  },
  spire: {
    escort: ["Footnote", "Theorem", "Postulate", "Hypothesis", "Thesis", "Proof", "Corollary", "Lemma", "Scholium", "Quill"],
    capital: ["Treatise", "Lexicon", "Codex", "Erudite", "Archivist", "Grand Library", "Encyclopedia", "First Principle", "Dissertation", "Magnum Opus"],
  },
  drill: {
    escort: ["Burrower", "Tunneler", "Sandviper", "Scale", "Crag", "Cold Blood", "Digger", "Fangdelve", "Rockslither", "Pitviper"],
    capital: ["Basilisk", "Deepdelve", "Molten Coil", "Earthmaw", "Ironscale", "Wyrm", "Undermountain", "Great Burrow", "Magma Serpent", "Old Coil"],
  },
  shard: {
    escort: ["Quartz", "Shale", "Slate", "Flint", "Geode", "Feldspar", "Pebble", "Mica", "Garnet", "Jasper"],
    capital: ["Monolith", "Granite", "Obsidian", "Basalt", "Bedrock", "Crystal Lattice", "Cairn", "Mountain Heart", "Diamond Throne", "Old Stone"],
  },
  manta: {
    escort: ["Tide", "Riptide", "Undertow", "Ripple", "Brine Song", "Kelp Whisper", "Current", "Spray", "Wavecrest", "Shoal"],
    capital: ["Leviathan", "Deep Current", "Pearl Dream", "Abyss Seer", "Coral Oracle", "Moonwater", "Maelstrom", "Great Tide", "Ocean Mind", "Tidemother"],
  },
};
