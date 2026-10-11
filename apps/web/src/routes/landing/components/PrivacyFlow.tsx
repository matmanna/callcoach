import { cn } from "cn";
import type { CSSProperties } from "react";
import { privacyFlow as copy } from "../copy.ts";
import { PortedEdge } from "./Edge.tsx";
import { spotlight } from "./motion.tsx";

/** One node in the diagram. Hover lifts it and lights it with the zone's tint. */
function Node({ title, body, dot, spot }: { title: string; body: string; dot: string; spot: string }) {
  return (
    <div
      tabIndex={0}
      onPointerMove={spotlight}
      style={{ "--spot": spot } as CSSProperties}
      className="lp-lift lp-spot lp-rim group flex items-start gap-3 rounded-xl border border-(--lp-hairline) bg-white px-4 py-3 shadow-(--lp-shadow) outline-none"
    >
      <span aria-hidden="true" className={cn("lp-icon mt-1.5 size-2.5 shrink-0 rounded-full", dot)} />
      <span>
        <span className="block text-[0.95rem] font-medium">{title}</span>
        <span className="block text-sm text-(--lp-ink-soft)">{body}</span>
      </span>
    </div>
  );
}

/** Vertical edge between nodes, offset to line up with the node dots. */
function Link({ delay }: { delay: number }) {
  return (
    <div aria-hidden="true" className="flex h-11 pl-[1.1rem]">
      <PortedEdge axis="y" delay={delay} />
    </div>
  );
}

/**
 * Where a call note goes, as a small node diagram with live edges. The device zone and the
 * server zone are separate tinted panels; the edge between them is the only way across.
 */
export function PrivacyFlow() {
  const n = copy.deviceSteps.length;
  return (
    <div role="group" aria-label={copy.label} className="max-w-md">
      <div className="rounded-3xl bg-(--lp-sky-soft) p-4 ring-1 ring-(--lp-sky-ink)/10">
        <p className="lp-eyebrow mb-3 !text-(--lp-sky-ink)">{copy.device}</p>
        <ol>
          {copy.deviceSteps.map((s, i) => (
            <li key={s.title}>
              {i > 0 ? <Link delay={(i - 1) * 0.8} /> : null}
              <Node title={s.title} body={s.body} dot="bg-(--lp-sky)" spot="var(--lp-sky)" />
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center gap-3 py-0.5 pl-[2.1rem]">
        <div className="flex h-16">
          <PortedEdge axis="y" delay={(n - 1) * 0.8} />
        </div>
        <p className="text-xs font-medium text-(--lp-sage-ink)">{copy.boundary}</p>
      </div>
      <div className="rounded-3xl bg-(--lp-sage-soft) p-4 ring-1 ring-(--lp-sage-ink)/10">
        <p className="lp-eyebrow mb-3 !text-(--lp-sage-ink)">{copy.server}</p>
        <ol>
          {copy.serverSteps.map((s, i) => (
            <li key={s.title}>
              {i > 0 ? <Link delay={(n + i) * 0.8} /> : null}
              <Node title={s.title} body={s.body} dot="bg-(--lp-sage)" spot="var(--lp-sage)" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
