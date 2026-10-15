import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ENTRY_NAME, RELEASES, VERSION, parseChangelog } from "../src/changelog/changelog";

describe("changelog", () => {
  it("numbers builds by entry order, newest first", () => {
    const r = parseChangelog({
      "./entries/2026-10-12-0900-b.md": "# Second\n- two",
      "./entries/2026-10-11-0622-a.md": "- one\n- more",
    });
    expect(r.map((x) => x.version)).toEqual(["0.002", "0.001"]);
    expect(r[0]).toMatchObject({ title: "Second", date: "2026-10-12", notes: ["two"] });
    expect(r[1]!.notes).toEqual(["one", "more"]);
  });

  it("lets a milestone entry pin its version and counts on from it", () => {
    const r = parseChangelog({
      "./entries/2026-10-11-0622-a.md": "- one",
      "./entries/2026-10-12-0900-b.md": "# Big one\nVersion: 1.000\n- two",
      "./entries/2026-10-13-0900-c.md": "- three",
    });
    expect(r.map((x) => x.version)).toEqual(["1.001", "1.000", "0.001"]);
    expect(r[1]).toMatchObject({ title: "Big one", notes: ["two"] });
  });

  it("has one well-formed entry per build", () => {
    const files = readdirSync(join(__dirname, "../src/changelog/entries"));
    for (const f of files) expect(f, `bad changelog file name ${f}`).toMatch(ENTRY_NAME);
    expect(RELEASES).toHaveLength(files.length);
    for (const r of RELEASES) expect(r.notes.length, `${r.file} has no "- " lines`).toBeGreaterThan(0);
    // Version 1.000 is pinned by the galaxy map glowup entry; every build after it adds 0.001.
    const milestone = files.sort().findIndex((f) => f.endsWith("-galaxy-map-glowup.md"));
    expect(milestone).toBeGreaterThanOrEqual(0);
    expect(VERSION).toBe((1 + (files.length - 1 - milestone) / 1000).toFixed(3));
  });
});
