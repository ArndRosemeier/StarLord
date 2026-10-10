import type { AdvancedGovernment } from "../types.js";
import type { Government } from "./races.js";

export interface GovernmentDef {
  name: string;
  foodMult: number;
  industryMult: number;
  researchMult: number;
  /** Multiplies all BC a colony earns: population tax, industry tax and trade goods. */
  bcMult: number;
  shipCostMult: number;
  /** Multiplies the empire's total command points. */
  commandPointsMult: number;
  /** Base morale percent. */
  morale: number;
  /** Morale penalty for colonies without a Marine or Armor Barracks. */
  ungarrisonedPenalty: number;
  /** Morale cannot change at all: no buildings, techs, leaders or penalties count. */
  noMorale: boolean;
  /** Morale penalty on every colony while the empire has lost its Capitol; 0 means no capital is needed. */
  capitalLossMorale: number;
  /** Turns to assimilate one unit of conquered population. */
  assimilationTurns: number;
  /** Populations taken from this empire join the conqueror at once. */
  assimilatesInstantly: boolean;
  /** Spy defense bonus, in levels of 10 on the d100 roll. */
  security: number;
  advanced: AdvancedGovernment | null;
}

/** The four basic governments and their advanced forms, as in the original. */
export const GOVERNMENTS: Record<Government | AdvancedGovernment, GovernmentDef> = {
  feudal: {
    name: "Feudal", foodMult: 1, industryMult: 1, researchMult: 0.5, bcMult: 1, shipCostMult: 2 / 3, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 20, noMorale: false, capitalLossMorale: 50, assimilationTurns: 8, assimilatesInstantly: true,
    security: 0, advanced: "confederation",
  },
  dictatorship: {
    name: "Dictatorship", foodMult: 1, industryMult: 1, researchMult: 1, bcMult: 1, shipCostMult: 1, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 20, noMorale: false, capitalLossMorale: 35, assimilationTurns: 8, assimilatesInstantly: false,
    security: 1, advanced: "imperium",
  },
  democracy: {
    name: "Democracy", foodMult: 1, industryMult: 1, researchMult: 1.5, bcMult: 1.5, shipCostMult: 1, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 0, noMorale: false, capitalLossMorale: 20, assimilationTurns: 4, assimilatesInstantly: false,
    security: -1, advanced: "federation",
  },
  unification: {
    name: "Unification", foodMult: 1.5, industryMult: 1.5, researchMult: 1, bcMult: 1, shipCostMult: 1, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 0, noMorale: true, capitalLossMorale: 0, assimilationTurns: 20, assimilatesInstantly: false,
    security: 1.5, advanced: "galacticUnification",
  },
  confederation: {
    name: "Confederation", foodMult: 1, industryMult: 1, researchMult: 0.5, bcMult: 1, shipCostMult: 1 / 3, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 20, noMorale: false, capitalLossMorale: 50, assimilationTurns: 4, assimilatesInstantly: false,
    security: 0, advanced: null,
  },
  imperium: {
    name: "Imperium", foodMult: 1, industryMult: 1, researchMult: 1, bcMult: 1, shipCostMult: 1, commandPointsMult: 1.5,
    morale: 20, ungarrisonedPenalty: 20, noMorale: false, capitalLossMorale: 35, assimilationTurns: 4, assimilatesInstantly: false,
    security: 2, advanced: null,
  },
  federation: {
    name: "Federation", foodMult: 1, industryMult: 1, researchMult: 1.75, bcMult: 1.75, shipCostMult: 1, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 0, noMorale: false, capitalLossMorale: 35, assimilationTurns: 2, assimilatesInstantly: false,
    security: -1, advanced: null,
  },
  galacticUnification: {
    name: "Galactic Unification", foodMult: 2, industryMult: 2, researchMult: 1, bcMult: 1, shipCostMult: 1, commandPointsMult: 1,
    morale: 0, ungarrisonedPenalty: 0, noMorale: true, capitalLossMorale: 0, assimilationTurns: 15, assimilatesInstantly: false,
    security: 1.5, advanced: null,
  },
};

/** Conquest and assimilation numbers. */
export const ASSIMILATION = {
  /** Unassimilated population produces this share of its normal output. */
  alienOutput: 0.5,
  /** Morale penalty on a colony of another race than its ruler's, unless it has an Alien Management Center. */
  multiRacePenalty: 20,
  /** Charismatic rulers assimilate twice as fast, repulsive ones half as fast. */
  charismaticMult: 0.5,
  repulsiveMult: 2,
  /**
   * Chance per turn and unassimilated unit that the aliens revolt, capped.
   * The original says only that more aliens mean a larger chance.
   */
  revoltChancePerAlien: 0.02,
  revoltChanceMax: 0.3,
} as const;
