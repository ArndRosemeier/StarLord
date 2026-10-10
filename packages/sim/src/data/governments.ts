import type { Government } from "./races.js";

export interface GovernmentDef {
  name: string;
  foodMult: number;
  industryMult: number;
  researchMult: number;
  bcMult: number;
  shipCostMult: number;
}

export const GOVERNMENTS: Record<Government, GovernmentDef> = {
  feudal: { name: "Feudal", foodMult: 1, industryMult: 1, researchMult: 0.5, bcMult: 1, shipCostMult: 0.67 },
  dictatorship: { name: "Dictatorship", foodMult: 1, industryMult: 1, researchMult: 1, bcMult: 1, shipCostMult: 1 },
  democracy: { name: "Democracy", foodMult: 1, industryMult: 1, researchMult: 1.2, bcMult: 1.5, shipCostMult: 1 },
  unification: { name: "Unification", foodMult: 1.25, industryMult: 1.25, researchMult: 1, bcMult: 1, shipCostMult: 1 },
};
