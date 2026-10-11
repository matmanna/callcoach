import type { CSSProperties } from "react";
import { spotlight } from "../components/motion.tsx";
import { PrivacyFlow } from "../components/PrivacyFlow.tsx";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { principles } from "../copy.ts";

export function Principles() {
  return (
    <section id="principles" aria-labelledby="principles-title" className="lp-band scroll-mt-16 py-20 sm:py-28" style={{ "--band": "var(--lp-sage-soft)" } as CSSProperties}>
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div>
          <SectionHeading id="principles-title" eyebrow={principles.eyebrow} title={principles.title} />
          <div className="mt-10">
            <PrivacyFlow />
          </div>
        </div>
        <ol className="grid content-start gap-4 sm:grid-cols-2 lg:mt-24">
          {principles.items.map((p, i) => (
            <li key={p.title}>
              <article
                tabIndex={0}
                onPointerMove={spotlight}
                className="lp-lift lp-spot lp-rim h-full rounded-2xl border border-(--lp-hairline) bg-white/75 p-6 outline-none hover:bg-white"
              >
                <span className="lp-eyebrow !text-(--lp-sage-ink)" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-xl leading-snug">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-(--lp-ink-soft)">{p.body}</p>
              </article>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
