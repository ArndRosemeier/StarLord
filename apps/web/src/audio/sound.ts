import { useSyncExternalStore } from "react";

/**
 * Music and sound effects. Music tracks are generated mp3s in public/audio and
 * crossfade when the mood changes; effects are synthesised with WebAudio so
 * they cost no downloads. Browsers only allow sound after the first click or
 * key press, so playback starts (or resumes) on the first gesture.
 */
export type Mood = "menu" | "galaxy" | "combat" | "victory" | "defeat" | "none";
export type Effect = "click" | "select" | "turn" | "alert" | "fanfare" | "boom" | "zap" | "warp" | "sparkle";

const PLAYLISTS: Record<Exclude<Mood, "none">, { tracks: string[]; loop: boolean }> = {
  menu: { tracks: ["audio/menu.mp3"], loop: true },
  galaxy: { tracks: [1, 2, 3, 4, 5, 6, 7].map((n) => `audio/galaxy-${n}.mp3`), loop: true },
  combat: { tracks: ["audio/combat.mp3"], loop: true },
  victory: { tracks: ["audio/victory.mp3"], loop: false },
  defeat: { tracks: ["audio/defeat.mp3"], loop: false },
};
const FADE_MS = 1200;
/** Share of the music volume the background keeps while a sting plays over it. */
const STING_DUCK = 0.2;

export interface AudioSettings {
  music: number;
  effects: number;
  muted: boolean;
}

const STORAGE_KEY = "starlord.audio";
const DEFAULTS: AudioSettings = { music: 0.5, effects: 0.6, muted: false };

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** The slice of HTMLAudioElement the music player uses, so tests can drive it with a fake. */
export interface MusicTrack {
  src: string;
  loop: boolean;
  volume: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error" | "playing", fn: () => void): void;
}

/** Browser hooks the director needs; tests pass fakes. */
export interface AudioEnv {
  createTrack(src: string): MusicTrack;
  /** Gesture, visibility and page lifecycle events; null when there is no window (tests, SSR). */
  events: Pick<Window, "addEventListener"> | null;
  isVisible(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  now(): number;
  nextFrame(fn: () => void): void;
  /** A number in [0, 1) for shuffling playlists; Math.random when left out. */
  random?(): number;
}

function browserEnv(): AudioEnv {
  const hasWindow = typeof window !== "undefined";
  return {
    createTrack: (src) => new Audio(src),
    events: hasWindow ? window : null,
    isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    now: () => performance.now(),
    nextFrame: (fn) => requestAnimationFrame(fn),
    random: () => Math.random(),
  };
}

/** Wait before retrying a track that failed to load, doubling up to the cap. */
const RETRY_MS = 2000;
const RETRY_MAX_MS = 30000;

export class AudioDirector {
  settings = loadSettings();
  private listeners = new Set<() => void>();
  private mood: Mood = "none";
  private current: MusicTrack | null = null;
  private trackIndex = 0;
  /** Each playlist plays in a shuffled order and is reshuffled once every track has played. */
  private queues = new Map<Mood, { order: number[]; pos: number }>();
  /** A one-shot playlist (victory, defeat) that has played to its end stays quiet. */
  private finished = false;
  private failures = 0;
  private fades = new WeakMap<MusicTrack, number>();
  private ctx: AudioContext | null = null;
  /** A short piece of music played over the background (a breakthrough fanfare), which ducks the music meanwhile. */
  private stingTrack: MusicTrack | null = null;
  /** Tracks fading out after a mood change; their fade runs on animation frames, which stop while hidden. */
  private leaving = new Set<MusicTrack>();
  /** The page is hidden or being closed: everything stays silent until it is shown again. */
  private hidden = false;

  constructor(private env: AudioEnv = browserEnv()) {
    // Browsers refuse play() until a click or key press, and some (Safari, tablets) refuse it again for a
    // track started outside a gesture, or pause music on their own. Every gesture or return to the tab
    // therefore restarts music that should be playing but is not.
    const resume = () => {
      this.resume();
      void this.ctx?.resume();
    };
    env.events?.addEventListener("pointerdown", resume);
    env.events?.addEventListener("keydown", resume);
    // Tablets keep a page's audio running after the app is closed or sent to the background, so music
    // stops whenever the page is hidden or unloaded and picks up again when it is shown.
    const lifecycle = () => {
      if (env.isVisible()) {
        this.hidden = false;
        resume();
      } else this.silence();
    };
    env.events?.addEventListener("visibilitychange", lifecycle);
    env.events?.addEventListener("pageshow", lifecycle);
    env.events?.addEventListener("pagehide", () => this.silence());
  }

