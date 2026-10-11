/// <reference lib="webworker" />
import { Simulation, type SimResult } from "@starlord/ai";
import type { NewGameOptions } from "@starlord/sim";

/**
 * Plays one of the simulator's games at a time off the main thread and
 * posts its running result back a few times a second.
 */

export type ToWorker =
  | { type: "play"; index: number; options: NewGameOptions }
  | { type: "pause" }
  | { type: "resume" };

export type FromWorker = { type: "progress"; index: number; result: SimResult; done: boolean };

let index = -1;
let sim: Simulation | null = null;
let paused = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastPost = 0;

function schedule() {
  if (timer === null && !paused && sim) timer = setTimeout(tick, 0);
}

function tick() {
  timer = null;
  if (paused || !sim) return;
  // Play turns for a slice of time, then yield so a pause gets through.
  const start = performance.now();
  while (sim.step() && performance.now() - start < 50);
  if (sim.done || performance.now() - lastPost > 200) {
    lastPost = performance.now();
    postMessage({ type: "progress", index, result: sim.result, done: sim.done } satisfies FromWorker);
  }
  if (sim.done) sim = null;
  else schedule();
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "play") {
    index = m.index;
    sim = new Simulation({ ...m.options, now: () => performance.now() });
    lastPost = 0;
    schedule();
  } else {
    paused = m.type === "pause";
    schedule();
  }
};
