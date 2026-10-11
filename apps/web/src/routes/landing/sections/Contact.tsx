import { lazy, Suspense } from "react";
import { useSeenOnce } from "../components/motion.tsx";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { contact } from "../copy.ts";

// The form pulls in Zod and the Select popover, so it loads only as the section nears the viewport.
const ContactForm = lazy(async () => ({ default: (await import("../components/ContactForm.tsx")).ContactForm }));

export function Contact() {
  const [ref, near] = useSeenOnce<HTMLDivElement>(0, "600px 0px");
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-16 pb-20 sm:pb-28">
      <Container>
        <div className="grid gap-10 rounded-3xl border border-(--lp-hairline) bg-linear-to-br from-(--lp-butter-soft) via-white to-(--lp-sky-soft) p-6 sm:p-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16 lg:p-14">
          <SectionHeading id="contact-title" eyebrow={contact.eyebrow} title={contact.title}>
            <p>{contact.body}</p>
          </SectionHeading>
          {/* min-height matches the form so loading it causes no layout shift. */}
          <div ref={ref} className="min-h-[34rem] sm:min-h-[27rem]">
            {near ? (
              <Suspense fallback={null}>
                <ContactForm />
              </Suspense>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
