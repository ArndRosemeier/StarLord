import { useSyncExternalStore } from "react";

/**
 * Music and sound effects. Music tracks are generated mp3s in public/audio and
 * crossfade when the mood changes; effects are synthesised with WebAudio so
 * they cost no downloads. Browsers only allow sound after the first click or
 * key press, so playback starts (or resumes) on the first gesture.
 */
export type Mood = "menu" | "galaxy" | "combat" | "victory" | "defeat" | "none";
export type Effect = "click" | "select" | "turn" | "alert" | "fanfare" | "boom" | "zap" | "warp";

const PLAYLISTS: Record<Exclude<Mood, "none">, { tracks: string[]; loop: boolean }> = {
  menu: { tracks: ["audio/menu.mp3"], loop: true },
  galaxy: { tracks: ["audio/galaxy-1.mp3", "audio/galaxy-2.mp3"], loop: true },
  combat: { tracks: ["audio/combat.mp3"], loop: true },
  victory: { tracks: ["audio/victory.mp3"], loop: false },
  defeat: { tracks: ["audio/defeat.mp3"], loop: false },
};
const FADE_MS = 1200;

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

class AudioDirector {
  settings = loadSettings();
  private listeners = new Set<() => void>();
  private mood: Mood = "none";
  private current: HTMLAudioElement | null = null;
  private trackIndex = 0;
  private fades = new WeakMap<HTMLAudioElement, number>();
  private ctx: AudioContext | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.current?.paused && this.mood !== "none") void this.current.play().catch(() => {});
      void this.ctx?.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSettings = () => this.settings;

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Settings just don't persist.
    }
    if (this.current) {
      this.fades.delete(this.current);
      this.current.volume = this.musicVolume();
    }
    for (const fn of this.listeners) fn();
  }

  private musicVolume(): number {
    return this.settings.muted ? 0 : this.settings.music;
  }

  /** Switch the background music; the same mood again keeps the current track playing. */
  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.trackIndex = 0;
    this.fadeOut(this.current);
    this.current = null;
    if (mood !== "none") this.start();
  }

  private start(): void {
    if (this.mood === "none") return;
    const list = PLAYLISTS[this.mood];
    const audio = new Audio(list.tracks[this.trackIndex % list.tracks.length]);
    audio.loop = list.loop && list.tracks.length === 1;
    audio.volume = 0;
    audio.addEventListener("ended", () => {
      if (audio !== this.current || !list.loop) return;
      this.trackIndex++;
      this.current = null;
      this.start();
    });
    this.current = audio;
    // Rejected until the first gesture; the unlock listener retries.
    void audio.play().catch(() => {});
    this.fade(audio, this.musicVolume());
  }

  private fade(audio: HTMLAudioElement, to: number, done?: () => void): void {
    const from = audio.volume;
    const t0 = performance.now();
    const id = (this.fades.get(audio) ?? 0) + 1;
    this.fades.set(audio, id);
    const tick = () => {
      if (this.fades.get(audio) !== id) return; // A newer fade on this track took over.
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(tick);
      else done?.();
    };
    requestAnimationFrame(tick);
  }

  private fadeOut(audio: HTMLAudioElement | null): void {
    if (!audio) return;
    this.fade(audio, 0, () => {
      audio.pause();
      audio.src = "";
    });
  }

  /** A short synthesised effect. */
  play(effect: Effect): void {
    const volume = this.settings.muted ? 0 : this.settings.effects;
    if (volume <= 0 || typeof AudioContext === "undefined") return;
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
