import { LogoWall, type Logo } from "../components/LogoWall.tsx";
import { Container } from "../components/SectionHeading.tsx";
import { examples } from "../copy.ts";

/** Real logos go in `logos` only with written permission on file. Empty shows placeholders. */
const LOGOS: Logo[] = [];

export function Examples() {
  return (
    <section aria-labelledby="examples-title" className="pb-20 sm:pb-28">
      <Container>
        <div className="rounded-3xl border border-(--lp-hairline) bg-white/60 p-6 sm:p-10">
          <p className="lp-eyebrow">{examples.eyebrow}</p>
          <h2 id="examples-title" className="sr-only">
            {examples.title}
          </h2>
          <div className="mt-6">
            <LogoWall logos={LOGOS} placeholderCount={examples.placeholderCount} placeholderLabel={examples.placeholderLabel} />
          </div>
          <p className="mt-6 text-sm text-(--lp-ink-soft)">{examples.note}</p>
        </div>
      </Container>
    </section>
  );
}
