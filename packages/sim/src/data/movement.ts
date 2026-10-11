/** Galaxy-map movement and detection numbers. */

/** Jump Gates add this many parsecs per turn to moves between two of your own colony systems. */
export const JUMP_GATE_BONUS = 3;
/** Ships inside a nebula crawl at this speed. */
export const NEBULA_SPEED = 1;
/** Movement is integrated in steps this long (parsecs), so nebulae and interdictor fields slow only the part of a move inside them. */
export const MOVE_STEP = 0.1;

/**
 * Communication techs let you redirect fleets already in hyperspace: within
 * this many parsecs of one of your orbital bases (Tachyon 3, Subspace 6) or
 * anywhere (Hyperspace). Without one a fleet in flight must finish its trip.
 */
export const COMM_REDIRECT_RANGE: { tech: string; range: number }[] = [
  { tech: "tachyonCommunications", range: 3 },
  { tech: "subspaceCommunications", range: 6 },
  { tech: "hyperspaceCommunications", range: Infinity },
];


/** Fleets are seen this many parsecs further per size class of their largest ship above a frigate. */
export const TRANSIT_DETECTION_PER_SIZE = 1;
/** A Battle Scanner adds this to the scanner range of the fleet carrying it. */
export const BATTLE_SCANNER_RANGE = 2;
