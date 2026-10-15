import { describe, expect, it } from "vitest";
import { borderSegments, chainSegments, computeTerritory, gridToGalaxy } from "../src/map/territory";

const ownerAt = (t: ReturnType<typeof computeTerritory>, x: number, y: number) => {
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const p = gridToGalaxy(t, i, j);
      if (Math.abs(p.x - x) < t.cell / 2 && Math.abs(p.y - y) < t.cell / 2) return t.empires[t.owner[j * t.cols + i]!] ?? null;
    }
  }
  throw new Error("off grid");
};

describe("empire territory", () => {
  it("claims space around colonised stars only", () => {
    const t = computeTerritory([{ x: 5, y: 5, owners: ["#f00"] }, { x: 15, y: 5, owners: [] }], 20, 10);
    expect(t.empires).toEqual(["#f00"]);
    expect(ownerAt(t, 5, 5)).toBe("#f00");
    expect(ownerAt(t, 7, 5)).toBe("#f00");
    expect(ownerAt(t, 8, 5)).toBeNull();
    expect(ownerAt(t, 15, 5)).toBeNull();
  });

  it("splits contested space at the stronger pull", () => {
    const t = computeTerritory([
      { x: 4, y: 5, owners: ["#f00"] },
      { x: 3, y: 4, owners: ["#f00"] },
      { x: 8, y: 5, owners: ["#00f"] },
    ], 12, 10);
    expect(ownerAt(t, 5.5, 5)).toBe("#f00");
    expect(ownerAt(t, 7.5, 5)).toBe("#00f");
  });

  it("draws one closed border around a lone colony", () => {
    const t = computeTerritory([{ x: 5, y: 5, owners: ["#f00"] }], 10, 10);
    const lines = chainSegments(borderSegments(t, 0));
    expect(lines).toHaveLength(1);
    const l = lines[0]!;
    // Closed: it ends where it starts, and every point sits roughly 2.2 parsecs out.
    expect(Math.hypot(l[0]! - l[l.length - 2]!, l[1]! - l[l.length - 1]!)).toBeLessThan(1e-6);
    for (let k = 0; k < l.length; k += 2) expect(Math.hypot(l[k]! - 5, l[k + 1]! - 5)).toBeCloseTo(2.2, 0);
  });
});
