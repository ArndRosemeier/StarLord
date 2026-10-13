import type { Colony } from "@starlord/sim";

export type Job = "farmers" | "workers" | "scientists";
export type Jobs = Record<Job, number>;
export const JOBS: readonly Job[] = ["farmers", "workers", "scientists"];

/**
 * How many people a grab on a job row picks up, like MoO2: the icon grabbed
 * and every icon to its right. `index` counts icons from the left (0 based).
 * Natives only farm, so they never leave the farmers row.
 */
export function grabCount(colony: Colony, job: Job, index: number): number {
  const movable = job === "farmers" ? colony.farmers - (colony.natives ?? 0) : colony[job];
  return Math.max(0, Math.min(movable, colony[job] - index));
}

/** The jobs after moving `count` people from one row to another; null if nothing changes. */
export function movedJobs(colony: Colony, from: Job, to: Job, count: number): Jobs | null {
  if (from === to || count <= 0) return null;
  const jobs: Jobs = { farmers: colony.farmers, workers: colony.workers, scientists: colony.scientists };
  const n = Math.min(count, from === "farmers" ? jobs.farmers - (colony.natives ?? 0) : jobs[from]);
  if (n <= 0) return null;
  jobs[from] -= n;
  jobs[to] += n;
  return jobs;
}
