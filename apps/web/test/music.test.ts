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

/** Without a random source the shuffle keeps the listed order: galaxy-1, galaxy-2, ... */
function setup(random: () => number = () => 0.999) {
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
    random,
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
    expect(tracks[0]!.paused).toBe(false);
  });

  it("shuffles the galaxy tracks, playing every one before any repeats and never one twice in a row", () => {
    let seed = 7;
    const { director, tracks } = setup(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
    director.setMood("galaxy");
    const played = [tracks[0]!.src];
    for (let i = 0; i < 69; i++) {
      tracks[0]!.emit("ended");
      played.push(tracks[0]!.src);
    }
    for (let round = 0; round < 10; round++) expect(new Set(played.slice(round * 7, round * 7 + 7)).size).toBe(7);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(played.slice(0, 7)).not.toEqual(played.slice(7, 14));
  });

  it("picks up with a different galaxy track after a battle", () => {
    const { director, tracks } = setup();
    director.setMood("galaxy");
    director.setMood("combat");
    director.setMood("galaxy");
    expect(tracks.map((t) => t.src)).toEqual(["audio/galaxy-1.mp3", "audio/combat.mp3", "audio/galaxy-2.mp3"]);
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

  it("stops the music when the page is hidden or closed and plays it again when shown", () => {
    const { director, tracks, timers, state, fire } = setup();
    director.setMood("galaxy");
    expect(tracks[0]!.paused).toBe(false);

    // A tablet closing the app or sending it to the background hides the page.
    state.visible = false;
    fire("visibilitychange");
    expect(tracks[0]!.paused).toBe(true);
    // Nothing brings it back while hidden: a retry, a mood change, a stray gesture.
    tracks[0]!.emit("error");
    timers[0]!();
    expect(tracks[0]!.paused).toBe(true);
    director.setMood("combat");
    expect(tracks[0]!.paused).toBe(true);
    expect(tracks[0]!.src).toBe("");
    expect(tracks[1]!.paused).toBe(true);
    fire("pointerdown");
    expect(tracks[1]!.paused).toBe(true);
    director.sting("audio/breakthrough-1.mp3");
    expect(tracks).toHaveLength(2);

    state.visible = true;
    fire("visibilitychange");
    expect(tracks[1]!.paused).toBe(false);

    // pagehide (the tab or app closing) silences even while still reported visible.
    fire("pagehide");
    expect(tracks[1]!.paused).toBe(true);
    fire("pageshow");
    expect(tracks[1]!.paused).toBe(false);
  });

  it("silences a track that is still fading out when the page is hidden", () => {
    const { director, tracks, state, fire } = setup();
    director.setMood("galaxy");
    director.setMood("combat");
    // The fade-out runs on animation frames, which never come here (or on a hidden page).
    expect(tracks[0]!.paused).toBe(false);
    state.visible = false;
    fire("visibilitychange");
    expect(tracks[0]!.paused).toBe(true);
    expect(tracks[1]!.paused).toBe(true);
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

describe("music stings", () => {
  /** Fades finish at once: every frame is far past the fade time. */
  function instant() {
    const tracks: FakeTrack[] = [];
    let t = 0;
    const env: AudioEnv = {
      createTrack: (src) => {
        const track = new FakeTrack(src, () => true);
        tracks.push(track);
        return track;
      },
      events: null,
      isVisible: () => true,
      setTimeout: () => {},
      now: () => (t += 10000),
      nextFrame: (fn) => fn(),
    };
    return { director: new AudioDirector(env), tracks };
  }

  it("plays once over the music, ducking it, and brings the music back when done", () => {
    const { director, tracks } = instant();
    director.update({ music: 0.5, muted: false });
    director.setMood("galaxy");
    const music = tracks[0]!;
    expect(music.volume).toBe(0.5);
    director.sting("audio/breakthrough-1.mp3");
    const sting = tracks[1]!;
    expect(sting.src).toBe("audio/breakthrough-1.mp3");
    expect(sting.loop).toBe(false);
    expect(sting.plays).toBe(1);
    expect(sting.volume).toBe(0.5);
    expect(music.volume).toBeCloseTo(0.1);
    sting.emit("ended");
    expect(music.volume).toBe(0.5);
  });

  it("stays silent when music is muted and follows a later mute", () => {
    const { director, tracks } = instant();
    director.update({ music: 0.5, muted: true });
    director.sting("audio/breakthrough-2.mp3");
    expect(tracks).toHaveLength(0);
    director.update({ muted: false });
    director.sting("audio/breakthrough-2.mp3");
    director.update({ muted: true });
    expect(tracks[0]!.volume).toBe(0);
  });
});
