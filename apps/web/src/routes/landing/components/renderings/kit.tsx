/**
 * Building blocks for the illustrated product screens shown in recording slots until real
 * screen recordings exist. Everything here is decorative (the slot's caption carries the
 * meaning) and every name and value is synthetic.
 */
import { cn } from "cn";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const W = 800;
export const H = 500;

/**
 * Draws children on a fixed 800×500 canvas and scales it to the slot's width, so the
 * mock screens keep their proportions from phone to desktop.
 */
export function Canvas({ children, className, interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setScale(entry.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    // Decorative by default. An interactive canvas is exposed to assistive tech, so its controls work.
    <div ref={ref} aria-hidden={interactive ? undefined : "true"} className="absolute inset-0 overflow-hidden">
      <div className={cn("absolute top-0 left-0 origin-top-left text-[13px] text-(--lp-ink)", className)} style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export type Tone = "sage" | "blush" | "butter" | "sky";
const TONES: Record<Tone, string> = {
  sage: "bg-(--lp-sage-soft) text-(--lp-sage-ink)",
  blush: "bg-(--lp-blush-soft) text-(--lp-blush-ink)",
  butter: "bg-(--lp-butter-soft) text-(--lp-butter-ink)",
  sky: "bg-(--lp-sky-soft) text-(--lp-sky-ink)",
};
const SOLID: Record<Tone, string> = {
  sage: "bg-(--lp-sage)",
  blush: "bg-(--lp-blush)",
  butter: "bg-(--lp-butter)",
  sky: "bg-(--lp-sky)",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function Avatar({ initials, tone, size = 30 }: { initials: string; tone: Tone; size?: number }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-(--lp-ink)/80", SOLID[tone])} style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

/** Skeleton line standing in for text that doesn't matter in the illustration. */
export function Bar({ w, className }: { w: number | string; className?: string }) {
  return <span className={cn("block h-2 rounded-full bg-(--lp-ink)/[0.08]", className)} style={{ width: w }} />;
}

export function Tick({ done = true }: { done?: boolean }) {
  return (
    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[10px] leading-none", done ? "bg-(--lp-sage-ink) text-white" : "border border-(--lp-ink)/15")}>
      {done ? "✓" : ""}
    </span>
  );
}

/**
 * Curved edge between two panels in an illustration: hairline path, a light beam gliding
 * along it, and a port at each end. `d` is an SVG path in canvas coordinates.
 */
export function CanvasEdge({ d, from, to, delay = 0 }: { d: string; from: [number, number]; to: [number, number]; delay?: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-10" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <path d={d} stroke="var(--lp-edge)" strokeWidth="2" />
      <path d={d} pathLength={100} stroke="var(--lp-beam)" strokeWidth="2" strokeLinecap="round" className="lp-svg-beam" style={{ "--bd": `${delay}s` } as CSSProperties} />
      {[from, to].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill="white" stroke="var(--lp-edge)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

/** Moves a whole illustration down so it sits centered in the canvas. */
export function Shift({ y, children }: { y: number; children: ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ transform: `translateY(${y}px)` }}>
      {children}
    </div>
  );
}

/** White app panel with a soft shadow. */
export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("rounded-2xl bg-white shadow-[0_1px_2px_rgb(47_58_64/0.05),0_18px_40px_-20px_rgb(47_58_64/0.28)]", className)} style={style}>
      {children}
    </div>
  );
}

/** Pastel backdrop with soft washes, behind every illustration. */
export function Backdrop({ a, b }: { a: Tone; b: Tone }) {
  const color: Record<Tone, string> = {
    sage: "var(--lp-sage-soft)",
    blush: "var(--lp-blush-soft)",
    butter: "var(--lp-butter-soft)",
    sky: "var(--lp-sky-soft)",
  };
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(60% 70% at 15% 10%, ${color[a]}, transparent 70%), radial-gradient(60% 70% at 90% 95%, ${color[b]}, transparent 70%), var(--lp-bg)`,
      }}
    />
  );
}
