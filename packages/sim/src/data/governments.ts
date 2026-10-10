import type { AdvancedGovernment } from "../types.js";
import type { Government } from "./races.js";

export interface GovernmentDef {
  name: string;
  foodMult: number;
  industryMult: number;
  researchMult: number;
  bcMult: number;
  shipCostMult: number;
  /** Base morale percent. */
  morale: number;
  /** Morale penalty for colonies without a garrison (marine barracks). */
  ungarrisonedPenalty: number;
  /** Spy defense bonus. */
  security: number;
  advanced: AdvancedGovernment | null;
}

export const GOVERNMENTS: Record<Government | AdvancedGovernment, GovernmentDef> = {
  feudal: { name: "Feudal", foodMult: 1, industryMult: 1, researchMult: 0.67, bcMult: 1, shipCostMult: 0.67, morale: 0, ungarrisonedPenalty: 20, security: 0, advanced: "confederation" },
  dictatorship: { name: "Dictatorship", foodMult: 1, industryMult: 1, researchMult: 1, bcMult: 1, shipCostMult: 1, morale: 0, ungarrisonedPenalty: 20, security: 1, advanced: "imperium" },
  democracy: { name: "Democracy", foodMult: 1, industryMult: 1, researchMult: 1.2, bcMult: 1.5, shipCostMult: 1, morale: 0, ungarrisonedPenalty: 0, security: -1, advanced: "federation" },
  unification: { name: "Unification", foodMult: 1.25, industryMult: 1.25, researchMult: 1, bcMult: 1, shipCostMult: 1, morale: 0, ungarrisonedPenalty: 0, security: 2, advanced: "galacticUnification" },
  confederation: { name: "Confederation", foodMult: 1, industryMult: 1, researchMult: 0.75, bcMult: 1, shipCostMult: 0.5, morale: 10, ungarrisonedPenalty: 0, security: 0, advanced: null },
  imperium: { name: "Imperium", foodMult: 1, industryMult: 1.1, researchMult: 1, bcMult: 1, shipCostMult: 1, morale: 20, ungarrisonedPenalty: 0, security: 2, advanced: null },
  federation: { name: "Federation", foodMult: 1, industryMult: 1, researchMult: 1.4, bcMult: 1.75, shipCostMult: 1, morale: 10, ungarrisonedPenalty: 0, security: 0, advanced: null },
  galacticUnification: { name: "Galactic Unification", foodMult: 1.5, industryMult: 1.5, researchMult: 1, bcMult: 1, shipCostMult: 1, morale: 0, ungarrisonedPenalty: 0, security: 3, advanced: null },
};
