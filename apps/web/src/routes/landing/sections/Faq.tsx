import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Container, SectionHeading } from "../components/SectionHeading.tsx";
import { faq } from "../copy.ts";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading id="faq-title" eyebrow={faq.eyebrow} title={faq.title} />
        <Accordion type="single" collapsible className="rounded-2xl border border-(--lp-hairline) bg-(--lp-surface) px-2 shadow-(--lp-shadow) sm:px-3">
          {faq.items.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i}`} className="border-(--lp-line) px-4 transition-colors duration-300 hover:bg-(--lp-sage-soft)/40 data-[state=open]:bg-(--lp-sage-soft)/30 sm:px-5">
              <AccordionTrigger className="py-5 text-base font-medium hover:no-underline sm:text-lg">{item.q}</AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-(--lp-ink-soft)">
                <p>{item.a}</p>
                {"link" in item && item.link ? (
                  <p>
                    <a href={item.link.href}>{item.link.label}</a>
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}
