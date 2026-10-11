import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked for reduced motion. Safe where matchMedia is missing. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCE).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(REDUCE);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * Becomes true once the element has entered the viewport, then stays true.
 * Without IntersectionObserver (old browsers, tests) it is true immediately so nothing stays hidden.
 */
export function useSeenOnce<T extends Element>(threshold = 0.25, rootMargin = "0px 0px -10% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold, rootMargin]);
  return [ref, seen] as const;
}

/** Pointer handler for `.lp-spot` cards: moves the glow to follow the cursor. */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/**
 * Click ripple. Drop <Ripple /> inside any positioned element; it listens for presses on
 * its parent and spreads a soft circle from the pointer. Hidden under reduced motion (CSS).
 */
export function Ripple() {
  const ref = useRef<HTMLSpanElement>(null);
  const [drop, setDrop] = useState<{ x: number; y: number; k: number } | null>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const down = (e: globalThis.PointerEvent) => {
      const r = host.getBoundingClientRect();
      setDrop({ x: e.clientX - r.left, y: e.clientY - r.top, k: e.timeStamp });
    };
    host.addEventListener("pointerdown", down);
    return () => host.removeEventListener("pointerdown", down);
  }, []);
  return (
    <span ref={ref} aria-hidden="true" className="lp-ripple">
      {drop ? <span key={drop.k} style={{ left: drop.x, top: drop.y }} onAnimationEnd={() => setDrop(null)} /> : null}
    </span>
  );
}
