import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Shared eye candy for the in-game screens: painted backdrops with drifting
 * stars, animated numbers and the turn banner. Everything here is cosmetic
 * and turns itself down when the player asks the system for reduced motion.
 */

const motionQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function prefersReducedMotion(): boolean {
  return motionQuery?.matches ?? false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      motionQuery?.addEventListener("change", fn);
      return () => motionQuery?.removeEventListener("change", fn);
    },
    prefersReducedMotion,
    () => false,
  );
}

/** Painted backdrop per screen, in public/art/bg. */
export type BackdropArt =
  | "colonies" | "research" | "shipyard" | "fleets" | "diplomacy" | "espionage" | "leaders" | "empire" | "reports" | "galaxy";

const artUrl = (art: BackdropArt) => (art === "galaxy" ? "art/galaxy.webp" : `art/bg/${art}.webp`);

/** The current screen's art, crossfading from the previous one, with a field of drifting stars on top. */
export function ScreenBackdrop({ art }: { art: BackdropArt }) {
  const [layers, setLayers] = useState<{ art: BackdropArt; key: number }[]>([{ art, key: 0 }]);
  useEffect(() => {
    setLayers((prev) => (prev[prev.length - 1]!.art === art ? prev : [...prev.slice(-1), { art, key: prev[prev.length - 1]!.key + 1 }]));
  }, [art]);
  return (
    <div className="backdrop" aria-hidden>
      {layers.map((l, i) => (
        <div key={l.key} className={`backdrop-art${i === layers.length - 1 ? " current" : " leaving"}`}
          style={{ backgroundImage: `url(${artUrl(l.art)})` }}
          onAnimationEnd={() => i < layers.length - 1 && setLayers((p) => p.filter((x) => x.key !== l.key))} />
      ))}
      <div className="backdrop-shade" />
      <StarDust />
    </div>
  );
}

interface Mote { x: number; y: number; z: number; r: number; phase: number; hue: number }
interface Streak { x: number; y: number; vx: number; vy: number; life: number }

/** Slowly drifting, twinkling stars with the odd shooting star. Capped at 30 frames a second and paused while hidden. */
export function StarDust({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let motes: Mote[] = [];
    const streaks: Streak[] = [];
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(((w * h) / 9000) * density);
      motes = Array.from({ length: Math.min(260, n) }, () => ({
        x: Math.random() * w, y: Math.random() * h, z: Math.random(),
        r: 0.4 + Math.random() * 1.3, phase: Math.random() * Math.PI * 2, hue: Math.random(),
      }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        const tw = 0.55 + 0.45 * Math.sin(t * 0.0015 * (0.6 + m.z) + m.phase);
        ctx.globalAlpha = (0.15 + m.z * 0.6) * tw;
        ctx.fillStyle = m.hue < 0.15 ? "#ffd9a0" : m.hue < 0.35 ? "#a9c8ff" : "#ffffff";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * (0.6 + m.z * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of streaks) {
        const a = Math.min(1, s.life / 20);
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
        grad.addColorStop(1, "rgba(160,200,255,0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    observer.observe(canvas);
    if (reduced) {
      draw(0);
      return () => observer.disconnect();
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(100, t - last) / 16.7;
      last = t;
      for (const m of motes) {
        m.x -= (0.04 + m.z * 0.16) * dt;
        m.y += (0.01 + m.z * 0.03) * dt;
        if (m.x < -4) m.x = w + 4;
        if (m.y > h + 4) m.y = -4;
      }
      if (streaks.length < 2 && Math.random() < 0.004 * dt) {
        const fromLeft = Math.random() < 0.5;
        streaks.push({ x: fromLeft ? Math.random() * w * 0.5 : w * (0.5 + Math.random() * 0.5), y: Math.random() * h * 0.4,
          vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4), vy: 2 + Math.random() * 2, life: 40 + Math.random() * 30 });
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i]!;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0) streaks.splice(i, 1);
      }
      draw(t);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [reduced, density]);
  return <canvas ref={ref} className="stardust" />;
}

/** A number that rolls to its new value and flashes green or red when it changes. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; key: number } | null>(null);
  const from = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    setFlash((f) => ({ dir: value > start ? "up" : "down", key: (f?.key ?? 0) + 1 }));
    if (reduced) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(k >= 1 ? value : start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span key={flash?.key} className={flash ? `num-flash ${flash.dir}` : undefined}>{format(shown)}</span>;
}

/** A big "Turn N" sweep across the screen whenever a new turn begins. */
export function TurnBanner({ turn, quiet }: { turn: number; quiet: boolean }) {
  const [shown, setShown] = useState<number | null>(null);
  const last = useRef(turn);
  useEffect(() => {
    if (turn === last.current) return;
    last.current = turn;
    if (quiet || prefersReducedMotion()) return;
    setShown(turn);
    const t = setTimeout(() => setShown(null), 1700);
    return () => clearTimeout(t);
  }, [turn, quiet]);
  if (shown === null) return null;
  return (
    <div className="turn-banner" key={shown} aria-hidden>
      <div className="turn-banner-streak" />
      <div className="turn-banner-text"><small>Stardate</small>Turn {shown}</div>
    </div>
  );
}

/** Small line icons for the resources in the top bar and elsewhere. */
export type IconName = "bc" | "food" | "industry" | "research" | "command" | "population" | "turn";

const ICON_PATHS: Record<IconName, string> = {
  bc: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3.5v11M15 9c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2-3-.8-3-2",
  food: "M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Zm0-4c-2 0-3.5-1.5-3.5-4C10.5 5 12 6.5 12 9Zm0 0c2 0 3.5-1.5 3.5-4C13.5 5 12 6.5 12 9Z",
  industry: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3",
  research: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9",
  command: "m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z",
  population: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.3c1.8.8 3 2.8 3 5.7",
  turn: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2M21 3v5h-5",
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
