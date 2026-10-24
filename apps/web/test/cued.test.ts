import { describe, expect, it, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { CuedPassError, cuedPassFromHash, decodeCuedPass, hashWithoutCuedPass, isCuedPassExpired, loadCuedSession } from "../src/net/cued";

/** Builds a pass exactly as cued does (HS256, compact JSON, base64url without padding). */
function makePass(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }): string {
  const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");
  const head = b64(JSON.stringify(header));
  const body = b64(JSON.stringify(claims));
  const sig = createHmac("sha256", "test-key").update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const CLAIMS = {
  iss: "cued", aud: "starlord", iat: 1000, exp: 1000 + 6 * 3600, sub: "7",
  name: "Arnd Ü", kuerzel: "A", hg: "rgb(31, 58, 50)", schrift: "rgb(124, 240, 208)", bild: "", raum: null,
  cued: "https://cued.de/",
};

describe("cued pass", () => {
  it("reads every claim, including non-ASCII names and a missing avatar", () => {
    const id = decodeCuedPass(makePass(CLAIMS));
    expect(id).toMatchObject({ playerId: "7", name: "Arnd Ü", initials: "A", avatarUrl: null, game: "starlord", room: null, portalUrl: "https://cued.de/" });
    expect(id.circle).toEqual({ background: "rgb(31, 58, 50)", text: "rgb(124, 240, 208)" });
  });

  it("keeps an avatar URL and a room id", () => {
    const id = decodeCuedPass(makePass({ ...CLAIMS, bild: "https://cued.de/gast/bild/x/", raum: "r1" }));
    expect(id.avatarUrl).toBe("https://cued.de/gast/bild/x/");
    expect(id.room).toBe("r1");
  });

  it("fails loudly on malformed passes", () => {
    expect(() => decodeCuedPass("not-a-jwt")).toThrow(CuedPassError);
    expect(() => decodeCuedPass("a.b.c")).toThrow(CuedPassError);
    expect(() => decodeCuedPass(makePass({ ...CLAIMS, iss: "elsewhere" }))).toThrow(/issuer/);
    expect(() => decodeCuedPass(makePass({ ...CLAIMS, name: "" }))).toThrow(/"name"/);
    expect(() => decodeCuedPass(makePass(CLAIMS, { alg: "none" }))).toThrow(/HS256/);
  });

  it("expires at exp", () => {
    const id = decodeCuedPass(makePass(CLAIMS));
    expect(isCuedPassExpired(id, CLAIMS.exp - 1)).toBe(false);
    expect(isCuedPassExpired(id, CLAIMS.exp)).toBe(true);
  });

  it("finds the pass among other fragment keys and strips only it", () => {
    expect(cuedPassFromHash("")).toBeNull();
    expect(cuedPassFromHash("#detail=1&cued=abc.def.ghi")).toBe("abc.def.ghi");
    expect(hashWithoutCuedPass("#detail=1&cued=abc.def.ghi")).toBe("#detail=1");
  });

  describe("in the page", () => {
    const g = globalThis as { window?: unknown };
    afterEach(() => { delete g.window; });
    function page(hash: string, search = "?room=K7Q2ZP") {
      const store = new Map<string, string>();
      const w = {
        location: { pathname: "/starlord/", search, hash },
        history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { w.location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : ""; w.url = url; } },
        sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
        url: "",
      };
      g.window = w;
      return w;
    }

    it("reads the pass once, removes it from the address and keeps it for later loads in the tab", () => {
      const w = page(`#cued=${makePass(CLAIMS)}`);
      expect(loadCuedSession("starlord.cued-pass", 2000)?.identity.name).toBe("Arnd Ü");
      expect(w.url).toBe("/starlord/?room=K7Q2ZP");
      expect(loadCuedSession("starlord.cued-pass", 2000)?.expired).toBe(false);
    });

    it("leaves a game opened without a pass alone", () => {
      page("");
      expect(loadCuedSession("starlord.cued-pass")).toBeNull();
    });
  });
});