  /** Stop all music and effects at once, without the fade (which would not run while hidden). */
  silence(): void {
    this.hidden = true;
    this.current?.pause();
    for (const track of this.leaving) this.drop(track);
    this.leaving.clear();
    if (this.stingTrack) {
      const sting = this.stingTrack;
      this.stingTrack = null;
      sting.pause();
      if (this.current) {
        this.fades.delete(this.current);
        this.current.volume = this.musicVolume();
      }
    }
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  private drop(track: MusicTrack): void {
    this.fades.delete(track);
    track.pause();
    track.src = "";
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSettings = () => this.settings;

  getMood = () => this.mood;

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Settings just don't persist.
    }
    if (this.current) {
      this.fades.delete(this.current);
      this.current.volume = this.musicVolume() * (this.stingTrack ? STING_DUCK : 1);
    }
    if (this.stingTrack) this.stingTrack.volume = this.musicVolume();
    for (const fn of this.listeners) fn();
  }

  private musicVolume(): number {
    return this.settings.muted ? 0 : this.settings.music;
  }

  /**
   * Switch the background music and return the mood it replaces; the same mood again keeps the current
   * track playing.
   */
  setMood(mood: Mood): Mood {
    const previous = this.mood;
    if (mood === previous) return previous;
    this.mood = mood;
    this.trackIndex = this.nextTrack();
    this.finished = false;
    this.failures = 0;
    this.fadeOut(this.current);
    this.current = null;
    if (mood !== "none") this.start();
    return previous;
  }

  /** Restart music that should be playing but is paused (blocked autoplay, a browser pause). */
  resume(): void {
    const track = this.current;
    if (!track || this.hidden || this.mood === "none" || this.finished || !track.paused) return;
    void track.play().catch(() => {});
  }

  /** Index of the next track in the mood's shuffled order; a new order never starts with the track just played. */
  private nextTrack(): number {
    if (this.mood === "none") return 0;
    const n = PLAYLISTS[this.mood].tracks.length;
    if (n <= 1) return 0;
    let queue = this.queues.get(this.mood);
    if (!queue || queue.pos >= n) {
      const random = this.env.random ?? Math.random;
      const order = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const last = queue?.order[n - 1];
      if (order[0] === last) [order[0], order[n - 1]] = [order[n - 1]!, order[0]!];
      queue = { order, pos: 0 };
      this.queues.set(this.mood, queue);
    }
    return queue.order[queue.pos++]!;
  }

  private trackSrc(): string {
    const list = PLAYLISTS[this.mood as Exclude<Mood, "none">];
    return list.tracks[this.trackIndex]!;
  }

  private start(): void {
    if (this.mood === "none") return;
    const list = PLAYLISTS[this.mood];
    const track = this.env.createTrack(this.trackSrc());
    track.loop = list.loop && list.tracks.length === 1;
    track.volume = 0;
    track.addEventListener("ended", () => {
      if (track !== this.current) return;
      if (!list.loop) {
        this.finished = true;
        return;
      }
      // Next track on the same element: a browser that unlocked it for a gesture keeps it unlocked,
      // whereas a fresh element started from this event can be refused and leave the game silent.
      this.trackIndex = this.nextTrack();
      track.src = this.trackSrc();
      if (!this.hidden) void track.play().catch(() => {});
    });
    track.addEventListener("playing", () => {
      if (track === this.current) this.failures = 0;
    });
    track.addEventListener("error", () => {
      if (track !== this.current) return;
      // A download that failed or broke off: try the next track (or this one again) after a pause.
      const delay = Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** this.failures++);
      this.env.setTimeout(() => {
        if (track !== this.current) return;
        this.trackIndex = this.nextTrack();
        track.src = this.trackSrc();
        if (!this.hidden) void track.play().catch(() => {});
      }, delay);
    });
    this.current = track;
    // Rejected until the first gesture; the gesture listener retries. A hidden page starts it when shown.
    if (!this.hidden) void track.play().catch(() => {});
    this.fade(track, this.musicVolume());
  }

