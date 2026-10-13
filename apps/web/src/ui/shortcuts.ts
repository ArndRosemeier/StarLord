/**
 * Keyboard shortcuts of the game screens, after the original's one-letter
 * screen keys. Each one also has a button on screen, for touch players.
 */

/** Screens a letter opens; the names match GameShell's tabs. */
export type ShortcutTab =
  | "map" | "colonies" | "planets" | "research" | "designs" | "fleets" | "diplomacy" | "espionage" | "leaders" | "empire" | "events" | "game";

export type ShortcutAction =
  | { kind: "tab"; tab: ShortcutTab }
  | { kind: "nextIdleFleet" }
  | { kind: "nextColony" };

export interface Shortcut {
  /** Key as `KeyboardEvent.key`, lower case for letters. */
  key: string;
  /** How the key is written in the list. */
  label: string;
  what: string;
  action: ShortcutAction;
}

const tab = (key: string, t: ShortcutTab, what: string): Shortcut => ({ key, label: key.toUpperCase(), what, action: { kind: "tab", tab: t } });

export const SHORTCUTS: Shortcut[] = [
  tab("m", "map", "Galaxy map"),
  tab("c", "colonies", "Colonies"),
  tab("p", "planets", "Planets (colony and outpost targets)"),
  tab("t", "research", "Research (technology)"),
  tab("d", "designs", "Ship design"),
  tab("f", "fleets", "Fleets"),
  tab("l", "leaders", "Leaders"),
  tab("r", "diplomacy", "Diplomacy (races)"),
  tab("s", "espionage", "Espionage (spies)"),
  tab("i", "empire", "Empire & automation (info)"),
  tab("e", "events", "Turn report (events)"),
  tab("g", "game", "Game menu, saves and settings"),
  { key: "n", label: "N", what: "Next idle fleet on the map", action: { kind: "nextIdleFleet" } },
  { key: ".", label: ".", what: "Next colony on the map", action: { kind: "nextColony" } },
];

/** Shortcuts handled elsewhere, listed with the rest. */
export const OTHER_KEYS: { label: string; what: string }[] = [
  { label: "Ctrl+Enter", what: "End the turn" },
  { label: "Esc", what: "Close a window; on the map, deselect fleets; elsewhere, back to the galaxy map" },
  { label: "F1", what: "Encyclopedia" },
  { label: "Shift+click", what: "Select several fleets on the map" },
];

/** True while the player types into a field, where letters must not trigger shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (el.isContentEditable || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !["checkbox", "radio", "range", "button", "submit", "reset", "color", "file"].includes(el.type ?? "text");
}

/** The shortcut a key press asks for; none with Ctrl, Alt or Meta held or while typing. */
export function shortcutFor(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "target">): Shortcut | undefined {
  if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return undefined;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return SHORTCUTS.find((s) => s.key === key);
}
