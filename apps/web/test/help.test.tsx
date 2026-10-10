import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TECHS } from "@starlord/sim";
import { ENTRIES, ENTRIES_BY_ID, searchEntries } from "../src/help/entries";
import { Article, PAGE_IDS } from "../src/help/articles";

describe("encyclopedia", () => {
  it("has unique page ids and a page for every tech", () => {
    expect(ENTRIES_BY_ID.size).toBe(ENTRIES.length);
    for (const id of Object.keys(TECHS)) expect(ENTRIES_BY_ID.has(`tech:${id}`), id).toBe(true);
    for (const e of ENTRIES.filter((x) => x.id.startsWith("page:"))) expect(PAGE_IDS).toContain(e.id.slice(5));
  });

  it("renders every page without broken links", () => {
    for (const e of ENTRIES) {
      const html = renderToStaticMarkup(<Article id={e.id} />);
      expect(html, e.id).toContain(e.title.replace(/&/g, "&amp;"));
      expect(html, `${e.id} links to a missing page`).not.toContain("help-missing");
    }
  });

  it("finds pages by name and keyword", () => {
    expect(searchEntries("laser").slice(0, 3).map((e) => e.id)).toEqual(expect.arrayContaining(["tech:laserCannon", "weapon:laserCannon"]));
    expect(searchEntries("fusion beam").map((e) => e.id)).toContain("tech:fusionBeam");
    expect(searchEntries("bankrupt").map((e) => e.id)).toContain("guide:economy");
    expect(searchEntries("")).toEqual([]);
  });
});
