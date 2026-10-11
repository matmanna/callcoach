import { cn } from "cn";
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { PortedEdge } from "./Edge.tsx";
import { spotlight, usePrefersReducedMotion, Ripple, useSeenOnce } from "./motion.tsx";

export type FlowStep = { key: string; title: string; body?: string; decides?: string };

/** One pastel per step, in order. Text on each tint passes AA (see landing.css). */
const TINTS = [
  { bg: "bg-(--lp-sage-soft)", ink: "text-(--lp-sage-ink)", dot: "bg-(--lp-sage)", spot: "var(--lp-sage)", bar: "bg-(--lp-sage-ink)/50" },
  { bg: "bg-(--lp-butter-soft)", ink: "text-(--lp-butter-ink)", dot: "bg-(--lp-butter)", spot: "var(--lp-butter)", bar: "bg-(--lp-butter-ink)/50" },
  { bg: "bg-(--lp-blush-soft)", ink: "text-(--lp-blush-ink)", dot: "bg-(--lp-blush)", spot: "var(--lp-blush)", bar: "bg-(--lp-blush-ink)/50" },
  { bg: "bg-(--lp-sky-soft)", ink: "text-(--lp-sky-ink)", dot: "bg-(--lp-sky)", spot: "var(--lp-sky)", bar: "bg-(--lp-sky-ink)/50" },
];

/** Edge between two steps: horizontal with ports on desktop, vertical on mobile. */
function Connector({ index }: { index: number }) {
  const delay = index * 0.8;
  return (
    <div aria-hidden="true" className="flex h-8 shrink-0 items-stretch justify-center md:h-auto md:w-14 md:items-center">
      <PortedEdge className="hidden w-full md:flex" delay={delay} />
      <PortedEdge axis="y" className="md:hidden" delay={delay} />
    </div>
  );
}

/**
 * The four-step flowchart. Steps are joined by animated edges (a light beam gliding along
 * each one). Nothing appears or draws in; reduced motion leaves plain static edges.
 *
 * With `onSelect` it is a tab list: each step selects the illustration shown below it, with
 * arrow-key support. With `autoMs`, the active step shows a progress bar and `onAdvance`
 * fires when it fills (the parent stops this once the visitor picks a step).
 */
export function Flowchart({
  steps,
  active,
  onSelect,
  onAdvance,
  autoMs,
  paused = false,
  panelId,
  label,
}: {
  steps: readonly FlowStep[];
  active?: number;
  onSelect?: (index: number) => void;
  onAdvance?: () => void;
  autoMs?: number;
  paused?: boolean;
  panelId?: string;
  label: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.3);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const interactive = onSelect !== undefined;

  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + steps.length) % steps.length;
    onSelect?.(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      ref={ref}
      data-in-view={seen}
      data-reduced-motion={reduced}
      data-testid="flowchart"
      role={interactive ? "tablist" : "list"}
      aria-label={label}
      aria-orientation={interactive ? "horizontal" : undefined}
      className="flex flex-col md:flex-row md:items-stretch"
    >
      {steps.map((step, i) => {
        const tint = TINTS[i % TINTS.length]!;
        const isActive = interactive && active === i;
        const nodeStyle = { "--spot": tint.spot } as CSSProperties;
        const content: ReactNode = (
          <>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-2 rounded-full transition-colors duration-500", isActive || !interactive ? tint.dot : "bg-(--lp-line)")} />
              <span className={cn("lp-eyebrow", isActive ? tint.ink : undefined)}>{String(i + 1).padStart(2, "0")}</span>
            </span>
            <span className="text-lg font-medium">{step.title}</span>
            {step.body ? <span className="text-sm leading-relaxed text-(--lp-ink-soft)">{step.body}</span> : null}
            {step.decides ? <span className={cn("mt-auto pt-2 text-sm font-medium", isActive ? tint.ink : "text-(--lp-ink-soft)")}>{step.decides}</span> : null}
          </>
        );
        return (
          <div key={step.key} className="contents">
            {i > 0 ? <Connector index={i - 1} /> : null}
            {interactive ? (
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`flow-tab-${step.key}`}
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect?.(i)}
                onKeyDown={(e) => onKey(e, i)}
                onPointerMove={spotlight}
                style={nodeStyle}
                className={cn(
                  "lp-lift lp-press lp-spot lp-rim group relative flex flex-1 cursor-pointer flex-col items-start gap-2 overflow-hidden rounded-2xl border p-5 text-left",
                  isActive ? cn(tint.bg, "border-transparent shadow-(--lp-shadow)") : "border-(--lp-hairline) bg-white/70 hover:bg-white",
                )}
              >
                <Ripple />
                {content}
                {isActive && autoMs && !reduced && seen ? (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/60">
                    <span
                      key={step.key}
                      className={cn("lp-progress block h-full", tint.bar)}
                      data-paused={paused}
                      style={{ "--dur": `${autoMs}ms` } as CSSProperties}
                      onAnimationEnd={onAdvance}
                    />
                  </span>
                ) : null}
              </button>
            ) : (
              <div role="listitem" style={nodeStyle} className={cn("flex flex-1 flex-col items-start gap-2 rounded-2xl p-5", tint.bg)}>
                {content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
