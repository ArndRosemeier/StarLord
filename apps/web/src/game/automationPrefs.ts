import { ALL_DOMAINS, STRATEGIES, type AutomationDomain } from "@starlord/ai";
import type { Command, Player } from "@starlord/sim";

/** The player's automation choices, kept in this browser so the next game starts the same way. */

const KEY = "starlord.automation";

interface AutomationPrefs {
  domains: AutomationDomain[];
  strategies: Partial<Record<AutomationDomain, string>>;
}

const isDomain = (d: unknown): d is AutomationDomain => typeof d === "string" && (ALL_DOMAINS as string[]).includes(d);

export function saveAutomationPrefs(player: Player): void {
  const prefs: AutomationPrefs = {
    domains: player.automation.filter(isDomain),
    strategies: Object.fromEntries(Object.entries(player.automationStrategies ?? {}).filter(([d]) => isDomain(d))),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the choices still apply to this game.
  }
}

function loadAutomationPrefs(): AutomationPrefs | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AutomationPrefs> | null;
    if (!raw || typeof raw !== "object") return null;
    const domains = Array.isArray(raw.domains) ? raw.domains.filter(isDomain) : [];
    const strategies: AutomationPrefs["strategies"] = {};
    for (const [d, s] of Object.entries(raw.strategies ?? {})) {
      if (isDomain(d) && STRATEGIES[d].some((x) => x.id === s)) strategies[d] = s;
    }
    return { domains, strategies };
  } catch {
    return null;
  }
}

/** Orders that set a new game's automation to the player's last choices; none when nothing was saved yet. */
export function savedAutomationOrders(): Command[] {
  const prefs = loadAutomationPrefs();
  if (!prefs) return [];
  const out: Command[] = [];
  if (prefs.domains.length > 0) out.push({ type: "setAutomation", domains: prefs.domains });
  for (const [domain, strategy] of Object.entries(prefs.strategies)) {
    if (strategy !== "balanced") out.push({ type: "setAutomationStrategy", domain, strategy });
  }
  return out;
}
