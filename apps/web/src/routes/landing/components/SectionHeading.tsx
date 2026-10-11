import { cn } from "cn";
import type { ReactNode } from "react";

/** Eyebrow + h2 used by every section, so heading order stays h1 → h2 → h3. */
export function SectionHeading({ id, eyebrow, title, children, className }: { id: string; eyebrow: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl leading-tight sm:text-4xl">
        {title}
      </h2>
      {children ? <div className="mt-4 text-lg leading-relaxed text-(--lp-ink-soft)">{children}</div> : null}
    </div>
  );
}

/** Page-width container with the 16px phone gutter. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}