  private fade(track: MusicTrack, to: number, done?: () => void): void {
    const from = track.volume;
    const t0 = this.env.now();
    const id = (this.fades.get(track) ?? 0) + 1;
    this.fades.set(track, id);
    const tick = () => {
      if (this.fades.get(track) !== id) return; // A newer fade on this track took over.
      const k = Math.min(1, (this.env.now() - t0) / FADE_MS);
      track.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) this.env.nextFrame(tick);
      else done?.();
    };
    this.env.nextFrame(tick);
  }

  private fadeOut(track: MusicTrack | null): void {
    if (!track) return;
    if (this.hidden) return this.drop(track);
    this.leaving.add(track);
    this.fade(track, 0, () => {
      this.leaving.delete(track);
      this.drop(track);
    });
  }

  /**
   * Play a short piece of music once, at the music volume, with the background
   * music turned down beneath it and faded back up when it ends.
   */
  sting(src: string): void {
    const volume = this.musicVolume();
    if (volume <= 0 || this.hidden) return;
    this.stingTrack?.pause();
    const track = this.env.createTrack(src);
    track.loop = false;
    track.volume = volume;
    this.stingTrack = track;
    const done = () => {
      if (track !== this.stingTrack) return;
      this.stingTrack = null;
      if (this.current) this.fade(this.current, this.musicVolume());
    };
    track.addEventListener("ended", done);
    track.addEventListener("error", done);
    if (this.current) this.fade(this.current, volume * STING_DUCK);
    // Refused before the first gesture: then the music just stays as it was.
    void track.play().catch(done);
  }

  /** A short synthesised effect. */
  play(effect: Effect): void {
    const volume = this.settings.muted ? 0 : this.settings.effects;
    if (volume <= 0 || this.hidden || typeof AudioContext === "undefined") return;
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const out = ctx.createGain();
    out.gain.value = volume * 0.5;
    out.connect(ctx.destination);
    const now = ctx.currentTime;

    const tone = (freq: number, start: number, length: number, type: OscillatorType, gain: number, slideTo?: number) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + start + length);
      env.gain.setValueAtTime(0.0001, now + start);
      env.gain.exponentialRampToValueAtTime(gain, now + start + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(env).connect(out);
      osc.start(now + start);
      osc.stop(now + start + length + 0.05);
    };

    /** Fading white noise through a sweeping filter. */
    const noise = (length: number, type: BiquadFilterType, from: number, to: number, gain: number) => {
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * length, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(from, now);
      filter.frequency.exponentialRampToValueAtTime(to, now + length * 0.9);
      const env = ctx.createGain();
      env.gain.value = gain;
      src.connect(filter).connect(env).connect(out);
      src.start(now);
    };

    switch (effect) {
      case "click":
        tone(1800, 0, 0.045, "triangle", 0.18, 1200);
        break;
      case "select":
        tone(660, 0, 0.09, "sine", 0.25);
        tone(990, 0.05, 0.12, "sine", 0.2);
        break;
      case "turn":
        // A filtered noise whoosh under a rising two-note chime.
        noise(0.6, "bandpass", 300, 2400, 0.25);
        tone(523, 0.18, 0.5, "sine", 0.22);
        tone(784, 0.3, 0.7, "sine", 0.2);
        break;
      case "alert":
        tone(880, 0, 0.14, "square", 0.08);
        tone(660, 0.16, 0.22, "square", 0.08);
        break;
      case "fanfare":
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.5, "sawtooth", 0.06));
        break;
      case "boom":
        noise(0.9, "lowpass", 1400, 90, 0.6);
        tone(110, 0, 0.5, "sine", 0.35, 40);
        break;
      case "zap":
        tone(320, 0, 0.35, "sine", 0.2, 1400);
        tone(1400, 0.05, 0.2, "triangle", 0.08, 500);
        break;
      case "sparkle":
        // A cascade of high bell tones, for a celebration.
        [1568, 2093, 1760, 2637, 2349, 3136].forEach((f, i) => tone(f, 0.05 + i * 0.07, 0.6, "sine", 0.08));
        break;
      case "warp":
        noise(1.4, "bandpass", 120, 5000, 0.35);
        tone(90, 0, 1.3, "sawtooth", 0.06, 900);
        break;
    }
  }
}

export const audio = new AudioDirector();

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(audio.subscribe, audio.getSettings);
}
