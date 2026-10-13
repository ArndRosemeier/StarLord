import { describe, expect, it } from "vitest";
import type { Colony } from "@starlord/sim";
import { grabCount, movedJobs } from "../src/screens/jobDrag";

const colony = (farmers: number, workers: number, scientists: number, natives = 0) =>
  ({ farmers, workers, scientists, natives }) as unknown as Colony;

describe("dragging people between jobs", () => {
  it("grabs the icon and every icon to its right", () => {
    const c = colony(2, 6, 1);
    expect(grabCount(c, "workers", 5)).toBe(1); // rightmost
    expect(grabCount(c, "workers", 2)).toBe(4); // 4th from the right
    expect(grabCount(c, "workers", 0)).toBe(6);
    expect(movedJobs(c, "workers", "scientists", 4)).toEqual({ farmers: 2, workers: 2, scientists: 5 });
  });

  it("never moves natives out of farming", () => {
    const c = colony(5, 1, 0, 3);
    expect(grabCount(c, "farmers", 0)).toBe(2);
    expect(movedJobs(c, "farmers", "workers", 5)).toEqual({ farmers: 3, workers: 3, scientists: 0 });
    expect(movedJobs(colony(3, 1, 0, 3), "farmers", "workers", 1)).toBeNull();
  });

  it("does nothing when dropped back on its own row", () => {
    expect(movedJobs(colony(1, 1, 1), "workers", "workers", 1)).toBeNull();
  });
});
