/**
 * Where online games are hosted: Arnd's GameHub relay (games.futuremagic.de).
 *
 * The app key is not a secret: it only says "this is StarLord" and ships in every bundle, as with
 * the other GameHub games. A build can override it with VITE_GAMEHUB_KEY (and the server with
 * VITE_GAMEHUB_URL); otherwise the committed key is used.
 */
const COMMITTED_KEY = "ghk_starlord_wULAPJKuAXZL3RSGKX7elNq3pTs2xqK5";

type ViteEnv = { VITE_GAMEHUB_URL?: string; VITE_GAMEHUB_KEY?: string };
const env: ViteEnv = (import.meta as unknown as { env?: ViteEnv }).env ?? {};

export const GAMEHUB = {
  url: env.VITE_GAMEHUB_URL || "https://games.futuremagic.de",
  app: "starlord",
  appKey: env.VITE_GAMEHUB_KEY || COMMITTED_KEY,
};
