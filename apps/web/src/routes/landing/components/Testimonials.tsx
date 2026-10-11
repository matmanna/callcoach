import { testimonials as copy } from "../copy.ts";
import { Container, SectionHeading } from "./SectionHeading.tsx";

/** Add an entry only with written permission and a named source on file. */
export type Testimonial = { quote: string; name: string; role: string; organization: string };

/** Renders nothing at all when there are no testimonials. */
export function Testimonials({ items = [] }: { items?: readonly Testimonial[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="testimonials-title" className="py-20 sm:py-28">
      <Container>
        <SectionHeading id="testimonials-title" eyebrow={copy.eyebrow} title={copy.title} />
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {items.map((t) => (
            <li key={`${t.name}-${t.organization}`}>
              <figure className="h-full rounded-2xl bg-(--lp-surface) p-7 shadow-(--lp-shadow)">
                <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-5 text-sm text-(--lp-ink-soft)">
                  <span className="font-medium text-(--lp-ink)">{t.name}</span>, {t.role}, {t.organization}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
