import type { SimResult } from "@starlord/ai";
import type { NewGameOptions } from "@starlord/sim";
import type { FromWorker, ToWorker } from "./simWorker";

/**
 * The debug menu's simulator: a batch of all-AI games played by a few web
 * workers side by side. It lives outside React so a run keeps going while
 * the menu is closed, until the page is reloaded.
 */

export interface SimGame {
  options: NewGameOptions;
  result: SimResult | null;
  /** Being played right now. */
  playing: boolean;
}

export interface SimRun {
  games: SimGame[];
  state: "idle" | "running" | "paused" | "finished" | "stopped";
  /** Games played side by side. */
  workers: number;
}

/** Leave a core for the page itself; more than four rarely helps. */
export const SIM_WORKERS = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

let run: SimRun = { games: [], state: "idle", workers: SIM_WORKERS };
let workers: Worker[] = [];
let next = 0;
const listeners = new Set<() => void>();

function set(next: SimRun) {
  run = next;
  for (const fn of listeners) fn();
}

function update(index: number, change: Partial<SimGame>) {
  const games = run.games.slice();
  games[index] = { ...games[index]!, ...change };
  set({ ...run, games });
}

/** Hands the worker the next waiting game, or retires it when none is left. */
function feed(w: Worker) {
  if (next >= run.games.length) {
    w.terminate();
    workers = workers.filter((x) => x !== w);
    if (workers.length === 0) set({ ...run, state: "finished" });
    return;
  }
  const index = next++;
  w.postMessage({ type: "play", index, options: run.games[index]!.options } satisfies ToWorker);
  update(index, { playing: true });
}

function spawn(): Worker {
  const w = new Worker(new URL("./simWorker.ts", import.meta.url), { type: "module" });
  let current = -1;
  w.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    current = m.index;
    update(m.index, { result: m.result, playing: !m.done });
    if (m.done) feed(w);
  };
  w.onerror = (e) => {
    // Crashes inside a turn are caught by the simulation; this is the worker itself failing.
    e.preventDefault();
    const prev = run.games[current]?.result;
    if (prev) update(current, { playing: false, result: { ...prev, crashed: true, problems: [...prev.problems, { turn: prev.turns, kind: "crash", message: e.message }] } });
    feed(w);
  };
  return w;
}

function stopAll() {
  for (const w of workers) w.terminate();
  workers = [];
}

export const simRunner = {
  get(): SimRun {
    return run;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  start(games: NewGameOptions[]) {
    stopAll();
    next = 0;
    set({ games: games.map((options) => ({ options, result: null, playing: false })), state: "running", workers: SIM_WORKERS });
    workers = Array.from({ length: Math.min(SIM_WORKERS, games.length) }, spawn);
    for (const w of workers) feed(w);
  },
  pause() {
    for (const w of workers) w.postMessage({ type: "pause" } satisfies ToWorker);
    set({ ...run, state: "paused" });
  },
  resume() {
    for (const w of workers) w.postMessage({ type: "resume" } satisfies ToWorker);
    set({ ...run, state: "running" });
  },
  stop() {
    stopAll();
    set({ ...run, state: "stopped", games: run.games.map((g) => ({ ...g, playing: false })) });
  },
};
