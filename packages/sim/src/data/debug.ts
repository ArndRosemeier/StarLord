/** Numbers for the debug menu (games started with Ctrl+Alt held). */
export const DEBUG = {
  /** BC the "add BC" buttons offer. */
  bcSteps: [100, 1000, 10000],
  /** Research points the "add research" buttons offer. */
  researchSteps: [100, 1000, 10000],
  /** Most ships one spawn order may create. */
  maxSpawn: 50,
  /** Build points handed to the raiders when a raid is forced, enough for a mixed fleet. */
  raidBudget: 60,
  /** Battles the combat lab fights for one setup to add up results. */
  labRuns: 100,
  /** Random matchups the combat lab tests for broken rules. */
  labFuzz: 200,
} as const;
