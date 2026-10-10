import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });

describe("React effects", () => {
  // An effect whose arrow body is an expression returns that value as its cleanup. Browser APIs
  // such as scrollTo now return Promises, so React calls a non-function and the app goes blank.
  it("never return a value by accident", () => {
    const bad = files(join(__dirname, "../src")).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").map((line, i) => ({ f, i, line }))
        .filter(({ line }) => /use(Layout)?Effect\(\(\) => [^{(]/.test(line)),
    );
    expect(bad.map(({ f, i }) => `${f}:${i + 1}`)).toEqual([]);
  });
});
