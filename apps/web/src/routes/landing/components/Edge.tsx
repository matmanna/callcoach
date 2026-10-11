import { cn } from "cn";
import type { CSSProperties } from "react";

/**
 * A flowchart edge: solid hairline, with a soft light beam gliding along it on a loop.
 * `delay` (seconds) staggers beams so consecutive edges read as one flow.
 * Under reduced motion the beam is hidden and the plain line stays.
 */
export function Edge({ axis = "x", delay = 0, className }: { axis?: "x" | "y"; delay?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("lp-edge block", axis === "y" ? "lp-edge-y w-[2px]" : "h-[2px]", className)} style={{ "--bd": `${delay}s` } as CSSProperties}>
      <i />
    </span>
  );
}

/** Edge with a port at each end, for joining two nodes. */
export function PortedEdge({ axis = "x", delay = 0, className }: { axis?: "x" | "y"; delay?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex items-center", axis === "y" ? "flex-col" : "flex-row", className)}>
      <span className="lp-port relative z-10 shrink-0" />
      <Edge axis={axis} delay={delay} className={axis === "y" ? "-my-0.5 flex-1" : "-mx-0.5 flex-1"} />
      <span className="lp-port relative z-10 shrink-0" />
    </span>
  );
}
