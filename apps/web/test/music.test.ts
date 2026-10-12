import { describe, expect, it } from "vitest";
import { AudioDirector, type AudioEnv, type MusicTrack } from "../src/audio/sound";

class FakeTrack implements MusicTrack {
  loop = false;
  volume = 1;
  paused = true;
  plays = 0;
  /** Whether play() is allowed, like a browser before or after a gesture. */
  allowed: () => boolean;
  private handlers: Record<string, (() => void)[]> = {};
  constructor(public src: string, allowed: () => boolean) {
    this.allowed = allowed;
  }
  play(): Promise<void> {
    this.plays++;
    if (!this.allowed()) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    this.emit("playing");
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.handlers[type] ??= []).push(fn);
  }
  emit(type: string): void {
    if (type === "ended" || type === "error") this.paused = true;
    for (const fn of this.handlers[type] ?? []) fn();
  }
}

function setup() {
  const tracks: FakeTrack[] = [];
  const handlers: Record<string, (() => void)[]> = {};
  const timers: (() => void)[] = [];
  const state = { allowed: true, visible: true };
  const env: AudioEnv = {
    createTrack: (src) => {
      const t = new FakeTrack(src, () => state.allowed);
      tracks.push(t);
      return t;
    },
    events: { addEventListener: (type: string, fn: () => void) => (handlers[type] ??= []).push(fn) } as never,
    isVisible: () => state.visible,
    setTimeout: (fn) => timers.push(fn),
    now: () => 0,
    nextFrame: () => {},
  };
  const fire = (type: string) => handlers[type]?.forEach((fn) => fn());
  return { director: new AudioDirector(env), tracks, timers, state, fire };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("background music", () => {
  it("moves on to the next galaxy track on the same element when one ends", () => {
    const { director, tracks } = setup();
    director.setMood("galaxy");
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.src).toBe("audio/galaxy-1.mp3");
    tracks[0]!.emit("ended");
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.src).toBe("audio/galaxy-2.mp3");
    expect(tracks[0]!.paused).toBe(false);
    tracks[0]!.emit("ended");
    expect(tracks[0]!.src).toBe("audio/galaxy-1.mp3");
    expect(tracks[0]!.paused).toBe(false);
  });

  it("restarts music on any later click or key when the browser refused or paused it", async () => {
    const { director, tracks, state, fire } = setup();
    state.allowed = false;
    director.setMood("galaxy");
    await flush();
    expect(tracks[0]!.paused).toBe(true);
    state.allowed = true;
    fire("pointerdown");
    expect(tracks[0]!.paused).toBe(false);

    // Mid game: the browser pauses or refuses the next track; the next click brings it back.
    state.allowed = false;
    tracks[0]!.emit("ended");
    await flush();
    expect(tracks[0]!.paused).toBe(true);
    state.allowed = true;
    fire("keydown");
    expect(tracks[0]!.paused).toBe(false);

    tracks[0]!.pause();
    state.visible = false;
    fire("visibilitychange");
    expect(tracks[0]!.paused).toBe(true);
    state.visible = true;
    fire("visibilitychange");
    expect(tracks[0]!.paused).toBe(false);
  });

  it("retries after a track fails to load instead of going silent", () => {
    const { director, tracks, timers } = setup();
    director.setMood("galaxy");
    tracks[0]!.emit("error");
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(tracks[0]!.src).toBe("audio/galaxy-2.mp3");
    expect(tracks[0]!.paused).toBe(false);
  });

  it("stays quiet after a one-shot victory tune ends", () => {
    const { director, tracks, fire } = setup();
    director.setMood("victory");
    tracks[0]!.emit("ended");
    fire("pointerdown");
    expect(tracks[0]!.paused).toBe(true);
  });

  it("hands back the previous mood so a battle can restore it", () => {
    const { director } = setup();
    director.setMood("defeat");
    expect(director.setMood("combat")).toBe("defeat");
    expect(director.getMood()).toBe("combat");
  });
});
